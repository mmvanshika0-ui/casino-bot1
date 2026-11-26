const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const GRID_SIZE  = 25; // 5x5

function createGrid(mineCount) {
  const cells = Array(GRID_SIZE).fill('gem');
  const positions = [];
  while (positions.length < mineCount) {
    const p = Math.floor(Math.random() * GRID_SIZE);
    if (!positions.includes(p)) positions.push(p);
  }
  positions.forEach(p => { cells[p] = 'mine'; });
  return { cells, revealed: Array(GRID_SIZE).fill(false), mineCount, gemsFound: 0 };
}

function multiplier(mineCount, gemsFound) {
  if (gemsFound === 0) return 1;
  const totalGems = GRID_SIZE - mineCount;
  let mult = 1;
  for (let i = 0; i < gemsFound; i++) {
    mult *= (GRID_SIZE - mineCount - i) / (GRID_SIZE - i);
  }
  return parseFloat((0.99 / mult).toFixed(3));
}

function buildGrid(state) {
  const rows = [];
  for (let row = 0; row < 5; row++) {
    const components = [];
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      const rev = state.grid.revealed[idx];
      const cell = state.grid.cells[idx];

      let emoji = '⬜', style = ButtonStyle.Secondary, disabled = false;

      if (rev) {
        emoji    = cell === 'mine' ? '💣' : '💎';
        style    = cell === 'mine' ? ButtonStyle.Danger : ButtonStyle.Success;
        disabled = true;
      } else if (state.status !== 'playing') {
        emoji    = cell === 'mine' ? '💣' : '⬜';
        disabled = true;
      }

      components.push(
        new ButtonBuilder()
          .setCustomId(`mines:reveal:${state.id}:${idx}`)
          .setEmoji(emoji)
          .setStyle(style)
          .setDisabled(disabled || state.status !== 'playing')
      );
    }
    rows.push(new ActionRowBuilder().addComponents(components));
  }

  if (state.status === 'playing' && state.grid.gemsFound > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mines:cashout:${state.id}`)
        .setLabel(`💸 Cash Out — 🪙 ${formatBalance(Math.floor(state.bet * multiplier(state.grid.mineCount, state.grid.gemsFound)))}`)
        .setStyle(ButtonStyle.Success)
    ));
  }

  return rows;
}

function buildEmbed(state, discordUser) {
  const mult    = multiplier(state.grid.mineCount, state.grid.gemsFound);
  const payout  = Math.floor(state.bet * mult);
  const statusColors = { playing: config.colors.info, win: config.colors.success, loss: config.colors.danger };

  return new EmbedBuilder()
    .setColor(statusColors[state.status] || config.colors.info)
    .setTitle('💎 Mines')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '💣 Mines',      value: `${state.grid.mineCount}`, inline: true },
      { name: '💎 Gems Found', value: `${state.grid.gemsFound}`, inline: true },
      { name: '📈 Multiplier', value: `${mult}x`,                inline: true },
      { name: '💰 Bet',        value: `🪙 ${formatBalance(state.bet)}`,    inline: true },
      { name: '💸 Potential',  value: `🪙 ${formatBalance(payout)}`,       inline: true },
      { name: '📊 Status',     value: state.status === 'playing' ? '🎮 Active' : state.status === 'win' ? '🏆 Cashed Out' : '💀 Hit a Mine', inline: true },
    )
    .setFooter({ text: 'Casino Bot • Mines' })
    .setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId, idxStr] = parts;
  const state = client.activeGames.get(gameId);

  if (!state || state.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  }
  if (state.status !== 'playing') {
    return interaction.reply({ content: '❌ Game already ended.', ephemeral: true });
  }

  await interaction.deferUpdate();

  if (action === 'reveal') {
    const idx  = parseInt(idxStr);
    state.grid.revealed[idx] = true;

    if (state.grid.cells[idx] === 'mine') {
      state.status = 'loss';
      // reveal all mines
      state.grid.cells.forEach((c, i) => { if (c === 'mine') state.grid.revealed[i] = true; });
      await recordLoss(interaction.user.id, 'mines');
      client.activeGames.delete(gameId);
    } else {
      state.grid.gemsFound++;
      const totalGems = GRID_SIZE - state.grid.mineCount;
      if (state.grid.gemsFound >= totalGems) {
        // found all gems
        state.status = 'win';
        const mult   = multiplier(state.grid.mineCount, state.grid.gemsFound);
        const payout = Math.floor(state.bet * mult);
        await payoutWin(interaction.user.id, payout, 'mines');
        client.activeGames.delete(gameId);
      }
    }

  } else if (action === 'cashout') {
    const mult   = multiplier(state.grid.mineCount, state.grid.gemsFound);
    const payout = Math.floor(state.bet * mult);
    state.status = 'win';
    await payoutWin(interaction.user.id, payout, 'mines');
    client.activeGames.delete(gameId);
  }

  const embed = buildEmbed(state, interaction.user);
  const grid  = buildGrid(state);
  await interaction.editReply({ embeds: [embed], components: grid });
};

module.exports.startGame = function (userId, bet, mineCount = 3) {
  const id = uuidv4();
  return { id, userId, bet, mineCount, status: 'playing', grid: createGrid(mineCount) };
};

module.exports.buildEmbed = buildEmbed;
module.exports.buildGrid  = buildGrid;
