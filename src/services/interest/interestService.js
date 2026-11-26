/**
 * Vault Interest System
 * - Users with vault balance earn 0.75% daily interest
 * - Interest is claimed manually via .interest command or auto-applied on login
 * - Unclaimed interest accumulates up to 7 days max
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DAILY_RATE  = 0.0075; // 0.75% per day
const MAX_DAYS    = 7;      // max unclaimed days
const MS_PER_DAY  = 24 * 60 * 60 * 1000;

/**
 * Calculate pending interest for a user.
 * Returns { amount, days } — does NOT credit yet.
 */
async function calculatePendingInterest(discordId) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user || user.vaultBalance <= 0) return { amount: 0, days: 0 };

  const lastClaim = user.lastInterestClaim || user.createdAt;
  const now       = new Date();
  const msElapsed = now - new Date(lastClaim);
  const days      = Math.min(Math.floor(msElapsed / MS_PER_DAY), MAX_DAYS);

  if (days <= 0) return { amount: 0, days: 0 };

  // Compound interest over days
  const multiplier = Math.pow(1 + DAILY_RATE, days) - 1;
  const amount     = Math.floor(user.vaultBalance * multiplier);

  return { amount, days, rate: DAILY_RATE, vaultBalance: user.vaultBalance };
}

/**
 * Claim pending interest — credits the amount and updates lastInterestClaim.
 */
async function claimInterest(discordId) {
  const { amount, days, vaultBalance } = await calculatePendingInterest(discordId);
  if (amount <= 0) {
    throw new Error('No interest available yet. Interest accrues daily on your vault balance.');
  }

  const user = await prisma.user.update({
    where: { discordId },
    data: {
      balance:          { increment: amount },
      totalWon:         { increment: amount },
      lastInterestClaim: new Date(),
      transactions: {
        create: {
          type:        'interest',
          amount,
          description: `Vault interest — ${days} day${days > 1 ? 's' : ''} at ${(DAILY_RATE * 100).toFixed(2)}%/day`,
        },
      },
    },
  });

  return { amount, days, rate: DAILY_RATE, vaultBalance, newBalance: user.balance };
}

/**
 * Run daily interest auto-apply for all users with vault balance.
 * Called from a cron-like interval in index.js.
 */
async function applyDailyInterestAll() {
  const users = await prisma.user.findMany({
    where: { vaultBalance: { gt: 0 } },
  });

  let applied = 0;
  for (const user of users) {
    try {
      const { amount } = await calculatePendingInterest(user.discordId);
      if (amount > 0) {
        await claimInterest(user.discordId);
        applied++;
      }
    } catch (_) {
      // skip users with no pending interest
    }
  }
  return applied;
}

module.exports = { calculatePendingInterest, claimInterest, applyDailyInterestAll, DAILY_RATE };
