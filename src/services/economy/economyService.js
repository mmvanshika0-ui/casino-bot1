/**
 * Economy Service — Updated
 *
 * Changes over original:
 *  - payoutWin: applies casino event payout multiplier (rank-aware)
 *  - addXP: applies rank XP multiplier + event XP multiplier
 *  - claimDaily: adds rank daily bonus + event double_daily
 *  - placeBet: records wager for wager requirement tracking + rank check
 *  - client param added to key functions for event/rank access
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const config = require('../../config/config');
const logger = require('../../utils/logger');

function getRankService()  { return require('../rank/rankService'); }
function getEventService() { return require('../events/casinoEventService'); }
function getRankConfig()   { return require('../rank/rankConfig'); }
function getWagerService() { return require('../wager/wagerService'); }

async function getOrCreateUser(discordId, username) {
  let user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) {
    user = await prisma.user.create({
      data: { discordId, username, balance: config.economy.startingBalance, rankId: 'bronze' },
    });
    logger.info(`Created new user: ${username} (${discordId})`);
  } else if (user.username !== username) {
    user = await prisma.user.update({ where: { discordId }, data: { username } });
  }
  return user;
}

async function getBalance(discordId) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  return user ? user.balance : 0;
}

async function addBalance(discordId, amount, type, game = null, description = null) {
  return prisma.user.update({
    where: { discordId },
    data: {
      balance:  { increment: amount },
      totalWon: amount > 0 ? { increment: amount } : undefined,
      transactions: { create: { type, amount, game, description } },
    },
  });
}

async function deductBalance(discordId, amount, type, game = null, description = null) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user || user.balance < amount) throw new Error('Insufficient balance');
  if (user.frozen) throw new Error('Account is frozen');

  return prisma.user.update({
    where: { discordId },
    data: {
      balance:      { decrement: amount },
      totalLost:    { increment: amount },
      totalWagered: { increment: amount },
      transactions: { create: { type, amount: -amount, game, description } },
    },
  });
}

async function placeBet(discordId, amount, game, client = null) {
  const cfg = config.games[game];
  if (!cfg) throw new Error('Invalid game');
  if (amount < cfg.minBet) throw new Error(`Minimum bet is ${cfg.minBet}`);
  if (amount > cfg.maxBet) throw new Error(`Maximum bet is ${cfg.maxBet}`);

  const updated = await deductBalance(discordId, amount, 'loss', game, `${game} bet`);

  try { await getWagerService().recordWager(discordId, amount); } catch (_) {}
  if (client) {
    try { await getRankService().checkAndUpdateRank(discordId, client); } catch (_) {}
  }

  return updated;
}

async function payoutWin(discordId, amount, game, client = null, sessionData = null) {
  let finalAmount = amount;
  let eventMult   = 1.0;

  if (client) {
    const user   = await prisma.user.findUnique({ where: { discordId } });
    const rankId = user?.rankId || 'bronze';
    eventMult    = getEventService().getPayoutMultiplier(client, rankId);
    finalAmount  = Math.floor(amount * eventMult);
  }

  const user = await prisma.user.update({
    where: { discordId },
    data: {
      balance:     { increment: finalAmount },
      totalWon:    { increment: finalAmount },
      gamesWon:    { increment: 1 },
      gamesPlayed: { increment: 1 },
      transactions: {
        create: {
          type:        'win',
          amount:      finalAmount,
          game,
          description: eventMult > 1
            ? `${game} win (${eventMult}x event boost)`
            : `${game} win`,
        },
      },
    },
  });

  if (sessionData) {
    await prisma.gameSession.create({
      data: {
        userId:        user.id,
        game,
        bet:           sessionData.bet    || 0,
        result:        'win',
        payout:        finalAmount,
        multiplier:    sessionData.multiplier ? sessionData.multiplier * eventMult : eventMult,
        serverSeedHash: sessionData.serverSeedHash || null,
        clientSeed:    sessionData.clientSeed || null,
        nonce:         sessionData.nonce || null,
      },
    }).catch(() => {});
  }

  return { user, finalAmount, eventMult };
}

async function recordLoss(discordId, game, sessionData = null) {
  const user = await prisma.user.update({
    where: { discordId },
    data: { gamesLost: { increment: 1 }, gamesPlayed: { increment: 1 } },
  });

  if (sessionData) {
    await prisma.gameSession.create({
      data: {
        userId:     user.id,
        game,
        bet:        sessionData.bet || 0,
        result:     'loss',
        payout:     0,
        multiplier: 0,
      },
    }).catch(() => {});
  }

  return user;
}

async function tipUser(fromId, toId, amount) {
  const sender = await prisma.user.findUnique({ where: { discordId: fromId } });
  if (!sender || sender.balance < amount) throw new Error('Insufficient balance');
  if (sender.frozen) throw new Error('Account is frozen');
  if (amount < config.economy.tipMin) throw new Error(`Minimum tip is ${config.economy.tipMin}`);

  await prisma.$transaction([
    prisma.user.update({
      where: { discordId: fromId },
      data: { balance: { decrement: amount }, transactions: { create: { type: 'tip_sent', amount: -amount, description: `Tip to ${toId}` } } },
    }),
    prisma.user.update({
      where: { discordId: toId },
      data: { balance: { increment: amount }, transactions: { create: { type: 'tip_received', amount, description: `Tip from ${fromId}` } } },
    }),
  ]);
}

async function claimDaily(discordId, client = null) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) throw new Error('User not found');

  const now = new Date();
  if (user.lastDaily) {
    const diff = now - new Date(user.lastDaily);
    if (diff < config.economy.dailyCooldown) throw new Error(`COOLDOWN:${config.economy.dailyCooldown - diff}`);
  }

  const rank      = getRankConfig().getRankFromWagered(user.totalWagered || 0);
  const rankBonus = rank.dailyBonus || 0;
  let eventMult   = 1.0;
  if (client) eventMult = getEventService().getDailyMultiplier(client);

  const baseReward  = config.economy.dailyReward;
  const totalReward = Math.floor((baseReward + rankBonus) * eventMult);

  await prisma.user.update({
    where: { discordId },
    data: {
      balance:   { increment: totalReward },
      lastDaily: now,
      transactions: {
        create: {
          type:        'daily',
          amount:      totalReward,
          description: [
            'Daily reward',
            rankBonus > 0  ? `+${rankBonus} rank bonus (${rank.name})` : null,
            eventMult > 1  ? `${eventMult}x event multiplier`           : null,
          ].filter(Boolean).join(' | '),
        },
      },
    },
  });

  return { totalReward, baseReward, rankBonus, eventMult, rank };
}

async function addXP(discordId, xp, client = null) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return;

  const rank      = getRankConfig().getRankFromWagered(user.totalWagered || 0);
  const rankMult  = rank.xpMultiplier || 1.0;
  let   eventMult = 1.0;
  if (client) eventMult = getEventService().getXPMultiplier(client);

  const finalXP = Math.floor(xp * rankMult * eventMult);
  return prisma.user.update({ where: { discordId }, data: { xp: { increment: finalXP } } });
}

async function vaultDeposit(discordId, amount) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user || user.balance < amount) throw new Error('Insufficient balance');
  return prisma.user.update({
    where: { discordId },
    data: { balance: { decrement: amount }, vaultBalance: { increment: amount }, vaultTransactions: { create: { type: 'deposit', amount } } },
  });
}

async function vaultWithdraw(discordId, amount) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user || user.vaultBalance < amount) throw new Error('Insufficient vault balance');
  return prisma.user.update({
    where: { discordId },
    data: { balance: { increment: amount }, vaultBalance: { decrement: amount }, vaultTransactions: { create: { type: 'withdraw', amount } } },
  });
}

async function getLeaderboard(type = 'balance', page = 1, limit = 10) {
  const skip     = (page - 1) * limit;
  const orderMap = {
    balance:  { balance:     'desc' },
    level:    { level:       'desc' },
    wins:     { gamesWon:    'desc' },
    games:    { gamesPlayed: 'desc' },
    xp:       { xp:          'desc' },
    wagered:  { totalWagered:'desc' },
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({ orderBy: orderMap[type] || orderMap.balance, skip, take: limit }),
    prisma.user.count(),
  ]);
  return { users, total, page, pages: Math.ceil(total / limit) };
}

async function getTransactionHistory(discordId, limit = 10) {
  return prisma.transaction.findMany({
    where: { user: { discordId } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

module.exports = {
  getOrCreateUser, getBalance, addBalance, deductBalance,
  placeBet, payoutWin, recordLoss, tipUser, claimDaily,
  vaultDeposit, vaultWithdraw, getLeaderboard, getTransactionHistory, addXP,
};
