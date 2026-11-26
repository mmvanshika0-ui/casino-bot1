/**
 * Wager Requirement & Fraud Detection
 * - After a crypto deposit, user must wager X× the deposit before withdrawing
 * - Default wager multiplier: 3× (configurable)
 * - Fraud: flag accounts that deposit and immediately withdraw without meeting wager
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WAGER_MULTIPLIER  = 3;    // must wager 3× deposit before withdrawing
const FRAUD_WAGER_RATIO = 0.05; // if wagered < 5% of deposit before withdraw attempt → flag

/**
 * Create a wager requirement after a completed deposit.
 * @param {string} discordId
 * @param {number} depositCredits — amount deposited in credits
 */
async function createWagerRequirement(discordId, depositCredits) {
  const required = depositCredits * WAGER_MULTIPLIER;

  // Upsert: if user already has a wager requirement, add to it
  const existing = await prisma.wagerRequirement.findUnique({ where: { discordId } });

  if (existing) {
    return prisma.wagerRequirement.update({
      where: { discordId },
      data: { required: { increment: required } },
    });
  }

  return prisma.wagerRequirement.create({
    data: { discordId, required, wagered: 0 },
  });
}

/**
 * Record wagering progress.
 * Called from economyService.placeBet after each game bet.
 */
async function recordWager(discordId, amount) {
  const req = await prisma.wagerRequirement.findUnique({ where: { discordId } });
  if (!req || req.wagered >= req.required) return; // no requirement or already met

  const updated = await prisma.wagerRequirement.update({
    where: { discordId },
    data: { wagered: { increment: amount } },
  });

  // If requirement met, remove it
  if (updated.wagered >= updated.required) {
    await prisma.wagerRequirement.delete({ where: { discordId } });
  }
}

/**
 * Check if a user can withdraw.
 * Returns { allowed, remaining } — if allowed is false, withdraw is blocked.
 */
async function checkWithdrawAllowed(discordId) {
  const req = await prisma.wagerRequirement.findUnique({ where: { discordId } });
  if (!req) return { allowed: true, remaining: 0 };

  const remaining = Math.max(0, req.required - req.wagered);
  return { allowed: remaining <= 0, remaining };
}

/**
 * Fraud detection — flag a user if they try to withdraw without adequate wagering.
 */
async function checkFraudRisk(discordId, depositCredits) {
  const req = await prisma.wagerRequirement.findUnique({ where: { discordId } });
  if (!req) return { flagged: false };

  const wageredRatio = req.wagered / req.required;
  if (wageredRatio < FRAUD_WAGER_RATIO) {
    // Log the fraud event
    await prisma.fraudFlag.upsert({
      where: { discordId },
      update: { count: { increment: 1 }, lastFlagged: new Date() },
      create: { discordId, reason: 'deposit_withdraw_no_wager', count: 1 },
    });

    return { flagged: true, reason: 'Insufficient wagering before withdrawal attempt.' };
  }

  return { flagged: false };
}

/**
 * Get a user's current wager requirement status.
 */
async function getWagerStatus(discordId) {
  const req = await prisma.wagerRequirement.findUnique({ where: { discordId } });
  if (!req) return null;
  return {
    required: req.required,
    wagered:  req.wagered,
    remaining: Math.max(0, req.required - req.wagered),
    pct: Math.min(100, Math.floor((req.wagered / req.required) * 100)),
  };
}

/** Daily withdrawal limit tracking */
const DAILY_WITHDRAWAL_LIMIT = 500000; // 500k credits per day
const MIN_WITHDRAWAL = 1000;           // 1000 credits minimum

async function checkDailyWithdrawalLimit(discordId, amount) {
  if (amount < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal is 🪙 ${MIN_WITHDRAWAL.toLocaleString()} credits.`);
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayWithdrawals = await prisma.withdrawal.aggregate({
    where: {
      user: { discordId },
      status: { in: ['pending', 'processing', 'completed'] },
      createdAt: { gte: startOfDay },
    },
    _sum: { amount: true },
  });

  const usedToday = todayWithdrawals._sum.amount || 0;
  const remaining = DAILY_WITHDRAWAL_LIMIT - usedToday;

  if (amount > remaining) {
    throw new Error(
      `Daily withdrawal limit is 🪙 ${DAILY_WITHDRAWAL_LIMIT.toLocaleString()}. ` +
      `You have 🪙 ${remaining.toLocaleString()} remaining today.`
    );
  }

  return { usedToday, remaining, limit: DAILY_WITHDRAWAL_LIMIT };
}

module.exports = {
  createWagerRequirement,
  recordWager,
  checkWithdrawAllowed,
  checkFraudRisk,
  getWagerStatus,
  checkDailyWithdrawalLimit,
  WAGER_MULTIPLIER,
  DAILY_WITHDRAWAL_LIMIT,
  MIN_WITHDRAWAL,
};
