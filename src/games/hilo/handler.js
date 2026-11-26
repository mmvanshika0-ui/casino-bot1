const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const DECK = [];
const SUITS  = ['♠','♥','♦','♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
for (const s of SUITS) for (const v of VALUES) DECK.push({ s, v });

function numericValue(v) {
  if (v === 'A') return 1;
  if (['J','Q','K'].includes(v)) return 11 + ['J','Q','K'].indexOf(v);
  return parseInt(v);
}

function randomCard() { return DECK[Math.floor(Math.random() * DECK.length)]; }

function multiplierForGuess(currentCard, guess) {
  const cv = numericValue(currentCard.v);
  const higherCards = DECK.filter(c => numericValue(c.v) > cv).length;
  const lowerCards  = DECK.filter(c => numericValue(c.v) < cv).length;
  const prob = guess === 'higher' ? higherCards / DECK.length : lowerCards / DECK.length;
  if (prob <= 0) return 50;
  return parseFloat(Math.max(1.05, 0.97 / prob).toFixed(2));
}

function buildEmbed(state, discordUser) {
  const mult   = state.streak > 0 ? state.currentMultiplier : 1;
  const payout = Math.floor(state.bet * mult);

  return new EmbedBuilder()
    .setColor(state.status === 'win' ? config.colors.success : state.status === 'loss' ? config.colors.danger : config.colors.info)
    .setTitle('🃏 Hi-Lo')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🃏 Current Card', value: `\`${state.currentCard.v}${state.currentCard.s}\``, inline: true },
      { name: '🔥 Streak',       value: `${state.streak}`,                                  inline: true },
      { name: '📈 Multiplier',   value: `${mult}x`,                                         inline: true },
      { name: '💰 Bet',          value: `🪙 ${formatBalance(state.bet)}`,                   inline: true },
      { name: '💸 Potential',    value: `🪙 ${formatBalance(payout)}`,                      inline: true },
      { name: '📊 Status',       value: state.status === 'playing' ? '🎮 Playing' : state.status, inline: true },
    )
    .setFooter({ text: 'Casino Bot • Hi-Lo' }).setTimestamp();
}

function buildButtons(state) {
  if (state.status !== 'playing') return [];
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hilo:higher:${state.id}`).setLabel('⬆️ Higher').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hilo:lower:${state.id}`).setLabel('⬇️ Lower').setStyle(ButtonStyle.Secondary),
  )];
  if (state.streak > 0) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hilo:cashout:${state.id}`).setLabel(`💸 Cash Out — 🪙 ${formatBalance(Math.floor(state.bet * state.currentMultiplier))}`).setStyle(ButtonStyle.Success),
  ));
  return rows;
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'cashout') {
    state.status = 'win';
    await payoutWin(interaction.user.id, Math.floor(state.bet * state.currentMultiplier), 'hilo');
    client.activeGames.delete(gameId);
  } else {
    const guess    = action; // 'higher' or 'lower'
    const mult     = multiplierForGuess(state.currentCard, guess);
    const nextCard = randomCard();
    const cv       = numericValue(state.currentCard.v);
    const nv       = numericValue(nextCard.v);

    const correct = (guess === 'higher' && nv > cv) || (guess === 'lower' && nv < cv);
    state.currentCard = nextCard;

    if (correct) {
      state.streak++;
      state.currentMultiplier = parseFloat((state.currentMultiplier * mult).toFixed(3));
    } else {
      state.status = 'loss';
      await recordLoss(interaction.user.id, 'hilo');
      client.activeGames.delete(gameId);
    }
  }

  await interaction.editReply({ embeds: [buildEmbed(state, interaction.user)], components: buildButtons(state) });
};

module.exports.startGame = function (userId, bet) {
  return { id: uuidv4(), userId, bet, currentCard: randomCard(), streak: 0, currentMultiplier: 1, status: 'playing' };
};
module.exports.buildEmbed = buildEmbed;
module.exports.buildButtons = buildButtons;
