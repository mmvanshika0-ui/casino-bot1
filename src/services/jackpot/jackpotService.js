/**
 * Jackpot Pool Service
 * - 0.5% of every bet feeds the jackpot
 * - Certain rare outcomes trigger the jackpot payout
 * - Live jackpot amount tracked in DB and displayed in bot status
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JACKPOT_CONTRIBUTION = 0.005; // 0.5% of every bet

/** Add contribution from a bet to the jackpot pool */
async function contributeBet(betAmount) {
  const contribution = Math.floor(betAmount * JACKPOT_CONTRIBUTION);
  if (contribution <= 0) return null;

  const jackpot = await prisma.jackpotPool.upsert({
    where: { id: 'global' },
    update: { amount: { increment: contribution } },
    create: { id: 'global', amount: contribution },
  });

  return jackpot;
}

/** Get current jackpot amount */
async function getJackpot() {
  const pool = await prisma.jackpotPool.findUnique({ where: { id: 'global' } });
  return pool ? pool.amount : 0;
}

/**
 * Trigger jackpot win — award full pool to winner, reset to seed amount.
 * Returns the amount won.
 */
async function triggerJackpot(discordId, game, trigger) {
  const pool = await prisma.jackpotPool.findUnique({ where: { id: 'global' } });
  if (!pool || pool.amount <= 0) return 0;

  const amount = pool.amount;
  const seed   = 10000; // reset jackpot to 10k after trigger

  // Pay the winner
  await prisma.user.update({
    where: { discordId },
    data: {
      balance: { increment: amount },
      totalWon: { increment: amount },
      transactions: {
        create: {
          type: 'jackpot_win',
          amount,
          game,
          description: `🎰 JACKPOT WIN — ${trigger}`,
        },
      },
    },
  });

  // Log the jackpot hit
  await prisma.jackpotHistory.create({
    data: { discordId, game, trigger, amount },
  });

  // Reset pool to seed
  await prisma.jackpotPool.update({
    where: { id: 'global' },
    data: { amount: seed },
  });

  return amount;
}

/**
 * Check if an outcome qualifies for jackpot.
 * Returns trigger description string or null.
 */
function checkJackpotTrigger(game, outcome) {
  switch (game) {
    case 'slots': {
      // All 5 reels show 💎 (diamond — rarest symbol)
      if (outcome.symbols && outcome.symbols.every(s => s === '💎')) {
        return 'Five Diamonds on Slots';
      }
      break;
    }
    case 'mines': {
      // Player clears all 24 safe tiles (1 mine, 24 gems)
      if (outcome.minesCount === 1 && outcome.tilesRevealed === 24) {
        return 'All Tiles Cleared (1 Mine)';
      }
      break;
    }
    case 'blackjack': {
      // Natural blackjack with suited ace + king of spades
      if (outcome.naturalBlackjack && outcome.suitedSpades) {
        return 'Royal Blackjack (Suited Spades)';
      }
      break;
    }
    case 'crash': {
      // Crashed exactly at 100x or higher after cashout
      if (outcome.cashedAt && outcome.cashedAt >= 100) {
        return `Crash Cash Out at ${outcome.cashedAt}x`;
      }
      break;
    }
    case 'roulette': {
      // Win on a straight-up bet (single number) 5× in a row tracked externally
      if (outcome.straightUpWin) {
        return 'Straight-Up Win';
      }
      break;
    }
    default:
      return null;
  }
  return null;
}

/** Get jackpot history */
async function getJackpotHistory(limit = 5) {
  return prisma.jackpotHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

module.exports = {
  contributeBet,
  getJackpot,
  triggerJackpot,
  checkJackpotTrigger,
  getJackpotHistory,
  JACKPOT_CONTRIBUTION,
};
