const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const LANES  = 5;
const ROWS   = 7;

function generateRoad() {
  return Array.from({ length: ROWS }, (_, r) => {
    const dangerLanes = r < 2 ? 1 : r < 4 ? 2 : r < 6 ? 3 : 4;
    const road = Array(LANES).fill('safe');
    const taken = [];
    while (taken.length < dangerLanes) {
      const l = Math.floor(Math.random() * LANES);
      if (!taken.includes(l)) { taken.push(l); road[l] = 'car'; }
    }
    return road;
  });
}

function calculateMultiplier(row) {
  return parseFloat((1 + row * 0.4).toFixed(2));
}

function buildRoadDisplay(state) {
  const { road, currentRow, chickenCol, revealedRows, status } = state;
  const rows = [];

  for (let r = ROWS - 1; r >= Math.max(0, currentRow - 1); r--) {
    const isActive   = r === currentRow && status === 'playing';
    const isRevealed = r < currentRow;
    const components = [];

    for (let c = 0; c < LANES; c++) {
      const cell      = road[r][c];
      const isChicken = r === currentRow - 1 && c === chickenCol;
      let emoji = '🛣️', style = ButtonStyle.Secondary, disabled = !isActive;

      if (isChicken && isRevealed) { emoji = '🐔'; style = ButtonStyle.Success; disabled = true; }
      else if (isRevealed) {
        emoji    = cell === 'car' ? '🚗' : '✅';
        style    = cell === 'car' ? ButtonStyle.Danger : ButtonStyle.Success;
        disabled = true;
      }

      components.push(
        new ButtonBuilder()
          .setCustomId(`chicken:move:${state.id}:${r}:${c}`)
          .setEmoji(emoji)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }
    rows.push(new ActionRowBuilder().addComponents(components));
    if (rows.length >= 4) break;
  }

  if (status === 'playing' && currentRow > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`chicken:cashout:${state.id}`)
        .setLabel(`🐔 Cash Out — 🪙 ${formatBalance(Math.floor(state.bet * calculateMultiplier(currentRow)))}`)
        .setStyle(ButtonStyle.Success)
    ));
  }

  return rows;
}

function buildEmbed(state, discordUser) {
  const mult   = calculateMultiplier(state.currentRow);
  const payout = Math.floor(state.bet * mult);

  return new EmbedBuilder()
    .setColor(state.status === 'win' ? config.colors.success : state.status === 'loss' ? config.colors.danger : config.colors.warning)
    .setTitle('🐔 Chicken Cross')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🛣️ Row',       value: `${state.currentRow}/${ROWS}`,    inline: true },
      { name: '📈 Multiplier',value: `${mult}x`,                        inline: true },
      { name: '💰 Bet',       value: `🪙 ${formatBalance(state.bet)}`,  inline: true },
      { name: '💸 Potential', value: `🪙 ${formatBalance(payout)}`,     inline: true },
      { name: '📊 Status',    value: state.status === 'playing' ? '🐔 Crossing...' : state.status === 'win' ? '🏆 Made It!' : '💥 Hit by a Car!', inline: true },
    )
    .setFooter({ text: 'Casino Bot • Chicken Cross' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId, rowStr, colStr] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'cashout') {
    const mult   = calculateMultiplier(state.currentRow);
    const payout = Math.floor(state.bet * mult);
    state.status = 'win';
    await payoutWin(interaction.user.id, payout, 'chicken');
    client.activeGames.delete(gameId);

  } else if (action === 'move') {
    const row = parseInt(rowStr), col = parseInt(colStr);
    if (row !== state.currentRow) return;

    state.chickenCol = col;
    const cell = state.road[row][col];

    if (cell === 'car') {
      state.status = 'loss';
      await recordLoss(interaction.user.id, 'chicken');
      client.activeGames.delete(gameId);
    } else {
      state.currentRow++;
      if (state.currentRow >= ROWS) {
        const payout = Math.floor(state.bet * calculateMultiplier(state.currentRow));
        state.status = 'win';
        await payoutWin(interaction.user.id, payout, 'chicken');
        client.activeGames.delete(gameId);
      }
    }
  }

  await interaction.editReply({ embeds: [buildEmbed(state, interaction.user)], components: buildRoadDisplay(state) });
};

module.exports.startGame = function (userId, bet) {
  return { id: uuidv4(), userId, bet, road: generateRoad(), currentRow: 0, chickenCol: null, status: 'playing' };
};
module.exports.buildEmbed     = buildEmbed;
module.exports.buildRoadDisplay = buildRoadDisplay;
