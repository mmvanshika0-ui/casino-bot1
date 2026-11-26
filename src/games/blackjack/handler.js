const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { placeBet, payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');

const SUITS  = ['♠', '♥', '♦', '♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const v of VALUES) deck.push({ s, v });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(v) {
  if (['J','Q','K'].includes(v)) return 10;
  if (v === 'A') return 11;
  return parseInt(v);
}

function handTotal(hand) {
  let total = hand.reduce((s, c) => s + cardValue(c.v), 0);
  let aces  = hand.filter(c => c.v === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function handStr(hand, hideSecond = false) {
  return hand.map((c, i) => i === 1 && hideSecond ? '`🂠`' : `\`${c.v}${c.s}\``).join(' ');
}

function buildEmbed(state, discordUser) {
  const { playerHand, dealerHand, bet, status, dealerRevealed } = state;
  const pTotal = handTotal(playerHand);
  const dTotal = dealerRevealed ? handTotal(dealerHand) : '?';

  const statusColors = { playing: config.colors.info, win: config.colors.success, loss: config.colors.danger, push: config.colors.warning, blackjack: config.colors.gold };
  const statusText   = { playing: '🎮 Your Turn', win: '🏆 You Win!', loss: '💀 Bust / Loss', push: '🤝 Push', blackjack: '🃏 Blackjack!' };

  const embed = new EmbedBuilder()
    .setColor(statusColors[status] || config.colors.primary)
    .setTitle('🃏 Blackjack')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: `🤖 Dealer (${dTotal})`,        value: handStr(dealerHand, !dealerRevealed), inline: false },
      { name: `👤 ${discordUser.username} (${pTotal})`, value: handStr(playerHand),              inline: false },
      { name: '💰 Bet',                        value: `🪙 ${formatBalance(bet)}`,                inline: true },
      { name: '📊 Status',                     value: statusText[status] || status,               inline: true },
    )
    .setFooter({ text: 'Casino Bot • Blackjack' })
    .setTimestamp();

  if (status !== 'playing') {
    const payout = status === 'win' ? bet * 2 : status === 'blackjack' ? Math.floor(bet * 2.5) : status === 'push' ? bet : 0;
    embed.addFields({ name: '💸 Payout', value: `🪙 ${formatBalance(payout)}`, inline: true });
  }

  return embed;
}

function buildButtons(state) {
  if (state.status !== 'playing') return [];
  const canDouble = state.playerHand.length === 2;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:hit:${state.id}`).setLabel('Hit').setStyle(ButtonStyle.Primary).setEmoji('🃏'),
    new ButtonBuilder().setCustomId(`bj:stand:${state.id}`).setLabel('Stand').setStyle(ButtonStyle.Secondary).setEmoji('✋'),
    new ButtonBuilder().setCustomId(`bj:double:${state.id}`).setLabel('Double Down').setStyle(ButtonStyle.Danger).setEmoji('💰').setDisabled(!canDouble),
  );
  return [row];
}

// main interaction handler
module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);

  if (!state || state.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  }
  if (state.status !== 'playing') {
    return interaction.reply({ content: '❌ Game already ended.', ephemeral: true });
  }

  await interaction.deferUpdate();

  const deck = state.deck;

  if (action === 'hit') {
    state.playerHand.push(deck.pop());
    const total = handTotal(state.playerHand);
    if (total > 21) {
      state.status = 'loss';
      state.dealerRevealed = true;
      await recordLoss(interaction.user.id, 'blackjack');
    } else if (total === 21) {
      await dealerPlay(state, deck, interaction.user.id);
    }

  } else if (action === 'stand') {
    await dealerPlay(state, deck, interaction.user.id);

  } else if (action === 'double') {
    if (state.playerHand.length !== 2) return;
    try {
      await placeBet(interaction.user.id, state.bet, 'blackjack');
      state.bet *= 2;
    } catch { return interaction.followUp({ content: '❌ Insufficient balance.', ephemeral: true }); }
    state.playerHand.push(deck.pop());
    const total = handTotal(state.playerHand);
    if (total > 21) {
      state.status = 'loss';
      state.dealerRevealed = true;
      await recordLoss(interaction.user.id, 'blackjack');
    } else {
      await dealerPlay(state, deck, interaction.user.id);
    }
  }

  // payout
  if (state.status !== 'playing') {
    if (state.status === 'win')       await payoutWin(interaction.user.id, state.bet * 2,            'blackjack');
    if (state.status === 'blackjack') await payoutWin(interaction.user.id, Math.floor(state.bet * 2.5), 'blackjack');
    if (state.status === 'push')      await payoutWin(interaction.user.id, state.bet,                'blackjack');
    client.activeGames.delete(gameId);
  }

  const embed   = buildEmbed(state, interaction.user);
  const buttons = buildButtons(state);
  await interaction.editReply({ embeds: [embed], components: buttons });
};

async function dealerPlay(state, deck, userId) {
  state.dealerRevealed = true;
  while (handTotal(state.dealerHand) < 17) {
    state.dealerHand.push(deck.pop());
  }
  const pTotal = handTotal(state.playerHand);
  const dTotal = handTotal(state.dealerHand);

  if (dTotal > 21 || pTotal > dTotal)       state.status = 'win';
  else if (pTotal === dTotal)               state.status = 'push';
  else                                      state.status = 'loss';

  if (state.status === 'loss') await recordLoss(userId, 'blackjack');
}

// game start helper used by command
module.exports.startGame = function (userId, bet) {
  const { v4: uuidv4 } = require('uuid');
  const deck       = newDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  const id         = uuidv4();

  let status = 'playing';
  if (handTotal(playerHand) === 21) status = 'blackjack';

  return { id, userId, bet, deck, playerHand, dealerHand, status, dealerRevealed: status !== 'playing' };
};

module.exports.buildEmbed   = buildEmbed;
module.exports.buildButtons = buildButtons;
