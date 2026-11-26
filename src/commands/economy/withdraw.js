/**
 * .withdraw — Updated
 * Additions:
 *  - Checks wager requirement before allowing withdrawal
 *  - Daily withdrawal limit (500k credits)
 *  - Minimum withdrawal (1000 credits)
 *  - Fraud detection flag on suspicious withdraw
 */

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getOrCreateUser }        = require('../../services/economy/economyService');
const { errorEmbed, withdrawEmbed } = require('../../embeds/embedBuilder');
const { formatBalance }          = require('../../utils/format');
const { checkWithdrawAllowed, checkDailyWithdrawalLimit, checkFraudRisk } = require('../../services/wager/wagerService');
const apironeService             = require('../../services/transaction/apironeService');
const { PrismaClient }           = require('@prisma/client');
const config                     = require('../../config/config');

const prisma = new PrismaClient();

module.exports = {
  name:        'withdraw',
  aliases:     ['wd', 'cashout'],
  description: 'Withdraw credits as crypto.',
  async execute(message, args, client) {
    const user = await getOrCreateUser(message.author.id, message.author.username);

    if (user.frozen) {
      return message.reply({ embeds: [errorEmbed('Account Frozen', 'Your account is frozen. Contact support.')] });
    }

    // ── Wager requirement check ─────────────────────────────────
    const { allowed, remaining } = await checkWithdrawAllowed(message.author.id);
    if (!allowed) {
      return message.reply({
        embeds: [errorEmbed(
          '⚠️ Wager Requirement Active',
          `You must wager 🪙 **${formatBalance(remaining)}** more credits before withdrawing.\n\n` +
          `This is due to an active bonus or deposit match. Play any game to meet the requirement.\n` +
          `Use \`.wager\` to check your progress.`
        )],
      });
    }

    // Parse args: .withdraw btc <amount> <address>
    if (args.length < 3) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('💸 Withdraw Credits')
        .setDescription(
          '**Usage:** `.withdraw <currency> <credits> <address>`\n\n' +
          '**Example:** `.withdraw btc 10000 bc1q...`\n\n' +
          `**Rate:** 100 Credits = 1 USD\n` +
          `**Minimum:** 🪙 1,000 credits\n` +
          `**Daily Limit:** 🪙 500,000 credits`
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    const [currencyId, amountStr, address] = args;
    const amount   = parseInt(amountStr);
    const currency = config.currencies.find(c => c.id === currencyId.toLowerCase());

    if (!currency)  return message.reply({ embeds: [errorEmbed('Invalid Currency', `Supported: ${config.currencies.map(c => c.id).join(', ')}`)] });
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Enter a valid credit amount.')] });
    if (!address)   return message.reply({ embeds: [errorEmbed('Missing Address', 'Provide a valid wallet address.')] });
    if (user.balance < amount) return message.reply({ embeds: [errorEmbed('Insufficient Balance', `Balance: 🪙 ${formatBalance(user.balance)}`)] });

    // ── Daily limit check ───────────────────────────────────────
    try {
      await checkDailyWithdrawalLimit(message.author.id, amount);
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Withdrawal Limit', err.message)] });
    }

    // ── Fraud detection ─────────────────────────────────────────
    const fraudCheck = await checkFraudRisk(message.author.id, amount);
    if (fraudCheck.flagged) {
      return message.reply({
        embeds: [errorEmbed(
          '🚨 Withdrawal Flagged',
          `Your account has been flagged for suspicious activity: **${fraudCheck.reason}**\n\n` +
          `Your account is under review. If this is an error, contact support.`
        )],
      });
    }

    try {
      const withdrawal = await apironeService.createWithdrawal(
        message.author.id, currency.id, currency.network, address, amount
      );

      return message.reply({ embeds: [withdrawEmbed(withdrawal)] });
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Withdrawal Failed', err.message)] });
    }
  },
};
