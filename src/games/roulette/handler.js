const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const REDS   = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const GREENS = [0];

function getColor(n) {
  if (GREENS.includes(n)) return 'green';
  if (REDS.includes(n))   return 'red';
  return 'black';
}

function spinWheel() { return Math.floor(Math.random() * 37); } // 0-36

function resolveBet(number, betType, betValue) {
  const color = getColor(number);
  switch (betType) {
    case 'color':
      if (betValue === 'red'   && color === 'red')   return 2;
      if (betValue === 'black' && color === 'black') return 2;
      if (betValue === 'green' && color === 'green') return 14;
      return 0;
    case 'parity':
      if (number === 0) return 0;
      if (betValue === 'even' && number % 2 === 0) return 2;
      if (betValue === 'odd'  && number % 2 !== 0) return 2;
      return 0;
    case 'half':
      if (number === 0) return 0;
      if (betValue === 'low'  && number >= 1  && number <= 18) return 2;
      if (betValue === 'high' && number >= 19 && number <= 36) return 2;
      return 0;
    case 'dozen':
      if (number === 0) return 0;
      if (betValue === '1st' && number >= 1  && number <= 12) return 3;
      if (betValue === '2nd' && number >= 13 && number <= 24) return 3;
      if (betValue === '3rd' && number >= 25 && number <= 36) return 3;
      return 0;
    case 'straight':
      return parseInt(betValue) === number ? 36 : 0;
    default:
      return 0;
  }
}

function colorEmoji(n) {
  const c = getColor(n);
  return c === 'green' ? '🟢' : c === 'red' ? '🔴' : '⚫';
}

function buildEmbed(state, discordUser, spun = false) {
  const betLabels = {
    color: `Color: ${state.betValue}`, parity: `${state.betValue}`, half: `${state.betValue} half`,
    dozen: `${state.betValue} dozen`, straight: `Number ${state.betValue}`,
  };

  const fields = [
    { name: '🎯 Your Bet',   value: betLabels[state.betType] || state.betType, inline: true },
    { name: '💰 Amount',      value: `🪙 ${formatBalance(state.bet)}`,          inline: true },
  ];

  if (spun) {
    const mult = resolveBet(state.result, state.betType, state.betValue);
    fields.push(
      { name: `${colorEmoji(state.result)} Result`, value: `**${state.result}** (${getColor(state.result)})`, inline: true },
      { name: '📊 Outcome', value: mult > 0 ? `🏆 WIN! 🪙 ${formatBalance(Math.floor(state.bet * mult))} (${mult}x)` : '💀 LOSS', inline: false },
    );
  }

  return new EmbedBuilder()
    .setColor(spun ? (resolveBet(state.result, state.betType, state.betValue) > 0 ? config.colors.success : config.colors.danger) : config.colors.primary)
    .setTitle('🎡 Roulette')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(...fields)
    .setFooter({ text: 'Casino Bot • Roulette' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'spin') {
    state.result = spinWheel();
    const mult   = resolveBet(state.result, state.betType, state.betValue);
    state.status = mult > 0 ? 'win' : 'loss';

    if (mult > 0) await payoutWin(interaction.user.id, Math.floor(state.bet * mult), 'roulette');
    else          await recordLoss(interaction.user.id, 'roulette');
    client.activeGames.delete(gameId);

    await interaction.editReply({ embeds: [buildEmbed(state, interaction.user, true)], components: [] });
  }
};

module.exports.startGame = function (userId, bet, betType, betValue) {
  return { id: uuidv4(), userId, bet, betType, betValue: betValue.toLowerCase(), result: null, status: 'playing' };
};

module.exports.buildEmbed = buildEmbed;

module.exports.buildButtons = function (gameId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`roulette:spin:${gameId}`).setLabel('🎡 Spin!').setStyle(ButtonStyle.Danger),
  )];
};
