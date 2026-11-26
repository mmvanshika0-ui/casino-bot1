const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const GRID_MAX   = 40;
const DRAW_COUNT = 10;

const PAYOUT_TABLE = {
  1: { 1: 3.8 },
  2: { 1: 1.8, 2: 7.5 },
  3: { 2: 3.0, 3: 20 },
  4: { 2: 2.0, 3: 7.0, 4: 50 },
  5: { 3: 3.5, 4: 15,  5: 100 },
};

function drawNumbers() {
  const pool = Array.from({ length: GRID_MAX }, (_, i) => i + 1);
  const drawn = [];
  while (drawn.length < DRAW_COUNT) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0]);
  }
  return drawn;
}

function calculatePayout(picked, drawn, bet) {
  const matches = picked.filter(n => drawn.includes(n)).length;
  const pickCount = picked.length;
  const table = PAYOUT_TABLE[pickCount] || {};
  const mult = table[matches] || 0;
  return { mult, payout: Math.floor(bet * mult), matches };
}

function buildGridDisplay(state) {
  const rows = [];
  for (let row = 0; row < 8; row++) {
    const components = [];
    for (let col = 0; col < 5; col++) {
      const num = row * 5 + col + 1;
      if (num > GRID_MAX) break;

      const isPicked = state.picked.includes(num);
      const isDrawn  = state.drawn?.includes(num);
      const isMatch  = isPicked && isDrawn;

      let style = ButtonStyle.Secondary, emoji = `${num}`;
      if (state.phase === 'pick') {
        style = isPicked ? ButtonStyle.Primary : ButtonStyle.Secondary;
      } else {
        if (isMatch)        style = ButtonStyle.Success;
        else if (isPicked)  style = ButtonStyle.Danger;
        else if (isDrawn)   style = ButtonStyle.Secondary;
      }

      components.push(
        new ButtonBuilder()
          .setCustomId(`keno:pick:${state.id}:${num}`)
          .setLabel(`${num}`)
          .setStyle(style)
          .setDisabled(state.phase !== 'pick')
      );
    }
    if (components.length) rows.push(new ActionRowBuilder().addComponents(components));
    if (rows.length >= 4) break;
  }

  if (state.phase === 'pick' && state.picked.length >= 1) {
    rows[rows.length] && rows.pop();
    const extra = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`keno:play:${state.id}`)
        .setLabel(`🎱 Play! (${state.picked.length} picked)`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`keno:clear:${state.id}`)
        .setLabel('🗑️ Clear')
        .setStyle(ButtonStyle.Danger),
    );
    rows.push(extra);
  }

  return rows;
}

function buildEmbed(state, discordUser) {
  const fields = [
    { name: '💰 Bet',         value: `🪙 ${formatBalance(state.bet)}`, inline: true },
    { name: '🎯 Max Picks',   value: `${Object.keys(PAYOUT_TABLE).pop()}`,             inline: true },
    { name: '🔢 Selected',    value: state.picked.length > 0 ? state.picked.join(', ') : 'None', inline: false },
  ];

  if (state.phase === 'result') {
    const { mult, payout, matches } = calculatePayout(state.picked, state.drawn, state.bet);
    fields.push(
      { name: '🎱 Drawn',    value: state.drawn.join(', '),              inline: false },
      { name: '✅ Matches',  value: `${matches}/${state.picked.length}`, inline: true  },
      { name: '📈 Mult',     value: `${mult}x`,                          inline: true  },
      { name: '💸 Payout',   value: `🪙 ${formatBalance(payout)}`,       inline: true  },
    );
  }

  return new EmbedBuilder()
    .setColor(state.phase === 'result' ? (calculatePayout(state.picked, state.drawn || [], state.bet).payout > 0 ? config.colors.success : config.colors.danger) : config.colors.info)
    .setTitle('🎱 Keno')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(...fields)
    .setDescription(state.phase === 'pick' ? '**Pick 1–5 numbers then hit Play!**' : null)
    .setFooter({ text: 'Casino Bot • Keno' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId, numStr] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'pick' && state.phase === 'pick') {
    const num = parseInt(numStr);
    if (state.picked.includes(num)) {
      state.picked = state.picked.filter(n => n !== num);
    } else if (state.picked.length < 5) {
      state.picked.push(num);
    }

  } else if (action === 'clear') {
    state.picked = [];

  } else if (action === 'play' && state.picked.length >= 1) {
    state.drawn  = drawNumbers();
    state.phase  = 'result';
    const { payout } = calculatePayout(state.picked, state.drawn, state.bet);

    if (payout > 0) await payoutWin(interaction.user.id, payout, 'keno');
    else            await recordLoss(interaction.user.id, 'keno');
    client.activeGames.delete(gameId);
  }

  await interaction.editReply({ embeds: [buildEmbed(state, interaction.user)], components: buildGridDisplay(state) });
};

module.exports.startGame = function (userId, bet) {
  return { id: uuidv4(), userId, bet, picked: [], drawn: null, phase: 'pick' };
};
module.exports.buildEmbed       = buildEmbed;
module.exports.buildGridDisplay = buildGridDisplay;
