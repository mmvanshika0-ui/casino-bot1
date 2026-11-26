/**
 * Rank Service
 *
 * - Checks if a user's rank has changed after every bet
 * - Assigns / removes Discord roles automatically on rank-up or rank-down
 * - Posts a rank-up announcement embed to the notifications channel
 * - Rank stored in DB on User model (rankId field — add via migration)
 * - Rank-up gives a one-time bonus payout
 */

const { EmbedBuilder }  = require('discord.js');
const { PrismaClient }  = require('@prisma/client');
const { getRankFromWagered, getRankById, getRankProgress, RANKS } = require('./rankConfig');
const { formatBalance } = require('../../utils/format');

const prisma = new PrismaClient();

// One-time bonus credits for each rank-up
const RANKUP_BONUS = {
  silver:   5_000,
  gold:     25_000,
  platinum: 100_000,
  diamond:  500_000,
  obsidian: 2_000_000,
};

/**
 * Check if a user's rank changed after a wager update.
 * Call this after every deductBalance / placeBet.
 *
 * @param {string} discordId
 * @param {Client} client     — Discord client, used for role assignment + notifications
 * @param {Guild}  guild      — Discord guild object (or null; fetched from env if null)
 * @returns {object|null}     — rank-up data if promoted, else null
 */
async function checkAndUpdateRank(discordId, client, guild = null) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return null;

  const newRank = getRankFromWagered(user.totalWagered);
  const oldRank = user.rankId ? getRankById(user.rankId) : getRankById('bronze');

  // No change
  if (newRank.id === oldRank.id) return null;

  // Rank changed — update DB
  await prisma.user.update({
    where: { discordId },
    data:  { rankId: newRank.id },
  });

  const isPromotion = RANKS.findIndex(r => r.id === newRank.id) <
                      RANKS.findIndex(r => r.id === oldRank.id);

  // ── Discord role assignment ─────────────────────────────────
  try {
    const targetGuild = guild || await fetchGuild(client);
    if (targetGuild) {
      const member = await targetGuild.members.fetch(discordId).catch(() => null);
      if (member) {
        // Remove all rank roles first
        for (const rank of RANKS) {
          const roleId = process.env[rank.roleEnvKey];
          if (roleId && member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => {});
          }
        }
        // Add new rank role
        const newRoleId = process.env[newRank.roleEnvKey];
        if (newRoleId) {
          await member.roles.add(newRoleId).catch(() => {});
        }
      }
    }
  } catch (_) {}

  // ── Rank-up bonus ───────────────────────────────────────────
  let bonus = 0;
  if (isPromotion) {
    bonus = RANKUP_BONUS[newRank.id] || 0;
    if (bonus > 0) {
      await prisma.user.update({
        where: { discordId },
        data: {
          balance: { increment: bonus },
          transactions: {
            create: {
              type:        'rank_bonus',
              amount:      bonus,
              description: `Rank-up bonus — ${oldRank.name} → ${newRank.name}`,
            },
          },
        },
      });
    }
  }

  // ── Rank-up notification ────────────────────────────────────
  if (isPromotion) {
    await postRankUpNotification(client, discordId, oldRank, newRank, bonus);
  }

  return { oldRank, newRank, isPromotion, bonus };
}

/** Post rank-up embed to notification channel + DM the user */
async function postRankUpNotification(client, discordId, oldRank, newRank, bonus) {
  const channelId = process.env.NOTIFICATIONS_CHANNEL_ID;

  const embed = new EmbedBuilder()
    .setColor(newRank.color)
    .setTitle(`${newRank.emoji} RANK UP — ${newRank.name.toUpperCase()}!`)
    .setDescription(
      `<@${discordId}> just ranked up from **${oldRank.emoji} ${oldRank.name}** to **${newRank.emoji} ${newRank.name}**!\n\n` +
      `*"${newRank.description}"*`
    )
    .addFields(
      { name: '📈 XP Multiplier',    value: `**${newRank.xpMultiplier}×**`,                    inline: true },
      { name: '💰 Daily Bonus',      value: `+🪙 ${formatBalance(newRank.dailyBonus)}`,         inline: true },
      { name: '🔥 Event Multiplier', value: `**${newRank.eventMultiplier}×** during events`,    inline: true },
      bonus > 0
        ? { name: '🎁 Rank-Up Bonus', value: `🪙 **${formatBalance(bonus)}** credited!`,       inline: false }
        : { name: '\u200b', value: '\u200b', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: '🎰 Casino Bot • Rank System' });

  // Post to notifications channel
  if (channelId) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
  }

  // DM the user
  try {
    const discordUser = await client.users.fetch(discordId);
    const dmEmbed = new EmbedBuilder()
      .setColor(newRank.color)
      .setTitle(`${newRank.emoji} You ranked up to ${newRank.name}!`)
      .setDescription(
        `Your lifetime wagering hit the **${newRank.name}** threshold!\n\n` +
        `**New perks unlocked:**\n` +
        `• **${newRank.xpMultiplier}×** XP per game\n` +
        `• **+🪙 ${formatBalance(newRank.dailyBonus)}** bonus on daily claim\n` +
        `• **${newRank.eventMultiplier}×** payout multiplier during casino events\n` +
        (newRank.shopDiscount > 0 ? `• **${(newRank.shopDiscount * 100).toFixed(0)}%** off shop items\n` : '') +
        (bonus > 0 ? `\n🎁 **Rank-up bonus: 🪙 ${formatBalance(bonus)} credited to your balance!**` : '')
      )
      .setTimestamp();
    await discordUser.send({ embeds: [dmEmbed] }).catch(() => {});
  } catch (_) {}
}

/** Get a user's current rank — reads from DB, falls back to calculating from totalWagered */
async function getUserRank(discordId) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return getRankById('bronze');

  // Recalculate in case rankId is stale
  const computed = getRankFromWagered(user.totalWagered);

  // Auto-fix stale rankId
  if (!user.rankId || user.rankId !== computed.id) {
    await prisma.user.update({ where: { discordId }, data: { rankId: computed.id } }).catch(() => {});
  }

  return computed;
}

/** Utility: fetch the first guild the bot is in (single-guild bots) */
async function fetchGuild(client) {
  const guildId = process.env.GUILD_ID;
  if (guildId) return client.guilds.fetch(guildId).catch(() => null);
  return client.guilds.cache.first() || null;
}

/** Get leaderboard sorted by rank tier then totalWagered */
async function getRankLeaderboard(limit = 20) {
  const users = await prisma.user.findMany({
    orderBy: { totalWagered: 'desc' },
    take:    limit,
    select: {
      discordId:    true,
      username:     true,
      totalWagered: true,
      rankId:       true,
      gamesPlayed:  true,
    },
  });

  return users.map(u => ({
    ...u,
    rank: getRankFromWagered(u.totalWagered),
  }));
}

module.exports = {
  checkAndUpdateRank,
  getUserRank,
  getRankLeaderboard,
  postRankUpNotification,
  RANKUP_BONUS,
};
