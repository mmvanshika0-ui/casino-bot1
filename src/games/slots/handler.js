/**
 * Slots Game Handler
 * - 5 reels, each with weighted symbols
 * - Winning lines: all 5 match, 4 match (outer 4 or inner 4), 3 match
 * - Bonus round: scatter symbol triggers 10 free spins with 2× multiplier
 * - Jackpot: five 💎 symbols → jackpot pool trigger
 * - Provably fair: each spin derived from HMAC-SHA256(serverSeed, clientSeed:nonce)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss, placeBet } = require('../../services/economy/economyService');
const { getSeedPair, incrementNonce, deriveFloats } = require('../../services/provablyfair/provablyFairService');
const { contributeBet, checkJackpotTrigger, triggerJackpot, getJackpot } = require('../../services/jackpot/jackpotService');
const { notifyBigWin, notifyJackpot } = require('../../services/notifications/notificationService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');

// Symbol table: [emoji, weight, payout_multiplier]
// Lower weight = rarer. Total weight used for relative probability.
const SYMBOLS = [
  { emoji: '💎', weight: 1,  payout: 500 },  // jackpot symbol — rarest
  { emoji: '7️⃣',  weight: 2,  payout: 100 },
  { emoji: '🍀', weight: 4,  payout: 50  },
  { emoji: '🔔', weight: 6,  payout: 20  },
  { emoji: '💰', weight: 8,  payout: 15  },
  { emoji: '🍇', weight: 12, payout: 10  },
  { emoji: '🍊', weight: 16, payout: 7   },
  { emoji: '🍋', weight: 20, payout: 5   },
  { emoji: '🍒', weight: 24, payout: 3   },
  { emoji: '⭐', weight: 28, payout: 2   },  // scatter — triggers bonus
];

const SCATTER = '⭐';
const TOTAL_WEIGHT = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

/** Pick a symbol from weighted distribution using a [0,1) float */
function pickSymbol(float) {
  let cumulative = 0;
  const target   = float * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) {
    cumulative += sym.weight;
    if (target < cumulative) return sym;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

/** Spin 5 reels using provably fair floats */
function spinReels(floats) {
  return floats.map(f => pickSymbol(f));
}

/**
 * Evaluate a reel result for winnings.
 * Returns { payout: multiplier, line: description, jackpot: bool }
 */
function evaluateResult(symbols) {
  const emojis = symbols.map(s => s.emoji);

  // Check scatter count (bonus trigger)
  const scatterCount = emojis.filter(e => e === SCATTER).length;

  // All 5 match — highest win
  if (emojis.every(e => e === emojis[0])) {
    const sym   = symbols[0];
    const isJP  = sym.emoji === '💎';
    return {
      payout:  isJP ? 0 : sym.payout,  // jackpot handled separately
      line:    `Five ${sym.emoji}`,
      jackpot: isJP,
      bonus:   false,
      scatter: scatterCount,
    };
  }

  // 4 of a kind — first 4 or last 4
  const firstFour = emojis.slice(0, 4);
  const lastFour  = emojis.slice(1, 5);

  if (firstFour.every(e => e === firstFour[0])) {
    const sym = symbols[0];
    return { payout: Math.floor(sym.payout * 0.4), line: `Four ${sym.emoji} (left)`, jackpot: false, bonus: false, scatter: scatterCount };
  }
  if (lastFour.every(e => e === lastFour[0])) {
    const sym = symbols[1];
    return { payout: Math.floor(sym.payout * 0.4), line: `Four ${sym.emoji} (right)`, jackpot: false, bonus: false, scatter: scatterCount };
  }

  // 3 of a kind — any 3 consecutive
  for (let i = 0; i <= 2; i++) {
    if (emojis[i] === emojis[i + 1] && emojis[i + 1] === emojis[i + 2]) {
      const sym = symbols[i];
      return { payout: Math.floor(sym.payout * 0.15), line: `Three ${sym.emoji}`, jackpot: false, bonus: false, scatter: scatterCount };
    }
  }

  // Scatter bonus trigger (3+ scatters, no match)
  if (scatterCount >= 3) {
    return { payout: 0, line: `${scatterCount} Scatters`, jackpot: false, bonus: true, scatter: scatterCount };
  }

  // No win
  return { payout: 0, line: 'No Match', jackpot: false, bonus: false, scatter: scatterCount };
}

/** Build the slots display embed */
function buildEmbed(state, discordUser, jackpotAmount) {
  const { symbols, result, bet, bonusRound, freeSpins, multiplier } = state;

  const reelDisplay = symbols
    ? symbols.map(s => s.emoji).join(' ┃ ')
    : '🎰 ┃ 🎰 ┃ 🎰 ┃ 🎰 ┃ 🎰';

  const statusLines = [];
  if (result) {
    if (result.jackpot) {
      statusLines.push('🎰 **JACKPOT!!!** 💎💎💎💎💎');
    } else if (result.payout > 0) {
      const totalPayout = Math.floor(bet * result.payout * multiplier);
      statusLines.push(`✅ **${result.line}** — Won 🪙 **${formatBalance(totalPayout)}**`);
    } else if (result.bonus) {
      statusLines.push(`⭐ **BONUS ROUND!** ${result.scatter} Scatters — 10 Free Spins (2× multiplier)!`);
    } else {
      statusLines.push(`❌ **${result.line}** — Better luck next spin`);
    }
  } else {
    statusLines.push('🎰 Spinning the reels...');
  }

  if (bonusRound) {
    statusLines.push(`🌀 **Bonus Round Active** — ${freeSpins} free spins remaining (${multiplier}×)`);
  }

  const color = result?.jackpot ? 0xFF6600
    : result?.payout > 0 ? config.colors.success
    : result?.bonus ? 0xFFD700
    : result ? config.colors.danger
    : config.colors.info;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎰 Slots${bonusRound ? ' — BONUS ROUND 🌀' : ''}`)
    .setDescription(
      `╔═══════════════════╗\n` +
      `║  ${reelDisplay}  ║\n` +
      `╚═══════════════════╝\n\n` +
      statusLines.join('\n')
    )
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '💰 Bet',         value: `🪙 ${formatBalance(bet)}`,         inline: true },
      { name: '✖️ Multiplier', value: `**${multiplier}x**`,               inline: true },
      { name: '🏆 Jackpot',    value: `🪙 ${formatBalance(jackpotAmount)}`, inline: true },
    )
    .setFooter({ text: `Casino Bot • Slots • Provably Fair` })
    .setTimestamp();
}

/** Spin buttons */
function buildButtons(gameId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`slots:spin:${gameId}`)
        .setLabel('🎰 Spin Again')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`slots:quit:${gameId}`)
        .setLabel('🚪 Quit')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

/** Start a new slots game */
async function startGame(message, bet, client) {
  const { v4: uuidv4 } = require('uuid');
  const id       = uuidv4();
  const seedPair = await getSeedPair(message.author.id);
  const jackpot  = await getJackpot();

  const state = {
    id,
    userId:      message.author.id,
    bet,
    seedPairId:  seedPair.id,
    nonce:       seedPair.nonce,
    serverSeedHash: seedPair.serverSeedHash,
    clientSeed:  seedPair.clientSeed,
    symbols:     null,
    result:      null,
    bonusRound:  false,
    freeSpins:   0,
    multiplier:  1,
    status:      'playing',
    totalWon:    0,
  };

  client.activeGames.set(id, state);

  // Contribute to jackpot
  await contributeBet(bet);

  // Do initial spin
  const spinResult = await doSpin(state, seedPair, message.author, client, message);

  // Persist and display
  const jpAmount = await getJackpot();
  const msg = await message.reply({
    embeds:     [buildEmbed(spinResult.state, message.author, jpAmount)],
    components: spinResult.state.status === 'playing' ? buildButtons(id) : buildButtons(id, true),
  });

  state.messageRef = msg;

  return state;
}

/** Process a single spin */
async function doSpin(state, seedPair, discordUser, client, messageOrInteraction) {
  // Derive 5 floats for 5 reels
  const floats  = deriveFloats(seedPair.serverSeed, state.clientSeed, state.nonce, 5);
  const symbols = spinReels(floats);
  const result  = evaluateResult(symbols);

  state.symbols = symbols;
  state.result  = result;

  // Increment nonce for next spin
  await incrementNonce(seedPair.id);
  state.nonce++;

  const mult  = state.multiplier;
  const payout = result.payout > 0 ? Math.floor(state.bet * result.payout * mult) : 0;

  if (result.jackpot) {
    // Trigger jackpot pool
    const jpAmount = await triggerJackpot(discordUser.id, 'slots', 'Five Diamonds on Slots');
    state.totalWon += jpAmount;
    await notifyJackpot(client, {
      discordId: discordUser.id,
      game:      'slots',
      trigger:   'Five Diamonds on Slots',
      amount:    jpAmount,
    });
    state.status = 'done';
  } else if (result.bonus && !state.bonusRound) {
    // Enter bonus round
    state.bonusRound = true;
    state.freeSpins  = 10;
    state.multiplier = 2;
  } else if (result.payout > 0) {
    await payoutWin(discordUser.id, payout, 'slots');
    state.totalWon += payout;

    // Check big win notification
    if (result.payout * mult >= 10) {
      await notifyBigWin(client, {
        discordId:  discordUser.id,
        username:   discordUser.username,
        game:       'slots',
        bet:        state.bet,
        payout,
        multiplier: result.payout * mult,
        avatar:     discordUser.avatar,
      });
    }
  } else {
    await recordLoss(discordUser.id, 'slots');
  }

  // Handle bonus round free spins
  if (state.bonusRound) {
    state.freeSpins--;
    if (state.freeSpins <= 0) {
      state.bonusRound = false;
      state.multiplier = 1;
      state.status     = 'done';
    }
  } else {
    // Regular spin ends game — player must click to spin again
    state.status = 'waiting';
  }

  return { state, payout, symbols, result };
}

/** Handle button interactions for slots */
module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);

  if (!state || state.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  }

  await interaction.deferUpdate();

  if (action === 'quit') {
    client.activeGames.delete(gameId);
    const jpAmount = await getJackpot();
    return interaction.editReply({
      embeds:     [buildEmbed({ ...state, result: { line: 'Game ended', payout: 0, bonus: false, scatter: 0 } }, interaction.user, jpAmount)],
      components: buildButtons(gameId, true),
    });
  }

  if (action === 'spin') {
    if (state.status === 'done') {
      return interaction.followUp({ content: '❌ Game is over.', ephemeral: true });
    }

    // Deduct bet for new spin (bonus round = free)
    if (!state.bonusRound) {
      try {
        await placeBet(interaction.user.id, state.bet, 'slots');
        await contributeBet(state.bet);
      } catch (err) {
        return interaction.followUp({ content: `❌ ${err.message}`, ephemeral: true });
      }
    }

    const { getSeedPair: gsp } = require('../../services/provablyfair/provablyFairService');
    const seedPair = await gsp(interaction.user.id);

    const spinResult = await doSpin(state, seedPair, interaction.user, client, interaction);
    const jpAmount   = await getJackpot();

    const done = state.status === 'done' || state.status === 'playing' === false;
    await interaction.editReply({
      embeds:     [buildEmbed(state, interaction.user, jpAmount)],
      components: buildButtons(gameId, done),
    });

    if (done) client.activeGames.delete(gameId);
  }
};

module.exports.startGame = startGame;
module.exports.buildEmbed = buildEmbed;
