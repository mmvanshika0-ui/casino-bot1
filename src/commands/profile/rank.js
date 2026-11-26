const { EmbedBuilder }   = require('discord.js');
const { PrismaClient }   = require('@prisma/client');
const { errorEmbed }     = require('../../embeds/embedBuilder');
const { formatBalance }  = require('../../utils/format');
const { getRankProgress, getRankFromWagered, RANKS } = require('../../services/rank/rankConfig');
const { getUserRank, getRankLeaderboard }             = require('../../services/rank/rankService');
const { getActiveEvent }                              = require('../../services/events/casinoEventService');

const prisma = new PrismaClient();

function buildRankProgressBar(pct, length = 16) {
  const filled = Math.round((pct / 100) * length);
  const empty  = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
  name:        'rank',
  aliases:     ['tier', 'vip', 'mrank'],
  description: 'View your rank, perks, and progress to the next tier.',
  async execute(message, args, client) {
    const sub = (args[0] || 'me').toLowerCase();

    // ── .rank me / .rank @user ─────────────────────────────────
    if (sub === 'me' || message.mentions.users.size > 0 || !isNaN(parseInt(sub)) === false) {
      const target   = message.mentions.users.first() || message.author;
      const user     = await prisma.user.findUnique({ where: { discordId: target.id } });

      if (!user) return message.reply({ embeds: [errorEmbed('No Account', 'This user hasn\'t played yet.')] });

      const { current, next, remaining, pct } = getRankProgress(user.totalWagered);
      const bar      = buildRankProgressBar(pct);
      const event    = getActiveEvent(client);

      const embed = new EmbedBuilder()
        .setColor(current.color)
        .setTitle(`${current.emoji} ${target.username} — ${current.name} Rank`)
        .setDescription(`*"${current.description}"*`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          {
            name:  '📊 Rank Progress',
            value: next
              ? `${bar} **${pct}%**\n🎯 Wagering to **${next.emoji} ${next.name}**: 🪙 ${formatBalance(remaining)} more`
              : `${bar} **MAX RANK**\n🖤 You have reached the pinnacle.`,
            inline: false,
          },
          { name: '💸 Total Wagered',   value: `🪙 ${formatBalance(user.totalWagered)}`,         inline: true },
          { name: '⭐ XP Multiplier',   value: `**${current.xpMultiplier}×** per game`,           inline: true },
          { name: '💰 Daily Bonus',     value: `+🪙 ${formatBalance(current.dailyBonus)}`,        inline: true },
          { name: '🔥 Event Mult',      value: `**${current.eventMultiplier}×** during events`,   inline: true },
          { name: '📤 Withdraw Limit',  value: `🪙 ${formatBalance(current.withdrawLimit)}/day`,  inline: true },
          current.shopDiscount > 0
            ? { name: '🛒 Shop Discount', value: `**${(current.shopDiscount * 100).toFixed(0)}%** off`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true },
        );

      if (event) {
        embed.addFields({
          name:  `🎉 Active Event: ${event.type.replace(/_/g, ' ').toUpperCase()}`,
          value: `Your payout multiplier right now: **${current.eventMultiplier}×** · Ends <t:${Math.floor(event.expiresAt / 1000)}:R>`,
          inline: false,
        });
      }

      embed.setFooter({ text: 'Casino Bot • Rank System — Wager more to rank up' }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ── .rank list — all tiers ──────────────────────────────────
    if (sub === 'list' || sub === 'tiers' || sub === 'all') {
      const lines = RANKS.slice().reverse().map(r => {
        const wageredFmt = r.minWagered >= 1_000_000
          ? `${(r.minWagered / 1_000_000).toFixed(0)}M`
          : r.minWagered >= 1_000
            ? `${(r.minWagered / 1_000).toFixed(0)}K`
            : '0';
        return (
          `${r.emoji} **${r.name}** — 🪙 ${wageredFmt}+ wagered\n` +
          `  XP: **${r.xpMultiplier}×** · Daily: +**${formatBalance(r.dailyBonus)}** · Event: **${r.eventMultiplier}×**` +
          (r.shopDiscount > 0 ? ` · Shop: **${(r.shopDiscount * 100).toFixed(0)}% off**` : '')
        );
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎖️ Rank Tiers — All Levels')
        .setDescription(lines)
        .setFooter({ text: 'Rank is based on lifetime credits wagered • Casino Bot' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ── .rank top — rank leaderboard ───────────────────────────
    if (sub === 'top' || sub === 'lb' || sub === 'leaderboard') {
      const leaders = await getRankLeaderboard(15);
      const medals  = ['🥇', '🥈', '🥉'];

      const lines = leaders.map((u, i) => {
        const medal = i < 3 ? medals[i] : `**#${i + 1}**`;
        return `${medal} ${u.rank.emoji} **${u.username}** — ${u.rank.name} · 🪙 ${formatBalance(u.totalWagered)} wagered`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Rank Leaderboard — Top Wagerers')
        .setDescription(lines || 'No players yet.')
        .setFooter({ text: 'Casino Bot • Rank Leaderboard • .rank list to see all tiers' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    return message.reply({ embeds: [errorEmbed('Usage', '`.rank` · `.rank @user` · `.rank list` · `.rank top`')] });
  },
};
