const { EmbedBuilder } = require('discord.js');
const { errorEmbed }   = require('../../embeds/embedBuilder');
const { getOrCreateCode, applyReferral, getReferralStats } = require('../../services/referral/referralService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');

module.exports = {
  name:        'referral',
  aliases:     ['ref', 'invite'],
  description: 'Get your referral code or use someone else\'s.',
  async execute(message, args, client) {
    const sub = (args[0] || 'code').toLowerCase();

    // .ref code — show user's referral code
    if (sub === 'code' || sub === 'my') {
      const ref   = await getOrCreateCode(message.author.id);
      const stats = await getReferralStats(message.author.id);

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🔗 Your Referral Code')
        .setDescription(
          `Share your code with friends!\n` +
          `They use \`.ref use ${ref.code}\` after joining.\n` +
          `You earn **2%** of every deposit they make. 💰`
        )
        .addFields(
          { name: '🎟️ Your Code',        value: `\`\`\`${ref.code}\`\`\``,             inline: false },
          { name: '👥 Total Referrals',   value: `${stats.uses}`,                       inline: true  },
          { name: '💰 Total Earned',      value: `🪙 ${formatBalance(stats.totalEarned)}`, inline: true },
        )
        .setFooter({ text: 'Casino Bot • Referral System' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // .ref use <code> — apply a referral code
    if (sub === 'use') {
      const code = args[1]?.toUpperCase();
      if (!code) return message.reply({ embeds: [errorEmbed('Missing Code', 'Usage: `.ref use <CODE>`')] });

      try {
        const ref = await applyReferral(message.author.id, code);

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ Referral Code Applied!')
          .setDescription(
            `You are now linked to <@${ref.referrerId}>.\n` +
            `They will earn **2%** commission on your deposits. 🎉`
          )
          .setFooter({ text: 'Casino Bot • Referral System' })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (err) {
        return message.reply({ embeds: [errorEmbed('Referral Error', err.message)] });
      }
    }

    // .ref stats — detailed stats
    if (sub === 'stats') {
      const stats = await getReferralStats(message.author.id);
      if (!stats.code) return message.reply({ embeds: [errorEmbed('No Code', 'Generate your referral code with `.ref code` first.')] });

      const lines = stats.referrals.length
        ? stats.referrals.map((r, i) =>
            `**${i + 1}.** <@${r.referredId}> — 🪙 ${formatBalance(r.totalCommission || 0)} earned`
          ).join('\n')
        : 'No referrals yet.';

      const embed = new EmbedBuilder()
        .setColor(config.colors.purple)
        .setTitle('📊 Referral Stats')
        .addFields(
          { name: '🎟️ Code',           value: `\`${stats.code}\``,                     inline: true  },
          { name: '👥 Referrals',       value: `${stats.uses}`,                         inline: true  },
          { name: '💰 Total Earned',    value: `🪙 ${formatBalance(stats.totalEarned)}`, inline: true  },
          { name: '👤 Recent Referrals', value: lines,                                  inline: false },
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    return message.reply({ embeds: [errorEmbed('Usage', '`.ref code` · `.ref use <CODE>` · `.ref stats`')] });
  },
};
