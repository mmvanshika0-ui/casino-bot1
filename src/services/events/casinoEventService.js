/**
 * Casino Event Service
 *
 * Admin triggers a timed event. During the event, payouts / XP / dailies are modified
 * based on the player's rank tier.
 *
 * Event types:
 *   hot_streak   — payout multiplier (rank-aware: bronze/silver/gold = 2×, plat = 2.25×, diamond = 2.5×, obsidian = 3×)
 *   double_xp    — XP per game multiplied by 2 (stacks with rank XP multiplier)
 *   double_daily — daily reward doubled for everyone
 *   rain_boost   — .rain drops 3× the normal amount
 *   happy_hour   — combines double_xp + hot_streak at reduced multiplier (1.5×)
 *
 * Event state lives on the client object (client.casinoEvent) so it's instant-read per game.
 * Persisted to DB for display, but runtime always reads from client.casinoEvent.
 */

const { EmbedBuilder } = require('discord.js');
const { formatBalance, formatDuration } = require('../../utils/format');
const { getRankById } = require('../rank/rankConfig');

const EVENT_TYPES = {
  hot_streak:   { label: '🔥 Hot Streak',   description: 'Payout multiplier boosted by rank tier!', color: 0xFF4500 },
  double_xp:    { label: '⭐ Double XP',     description: '2× XP on every game result.',              color: 0xFFD700 },
  double_daily: { label: '💰 Double Daily',  description: 'Daily reward is doubled for everyone!',    color: 0x2ECC71 },
  rain_boost:   { label: '🌧️ Rain Boost',   description: 'Rain drops 3× the normal amount!',         color: 0x00BFFF },
  happy_hour:   { label: '🎉 Happy Hour',    description: '1.5× payouts + 2× XP for everyone.',      color: 0x9B59B6 },
};

/** Set a new casino event on the client */
function startEvent(client, type, durationMs, adminTag) {
  if (!EVENT_TYPES[type]) throw new Error(`Unknown event type: ${type}`);

  const expiresAt = Date.now() + durationMs;

  client.casinoEvent = {
    type,
    expiresAt,
    adminTag,
    startedAt: Date.now(),
  };

  // Auto-clear when it expires
  if (client._eventTimer) clearTimeout(client._eventTimer);
  client._eventTimer = setTimeout(() => {
    client.casinoEvent = null;
    // Update bot status back to jackpot
    updateStatusForEvent(client, null);
  }, durationMs);

  updateStatusForEvent(client, type);

  return client.casinoEvent;
}

/** Stop the current event early */
function stopEvent(client) {
  if (client._eventTimer) clearTimeout(client._eventTimer);
  client.casinoEvent = null;
  updateStatusForEvent(client, null);
}

/** Get current active event (or null) */
function getActiveEvent(client) {
  if (!client.casinoEvent) return null;
  if (Date.now() > client.casinoEvent.expiresAt) {
    client.casinoEvent = null;
    return null;
  }
  return client.casinoEvent;
}

/**
 * Get the payout multiplier for a player during an active event.
 * Takes rank into account for hot_streak and happy_hour.
 *
 * @param {Client} client
 * @param {string} rankId  — the player's current rank id
 * @returns {number}       — multiplier to apply to payout (1.0 = no change)
 */
function getPayoutMultiplier(client, rankId) {
  const event = getActiveEvent(client);
  if (!event) return 1.0;

  const rank = getRankById(rankId || 'bronze');

  switch (event.type) {
    case 'hot_streak':
      return rank.eventMultiplier;   // 2× → 3× based on rank

    case 'happy_hour':
      // flat 1.5× for everyone during happy hour
      return 1.5;

    default:
      return 1.0;
  }
}

/**
 * Get the XP multiplier for a player during an active event.
 * Stacks with rank XP multiplier (applied separately in economyService).
 */
function getXPMultiplier(client) {
  const event = getActiveEvent(client);
  if (!event) return 1.0;
  if (event.type === 'double_xp' || event.type === 'happy_hour') return 2.0;
  return 1.0;
}

/** Get the daily multiplier during an event */
function getDailyMultiplier(client) {
  const event = getActiveEvent(client);
  if (!event) return 1.0;
  if (event.type === 'double_daily') return 2.0;
  return 1.0;
}

/** Get the rain multiplier during an event */
function getRainMultiplier(client) {
  const event = getActiveEvent(client);
  if (!event) return 1.0;
  if (event.type === 'rain_boost') return 3.0;
  return 1.0;
}

/** Build event announcement embed */
function buildEventEmbed(event, durationMs) {
  const meta = EVENT_TYPES[event.type];
  const remaining = Math.max(0, event.expiresAt - Date.now());

  return new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.label} — EVENT ACTIVE!`)
    .setDescription(meta.description)
    .addFields(
      { name: '⏳ Time Remaining', value: `<t:${Math.floor(event.expiresAt / 1000)}:R>`,        inline: true },
      { name: '🎯 Started By',     value: event.adminTag,                                         inline: true },
      {
        name:   '📊 Rank Multipliers',
        value:  event.type === 'hot_streak' || event.type === 'happy_hour'
          ? '🥉 Bronze/Silver/Gold: **2×**\n🪙 Platinum: **2.25×**\n💎 Diamond: **2.5×**\n🖤 Obsidian: **3×**'
          : 'Applies equally to all ranks.',
        inline: false,
      },
    )
    .setFooter({ text: '🎰 Casino Bot • Casino Events' })
    .setTimestamp();
}

/** Update bot activity to reflect event state */
function updateStatusForEvent(client, eventType) {
  if (!client.user) return;
  if (eventType) {
    const meta = EVENT_TYPES[eventType];
    client.user.setActivity(`${meta.label} — Limited Time!`, { type: 3 }); // WATCHING
  } else {
    // Will be overwritten by jackpot status timer — just clear it
    client.user.setActivity('🎰 Casino | .help', { type: 0 });
  }
}

module.exports = {
  EVENT_TYPES,
  startEvent,
  stopEvent,
  getActiveEvent,
  getPayoutMultiplier,
  getXPMultiplier,
  getDailyMultiplier,
  getRainMultiplier,
  buildEventEmbed,
};
