const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const DIFFICULTIES = {
  easy:   { cols: 4, safeCols: 3, rows: 8  },
  medium: { cols: 3, safeCols: 2, rows: 10 },
  hard:   { cols: 2, safeCols: 1, rows: 12 },
};

function generateRow(cols, safeCols) {
  const row = Array(cols).fill('mine');
  const safePositions = [];
  while (safePositions.length < safeCols) {
    const p = Math.floor(Math.random() * cols);
    if (!safePositions.includes(p)) safePositions.push(p);
  }
  safePositions.forEach(p => { row[p] = 'safe'; });
  return row;
}

function generateTower(difficulty) {
  const { cols, safeCols, rows } = DIFFICULTIES[difficulty];
  return Array.from({ length: rows }, () => generateRow(cols, safeCols));
}

function calculateMultiplier(difficulty, currentRow) {
  const { cols, safeCols } = DIFFICULTIES[difficulty];
  const prob = safeCols / cols;
  return parseFloat((0.97 / Math.pow(prob, currentRow)).toFixed(3));
}

function buildTowerDisplay(state) {
  const { tower, currentRow, difficulty, revealedCells, status } = state;
  const { cols } = DIFFICULTIES[difficulty];
  const rows = [];

  for (let r = tower.length - 1; r >= 0; r--) {
    const isActive   = r === currentRow && status === 'playing';
    const isRevealed = r < currentRow || (status !== 'playing' && r === currentRow);
    const components = [];

    for (let c = 0; c < cols; c++) {
      const cell       = tower[r][c];
      const wasClicked = revealedCells[r] === c;

      let emoji = '⬜', style = ButtonStyle.Secondary, disabled = !isActive;

      if (isRevealed) {
        emoji    = cell === 'mine' ? '💣' : '💎';
        style    = cell === 'mine' ? ButtonStyle.Danger : ButtonStyle.Success;
        disabled = true;
        if (!wasClicked && cell === 'safe') emoji = '⬜';
      }

      components.push(
        new ButtonBuilder()
          .setCustomId(`tower:step:${state.id}:${r}:${c}`)
          .setEmoji(emoji)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }
    rows.push(new ActionRowBuilder().addComponents(components));
    if (rows.length >= 4) break; // Discord limit: 5 rows, 1 for cashout
  }

  if (status === 'playing' && currentRow > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tower:cashout:${state.id}`)
        .setLabel(`💸 Cash Out — 🪙 ${formatBalance(Math.floor(state.bet * calculateMultiplier(difficulty, currentRow)))}`)
        .setStyle(ButtonStyle.Success)
    ));
  }

  return rows;
}

function buildEmbed(state, discordUser) {
  const { difficulty, currentRow, bet, status, tower } = state;
  const mult   = calculateMultiplier(difficulty, currentRow);
  const payout = Math.floor(bet * mult);
  const total  = tower.length;

  return new EmbedBuilder()
    .setColor(status === 'win' ? config.colors.success : status === 'loss' ? config.colors.danger : config.colors.purple)
    .setTitle('🗼 Tower')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🎯 Difficulty', value: difficulty.charAt(0).toUpperCase() + difficulty.slice(1), inline: true },
      { name: '🧱 Floor',      value: `${currentRow}/${total}`,                                  inline: true },
      { name: '📈 Multiplier', value: `${mult}x`,                                                inline: true },
      { name: '💰 Bet',        value: `🪙 ${formatBalance(bet)}`,                                inline: true },
      { name: '💸 Potential',  value: `🪙 ${formatBalance(payout)}`,                             inline: true },
      { name: '📊 Status',     value: status === 'playing' ? '🎮 Climbing...' : status === 'win' ? '🏆 Cashed Out' : '💀 Hit a Mine', inline: true },
    )
    .setFooter({ text: 'Casino Bot • Tower' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId, rowStr, colStr] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'cashout') {
    const mult   = calculateMultiplier(state.difficulty, state.currentRow);
    const payout = Math.floor(state.bet * mult);
    state.status = 'win';
    await payoutWin(interaction.user.id, payout, 'tower');
    client.activeGames.delete(gameId);

  } else if (action === 'step') {
    const row = parseInt(rowStr);
    const col = parseInt(colStr);
    if (row !== state.currentRow) return;

    state.revealedCells[row] = col;
    const cell = state.tower[row][col];

    if (cell === 'mine') {
      state.status = 'loss';
      await recordLoss(interaction.user.id, 'tower');
      client.activeGames.delete(gameId);
    } else {
      state.currentRow++;
      if (state.currentRow >= state.tower.length) {
        // completed all floors
        const mult   = calculateMultiplier(state.difficulty, state.currentRow);
        const payout = Math.floor(state.bet * mult);
        state.status = 'win';
        await payoutWin(interaction.user.id, payout, 'tower');
        client.activeGames.delete(gameId);
      }
    }
  }

  await interaction.editReply({ embeds: [buildEmbed(state, interaction.user)], components: buildTowerDisplay(state) });
};

module.exports.startGame = function (userId, bet, difficulty = 'medium') {
  if (!DIFFICULTIES[difficulty]) difficulty = 'medium';
  const tower = generateTower(difficulty);
  return { id: uuidv4(), userId, bet, difficulty, tower, currentRow: 0, revealedCells: {}, status: 'playing' };
};

module.exports.buildEmbed       = buildEmbed;
module.exports.buildTowerDisplay = buildTowerDisplay;
