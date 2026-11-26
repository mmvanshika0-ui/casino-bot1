const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const SEGMENTS = [
  { label: '0x',    mult: 0,    color: '⬛', weight: 5  },
  { label: '0.2x',  mult: 0.2,  color: '🟥', weight: 15 },
  { label: '0.5x',  mult: 0.5,  color: '🟧', weight: 20 },
  { label: '1x',    mult: 1.0,  color: '🟨', weight: 25 },
  { label: '1.5x',  mult: 1.5,  color: '🟩', weight: 15 },
  { label: '2x',    mult: 2.0,  color: '🟦', weight: 10 },
  { label: '3x',    mult: 3.0,  color: '🟪', weight: 7  },
  { label: '5x',    mult: 5.0,  color: '💎', weight: 2  },
  { label: '10x',   mult: 10.0, color: '👑', weight: 1  },
];

const WHEEL_POOL = SEGMENTS.flatMap(s => Array(s.weight).fill(s));

function spinWheel() {
  return WHEEL_POOL[Math.floor(Math.random() * WHEEL_POOL.length)];
}

function buildWheelDisplay() {
  return SEGMENTS.map(s => `${s.color} \`${s.label}\``).join(' · ');
}

function buildEmbed(state, discordUser, spun = false) {
  const payout = spun ? Math.floor(state.bet * state.segment.mult) : 0;

  return new EmbedBuilder()
    .setColor(spun ? (state.segment.mult >= 1 ? config.colors.success : config.colors.danger) : config.colors.purple)
    .setTitle('🎡 Wheel of Fortune')
    .setDescription(`**Segments:**\n${buildWheelDisplay()}`)
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '💰 Bet', value: `🪙 ${formatBalance(state.bet)}`, inline: true },
      ...(spun ? [
        { name: '🎡 Result',  value: `${state.segment.color} **${state.segment.label}**`, inline: true },
        { name: '💸 Payout', value: `🪙 ${formatBalance(payout)}`,                       inline: true },
        { name: '📊 Outcome',value: state.segment.mult >= 1 ? '🏆 WIN!' : '💀 LOSS',      inline: false },
      ] : []),
    )
    .setFooter({ text: 'Casino Bot • Wheel' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'spin') {
    state.segment = spinWheel();
    const payout  = Math.floor(state.bet * state.segment.mult);
    state.status  = state.segment.mult > 0 ? 'win' : 'loss';

    if (payout > 0) await payoutWin(interaction.user.id, payout, 'wheel');
    else            await recordLoss(interaction.user.id, 'wheel');
    client.activeGames.delete(gameId);

    await interaction.editReply({ embeds: [buildEmbed(state, interaction.user, true)], components: [] });
  }
};

module.exports.startGame = function (userId, bet) {
  return { id: uuidv4(), userId, bet, segment: null, status: 'playing' };
};

module.exports.buildEmbed = buildEmbed;

module.exports.buildButtons = function (gameId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wheel:spin:${gameId}`).setLabel('🎡 Spin the Wheel!').setStyle(ButtonStyle.Primary),
  )];
};
