const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

module.exports = async function (interaction, parts, client) {
  const [choice, gameId] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });

  await interaction.deferUpdate();

  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won    = choice === result;

  const embed = new EmbedBuilder()
    .setColor(won ? config.colors.success : config.colors.danger)
    .setTitle('🪙 Coinflip')
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🎯 Your Pick', value: choice.charAt(0).toUpperCase() + choice.slice(1), inline: true },
      { name: '🪙 Result',    value: result.charAt(0).toUpperCase() + result.slice(1), inline: true },
      { name: '📊 Outcome',   value: won ? '🏆 **WIN!**' : '💀 **LOSS**', inline: true },
      { name: '💰 Bet',       value: `🪙 ${formatBalance(state.bet)}`, inline: true },
      { name: '💸 Payout',    value: won ? `🪙 ${formatBalance(state.bet * 2)}` : `🪙 0`, inline: true },
    )
    .setFooter({ text: 'Casino Bot • Coinflip' }).setTimestamp();

  if (won) await payoutWin(interaction.user.id, state.bet * 2, 'coinflip');
  else     await recordLoss(interaction.user.id, 'coinflip');
  client.activeGames.delete(gameId);

  await interaction.editReply({ embeds: [embed], components: [] });
};

module.exports.startGame = function (userId, bet) {
  return { id: uuidv4(), userId, bet };
};

module.exports.buildButtons = function (gameId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cf:heads:${gameId}`).setLabel('Heads').setEmoji('🪙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cf:tails:${gameId}`).setLabel('Tails').setEmoji('🪙').setStyle(ButtonStyle.Secondary),
  )];
};
