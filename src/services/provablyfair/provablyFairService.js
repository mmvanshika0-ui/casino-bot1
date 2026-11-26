/**
 * Provably Fair System
 * Each game result is derived from: HMAC-SHA256(serverSeed, clientSeed:nonce)
 * Players can verify any result independently after the server seed is revealed.
 *
 * Flow:
 *  1. Server generates serverSeed, hashes it → serverSeedHash (shown to player BEFORE game)
 *  2. Player can set their own clientSeed (optional, random default)
 *  3. Game uses HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`) to derive outcome
 *  4. After game, server seed is revealed — player can verify the hash and outcome
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** Generate a cryptographically secure server seed */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/** Generate a random client seed (used as default if player hasn't set one) */
function generateClientSeed() {
  return crypto.randomBytes(16).toString('hex');
}

/** Hash a server seed so it can be shown to the player before the game */
function hashServerSeed(serverSeed) {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

/**
 * Derive a float [0, 1) from HMAC-SHA256(serverSeed, clientSeed:nonce)
 * Uses first 8 hex chars of the HMAC → 32-bit int → divide by 2^32
 */
function deriveFloat(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hex = hmac.digest('hex');
  // Take first 8 hex chars (4 bytes = 32 bits)
  const dec = parseInt(hex.slice(0, 8), 16);
  return dec / 0x100000000; // divide by 2^32
}

/**
 * Derive multiple floats for games needing multiple random values (e.g. slots reels)
 */
function deriveFloats(serverSeed, clientSeed, nonce, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const hmac = crypto.createHmac('sha256', serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${i}`);
    const hex = hmac.digest('hex');
    const dec = parseInt(hex.slice(0, 8), 16);
    results.push(dec / 0x100000000);
  }
  return results;
}

/**
 * Derive crash point from seed — same algo as a real crash game
 * Returns crash point ≥ 1.00
 */
function deriveCrashPoint(serverSeed, clientSeed, nonce) {
  const float = deriveFloat(serverSeed, clientSeed, nonce);
  if (float === 0) return 1.0;
  // House edge: 1% → crash point derived from float
  const houseEdge = 0.01;
  const rawPoint = 1 / (1 - float * (1 - houseEdge));
  return Math.max(1.0, parseFloat(rawPoint.toFixed(2)));
}

/**
 * Get or create a user's active seed pair.
 * A seed pair is rotated after each game (nonce increments).
 */
async function getSeedPair(discordId) {
  let pair = await prisma.seedPair.findFirst({
    where: { discordId, active: true },
  });

  if (!pair) {
    const serverSeed = generateServerSeed();
    const clientSeed = generateClientSeed();
    pair = await prisma.seedPair.create({
      data: {
        discordId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed,
        nonce: 0,
        active: true,
      },
    });
  }

  return pair;
}

/**
 * Increment nonce after each game — keeps seed chain progressing
 */
async function incrementNonce(pairId) {
  return prisma.seedPair.update({
    where: { id: pairId },
    data: { nonce: { increment: 1 } },
  });
}

/**
 * Rotate seeds: reveal current server seed, generate a fresh pair.
 * Returns the revealed server seed for verification.
 */
async function rotateSeedPair(discordId) {
  const current = await prisma.seedPair.findFirst({
    where: { discordId, active: true },
  });

  if (!current) return null;

  // Deactivate current pair (server seed revealed)
  await prisma.seedPair.update({
    where: { id: current.id },
    data: { active: false, revealedAt: new Date() },
  });

  // Create fresh pair
  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const newPair = await prisma.seedPair.create({
    data: {
      discordId,
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      clientSeed,
      nonce: 0,
      active: true,
    },
  });

  return { revealed: current, fresh: newPair };
}

/**
 * Set a custom client seed for the user's active pair
 */
async function setClientSeed(discordId, clientSeed) {
  if (!clientSeed || clientSeed.length < 1 || clientSeed.length > 64) {
    throw new Error('Client seed must be 1–64 characters.');
  }
  const pair = await prisma.seedPair.findFirst({ where: { discordId, active: true } });
  if (!pair) throw new Error('No active seed pair.');

  return prisma.seedPair.update({
    where: { id: pair.id },
    data: { clientSeed },
  });
}

/**
 * Get seed history (old pairs with revealed server seeds)
 */
async function getSeedHistory(discordId, limit = 5) {
  return prisma.seedPair.findMany({
    where: { discordId, active: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Verify a past result.
 * Given serverSeed + clientSeed + nonce, recompute and return the float.
 */
function verifyResult(serverSeed, clientSeed, nonce) {
  const float = deriveFloat(serverSeed, clientSeed, nonce);
  const hash = hashServerSeed(serverSeed);
  return { float, hash, serverSeed, clientSeed, nonce };
}

module.exports = {
  generateServerSeed,
  generateClientSeed,
  hashServerSeed,
  deriveFloat,
  deriveFloats,
  deriveCrashPoint,
  getSeedPair,
  incrementNonce,
  rotateSeedPair,
  setClientSeed,
  getSeedHistory,
  verifyResult,
};
