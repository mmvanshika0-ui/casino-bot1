/**
 * Referral System
 * - Each user gets a unique 8-char referral code
 * - New users can join with a referral code on first .deposit or via .ref use
 * - Referrer earns 2% of referred user's deposits automatically
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma  = new PrismaClient();

const REFERRAL_COMMISSION = 0.02; // 2% of referred user's deposit

/** Generate a unique 8-char uppercase referral code */
function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/** Get or create referral code for a user */
async function getOrCreateCode(discordId) {
  let ref = await prisma.referral.findUnique({ where: { referrerId: discordId } });
  if (!ref) {
    // Ensure uniqueness
    let code;
    let exists = true;
    while (exists) {
      code  = generateCode();
      exists = await prisma.referral.findUnique({ where: { code } });
    }
    ref = await prisma.referral.create({
      data: { referrerId: discordId, code },
    });
  }
  return ref;
}

/** Apply a referral code for a new user */
async function applyReferral(newUserDiscordId, code) {
  const ref = await prisma.referral.findUnique({ where: { code } });
  if (!ref) throw new Error('Invalid referral code.');
  if (ref.referrerId === newUserDiscordId) throw new Error('You cannot use your own referral code.');

  // Check if the user already used a referral code
  const existing = await prisma.referralUse.findUnique({ where: { referredId: newUserDiscordId } });
  if (existing) throw new Error('You have already used a referral code.');

  await prisma.referralUse.create({
    data: {
      referrerId: ref.referrerId,
      referredId: newUserDiscordId,
      code,
    },
  });

  return ref;
}

/**
 * Process referral commission when a referred user completes a deposit.
 * Called from the deposit callback.
 */
async function processDepositCommission(referredDiscordId, depositAmountCredits) {
  const use = await prisma.referralUse.findUnique({ where: { referredId: referredDiscordId } });
  if (!use) return null;

  const commission = Math.floor(depositAmountCredits * REFERRAL_COMMISSION);
  if (commission <= 0) return null;

  // Credit the referrer
  await prisma.user.update({
    where: { discordId: use.referrerId },
    data: {
      balance: { increment: commission },
      transactions: {
        create: {
          type: 'referral_commission',
          amount: commission,
          description: `Referral commission from ${referredDiscordId}`,
        },
      },
    },
  });

  // Track the commission
  await prisma.referralUse.update({
    where: { referredId: referredDiscordId },
    data: {
      totalCommission: { increment: commission },
      totalDeposits:   { increment: 1 },
    },
  });

  return { referrerId: use.referrerId, commission };
}

/** Get referral stats for a user */
async function getReferralStats(discordId) {
  const ref = await prisma.referral.findUnique({ where: { referrerId: discordId } });
  if (!ref) return { code: null, uses: 0, totalEarned: 0, referrals: [] };

  const uses = await prisma.referralUse.findMany({
    where: { referrerId: discordId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const totalEarned = uses.reduce((sum, u) => sum + (u.totalCommission || 0), 0);

  return { code: ref.code, uses: uses.length, totalEarned, referrals: uses };
}

module.exports = {
  getOrCreateCode,
  applyReferral,
  processDepositCommission,
  getReferralStats,
  REFERRAL_COMMISSION,
};
