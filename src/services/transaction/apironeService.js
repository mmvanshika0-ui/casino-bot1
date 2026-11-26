const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const api = axios.create({
  baseURL: config.apirone.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apirone.apiKey}`,
  },
  timeout: 15000,
});

// ─── Account ───────────────────────────────────────────────────────────────

async function getAccountInfo() {
  const { data } = await api.get(`/accounts/${config.apirone.account}`);
  return data;
}

async function getAccountBalance() {
  const { data } = await api.get(`/accounts/${config.apirone.account}/balance`);
  return data;
}

// ─── Address generation ────────────────────────────────────────────────────

async function generateAddress(currency, userId, depositId) {
  const { data } = await api.post(`/accounts/${config.apirone.account}/addresses`, {
    currency,
    callback: {
      url: `${config.apirone.callbackUrl}?deposit_id=${depositId}&user_id=${userId}`,
    },
  });
  return data; // { address, currency, ... }
}

// ─── Deposit flow ──────────────────────────────────────────────────────────

async function createDeposit(discordId, currency) {
  const depositId = uuidv4();
  const expiresAt = new Date(Date.now() + config.economy.depositExpiry);

  // find user
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) throw new Error('User not found');

  // get address from apirone
  const addressData = await generateAddress(currency, user.id, depositId);

  const deposit = await prisma.deposit.create({
    data: {
      id:         depositId,
      userId:     user.id,
      currency,
      network:    addressData.currency || currency,
      address:    addressData.address,
      status:     'pending',
      apironeId:  addressData.id || depositId,
      expiresAt,
    },
  });

  return deposit;
}

async function getDeposit(depositId) {
  return await prisma.deposit.findUnique({ where: { id: depositId } });
}

async function getUserDeposits(discordId, limit = 10) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return [];
  return await prisma.deposit.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  });
}

// Called by webhook callback
async function handleDepositCallback(depositId, txData) {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.status === 'completed') return;

  const amountUSD      = txData.amount_usd   || 0;
  const amountCrypto   = txData.amount        || 0;
  const confirmations  = txData.confirmations || 0;
  const txHash         = txData.hash          || '';

  // require at least 1 confirmation
  if (confirmations < 1) {
    await prisma.deposit.update({
      where: { id: depositId },
      data:  { confirmations, txHash, amountCrypto, amount: amountUSD },
    });
    return;
  }

  const credits = Math.floor(amountUSD * 100); // 1 USD = 100 credits

  await prisma.$transaction([
    prisma.deposit.update({
      where: { id: depositId },
      data: {
        status:       'completed',
        amount:        amountUSD,
        amountCrypto,
        txHash,
        confirmations,
      },
    }),
    prisma.user.update({
      where: { id: deposit.userId },
      data: {
        balance: { increment: credits },
        transactions: {
          create: {
            type:        'deposit',
            amount:       credits,
            description: `Crypto deposit: ${amountCrypto} ${deposit.currency.toUpperCase()} (tx: ${txHash})`,
          },
        },
      },
    }),
  ]);

  logger.info(`Deposit completed: ${depositId} — +${credits} credits to user ${deposit.userId}`);
  return { credits, txHash, amountCrypto, currency: deposit.currency };
}

// ─── Withdrawal flow ───────────────────────────────────────────────────────

async function createWithdrawal(discordId, currency, address, amountCredits) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) throw new Error('User not found');
  if (user.balance < amountCredits) throw new Error('Insufficient balance');

  const amountUSD    = amountCredits / 100;
  const withdrawalId = uuidv4();

  // get live crypto price to calculate crypto amount
  let amountCrypto;
  try {
    const rateData = await getCryptoRate(currency);
    amountCrypto   = amountUSD / rateData.usd;
  } catch {
    amountCrypto = null;
  }

  // deduct balance immediately, hold pending
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        balance: { decrement: amountCredits },
        transactions: {
          create: {
            type:        'withdrawal',
            amount:      -amountCredits,
            description: `Withdrawal request: ${amountCrypto || '?'} ${currency.toUpperCase()} to ${address}`,
          },
        },
      },
    }),
    prisma.withdrawal.create({
      data: {
        id:          withdrawalId,
        userId:      user.id,
        currency,
        network:     currency,
        address,
        amount:      amountCredits,
        amountCrypto,
        status:      'pending',
      },
    }),
  ]);

  // send to apirone
  try {
    const { data } = await api.post(`/accounts/${config.apirone.account}/transfer`, {
      currency,
      outputs: [{ address, amount: amountCrypto }],
      subtract_fee_from_amount: true,
    });

    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data:  { status: 'processing', apironeId: data.id, txHash: data.hash },
    });

    logger.info(`Withdrawal sent: ${withdrawalId} — ${amountCrypto} ${currency} to ${address}`);
    return await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });

  } catch (err) {
    // refund on failure
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          balance: { increment: amountCredits },
          transactions: {
            create: {
              type: 'refund',
              amount: amountCredits,
              description: 'Withdrawal failed — refunded',
            },
          },
        },
      }),
      prisma.withdrawal.update({
        where: { id: withdrawalId },
        data:  { status: 'failed', reason: err.message },
      }),
    ]);
    throw new Error('Withdrawal failed: ' + err.message);
  }
}

async function getUserWithdrawals(discordId, limit = 10) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return [];
  return await prisma.withdrawal.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  });
}

// ─── Rates ─────────────────────────────────────────────────────────────────

async function getCryptoRate(currency) {
  const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
    params: { ids: coingeckoId(currency), vs_currencies: 'usd' },
    timeout: 8000,
  });
  const id  = coingeckoId(currency);
  const usd = data[id]?.usd;
  if (!usd) throw new Error('Rate not available');
  return { usd };
}

function coingeckoId(symbol) {
  const map = {
    btc: 'bitcoin', eth: 'ethereum', ltc: 'litecoin',
    usdt: 'tether', usdc: 'usd-coin', trx: 'tron',
    bnb: 'binancecoin', doge: 'dogecoin', sol: 'solana', xrp: 'ripple',
  };
  return map[symbol.toLowerCase()] || symbol.toLowerCase();
}

// ─── House balance ─────────────────────────────────────────────────────────

async function getHouseBalance() {
  try {
    const { data } = await api.get(`/accounts/${config.apirone.account}/balance`);
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  getAccountInfo, getAccountBalance, generateAddress,
  createDeposit, getDeposit, getUserDeposits, handleDepositCallback,
  createWithdrawal, getUserWithdrawals,
  getCryptoRate, getHouseBalance,
};
