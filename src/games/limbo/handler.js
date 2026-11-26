const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

function generateMultiplier() {
  const e = 1e9;
  const r = Math.floor(Math.random() * e);
  if (r === 0) return 1.0;
  const mult = Math.max(1.0, (99 * e) / (e - r)) / 100;
  return parseFloat(mult.toFixed(2));
}

function buildEmbed(state, discordUser, rolled = false) {
  const payout = rolled && state.won ? Math.floor(state.bet * state.target) : 0;
  const winChance = parseFloat((99 / state.target).toFixed(2));

  return new EmbedBuilder()
    .setColor(rolled ? (state.won ? config.colors.success : config.colors.danger) : config.colors.info)
    .setTitle('🎯 Limbo')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🎯 Target Mult', value: `${state.target}x`,             inline: true },
      { name: '📊 Win Chance',  value: `${winChance}%`,                 inline: true },
      { name: '💰 Bet',         value: `🪙 ${formatBalance(state.bet)}`, inline: true },
      ...(rolled ? [
        { name: '🎲 Result',   value: `**${state.result}x**`,                                              inline: true },
        { name: '📊 Outcome',  value: state.won ? `🏆 WIN! 🪙 ${formatBalance(payout)}` : '💀 LOSS',      inline: true },
      ] : []),
    )
    .setFooter({ text: 'Casino Bot • Limbo' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'roll') {
    state.result = generateMultiplier();
    state.won    = state.result >= state.target;
    state.status = state.won ? 'win' : 'loss';

    if (state.won) await payoutWin(interaction.user.id, Math.floor(state.bet * state.target), 'limbo');
    else           await recordLoss(interaction.user.id, 'limbo');
    client.activeGames.delete(gameId);

    await interaction.editReply({ embeds: [buildEmbed(state, interaction.user, true)], components: [] });
  }
};

module.exports.startGame = function (userId, bet, target) {
  target = parseFloat(target);
  if (isNaN(target) || target < 1.01) target = 2.0;
  if (target > 1000000) target = 1000000;
  return { id: uuidv4(), userId, bet, target, result: null, won: false, status: 'playing' };
};

module.exports.buildEmbed = buildEmbed;

module.exports.buildButtons = function (gameId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`limbo:roll:${gameId}`).setLabel('🎯 Roll!').setStyle(ButtonStyle.Primary),
  )];
};
