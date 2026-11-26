const { EmbedBuilder }   = require('discord.js');
const { errorEmbed }     = require('../../embeds/embedBuilder');
const { formatBalance }  = require('../../utils/format');
const { calculatePendingInterest, claimInterest, DAILY_RATE } = require('../../services/interest/interestService');
const config             = require('../../config/config');

module.exports = {
  name:        'interest',
  aliases:     ['collect', 'earn'],
  description: `Claim your daily vault interest (${(DAILY_RATE * 100).toFixed(2)}%/day, up to 7 days).`,
  async execute(message, args, client) {
    // Show preview if no args, claim if 'claim' arg
    const sub = (args[0] || '').toLowerCase();

    const pending = await calculatePendingInterest(message.author.id);

    if (sub === '' || sub === 'check') {
      if (pending.amount === 0) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.info)
          .setTitle('🏦 Vault Interest')
          .setDescription(
            pending.vaultBalance
              ? `No interest ready yet. Interest accumulates daily.\n\n` +
                `💰 Vault: 🪙 ${formatBalance(pending.vaultBalance)}\n` +
                `📈 Rate: **${(DAILY_RATE * 100).toFixed(2)}%**/day\n\n` +
                `Use \`.interest claim\` when ready.`
              : `You have **no credits in your vault**.\nDeposit into vault with \`.vault deposit <amount>\`.`
          )
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🏦 Vault Interest — Ready to Claim!')
        .addFields(
          { name: '💰 Vault Balance',   value: `🪙 ${formatBalance(pending.vaultBalance)}`, inline: true  },
          { name: '📅 Days Accrued',    value: `${pending.days} day${pending.days > 1 ? 's' : ''}`, inline: true },
          { name: '📈 Daily Rate',      value: `${(DAILY_RATE * 100).toFixed(2)}%`,         inline: true  },
          { name: '💎 Pending Interest',value: `🪙 **${formatBalance(pending.amount)}**`,   inline: false },
        )
        .setDescription('Use `.interest claim` to collect!')
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'claim') {
      try {
        const result = await claimInterest(message.author.id);
        const embed  = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ Interest Claimed!')
          .addFields(
            { name: '💎 Earned',        value: `🪙 **${formatBalance(result.amount)}**`,     inline: true  },
            { name: '📅 Days',          value: `${result.days}`,                              inline: true  },
            { name: '💰 New Balance',   value: `🪙 ${formatBalance(result.newBalance)}`,      inline: true  },
          )
          .setFooter({ text: 'Interest accrues daily on vault balance.' })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      } catch (err) {
        return message.reply({ embeds: [errorEmbed('Interest Error', err.message)] });
      }
    }

    return message.reply({ embeds: [errorEmbed('Usage', '`.interest` or `.interest claim`')] });
  },
};
