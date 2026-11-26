/**
 * .deposit — Updated
 * Additions:
 *  - First deposit 100% match bonus (up to 50,000 credits cap)
 *  - Referral commission fires on completed deposit
 *  - Wager requirement created after first deposit bonus
 *  - Referral code prompt on first deposit
 */

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { getOrCreateUser, addBalance }  = require('../../services/economy/economyService');
const { errorEmbed }                   = require('../../embeds/embedBuilder');
const { depositEmbed }                 = require('../../embeds/embedBuilder');
const { createWagerRequirement }       = require('../../services/wager/wagerService');
const { processDepositCommission }     = require('../../services/referral/referralService');
const { formatBalance }                = require('../../utils/format');
const apironeService                   = require('../../services/transaction/apironeService');
const { PrismaClient }                 = require('@prisma/client');
const config                           = require('../../config/config');

const prisma = new PrismaClient();

const FIRST_DEPOSIT_BONUS_CAP = 50_000; // max bonus credits
const WAGER_ON_BONUS          = true;   // bonus credits require wagering

module.exports = {
  name:        'deposit',
  aliases:     ['dep', 'fund'],
  description: 'Deposit crypto and receive credits. First deposit gets a 100% match bonus!',
  async execute(message, args, client) {
    const user = await getOrCreateUser(message.author.id, message.author.username);

    // Check if this is the user's first ever completed deposit
    const previousDeposit = await prisma.deposit.findFirst({
      where: { user: { discordId: message.author.id }, status: 'completed' },
    });
    const isFirstDeposit = !previousDeposit;

    // ── Currency selection ──────────────────────────────────────
    if (!args[0]) {
      const options = config.currencies.map(c => ({
        label:       `${c.name} (${c.symbol})`,
        value:       c.id,
        description: `Deposit ${c.symbol} → Credits`,
        emoji:       c.icon,
      }));

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`deposit:currency:${message.author.id}`)
          .setPlaceholder('Select a currency...')
          .addOptions(options)
      );

      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('💎 Deposit Credits')
        .setDescription(
          '**Rate:** 1 USD = 100 Credits\n\n' +
          (isFirstDeposit
            ? '🎁 **First Deposit Bonus: 100% match** up to 🪙 50,000 credits!\n\n'
            : '') +
          'Select the currency you want to deposit:'
        )
        .setFooter({ text: 'Casino Bot • Deposits processed automatically' })
        .setTimestamp();

      return message.reply({ embeds: [embed], components: [menu] });
    }

    // Direct currency arg: .deposit btc
    const currencyId = args[0].toLowerCase();
    const currency   = config.currencies.find(c => c.id === currencyId);
    if (!currency) {
      return message.reply({ embeds: [errorEmbed('Invalid Currency', `Supported: ${config.currencies.map(c => c.id).join(', ')}`)] });
    }

    try {
      // Create deposit via Apirone
      const deposit = await apironeService.createDeposit(message.author.id, currency.id, currency.network);

      // Mark first deposit flag
      if (isFirstDeposit) {
        await prisma.deposit.update({
          where: { id: deposit.id },
          data:  { isFirstDeposit: true },
        });
      }

      // Generate QR code
      const qrBuffer    = await apironeService.generateQR(deposit.address).catch(() => null);
      const attachments = qrBuffer ? [new AttachmentBuilder(qrBuffer, { name: 'qr.png' })] : [];

      const embed = depositEmbed(deposit, qrBuffer);

      if (isFirstDeposit) {
        embed.addFields({
          name:  '🎁 First Deposit Bonus',
          value: 'You\'ll receive a **100% match** (up to 🪙 50,000) automatically when your deposit confirms!\n' +
                 '⚠️ Bonus requires 3× wagering before withdrawal.',
          inline: false,
        });
      }

      return message.reply({ embeds: [embed], files: attachments });
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Deposit Failed', err.message)] });
    }
  },
};

/**
 * Called from the Apirone callback when a deposit completes.
 * Handles: first deposit bonus, referral commission, wager requirement.
 * Wire this into apironeService's completed deposit handler.
 *
 * @param {string} discordId
 * @param {number} creditsAdded  — credits already added by existing callback logic
 * @param {object} deposit       — Prisma Deposit record
 * @param {Client} client        — Discord client
 */
async function onDepositCompleted(discordId, creditsAdded, deposit, client) {
  // ── First Deposit Bonus ─────────────────────────────────────
  if (deposit.isFirstDeposit && !deposit.bonusGranted) {
    const bonus = Math.min(creditsAdded, FIRST_DEPOSIT_BONUS_CAP);
    if (bonus > 0) {
      await addBalance(discordId, bonus, 'first_deposit_bonus', null,
        `First deposit bonus — 100% match up to 🪙 ${formatBalance(FIRST_DEPOSIT_BONUS_CAP)}`);

      await prisma.deposit.update({
        where: { id: deposit.id },
        data:  { bonusGranted: true },
      });

      // Bonus amount requires wagering before withdrawal
      if (WAGER_ON_BONUS) {
        await createWagerRequirement(discordId, bonus);
      }

      // Notify user via DM
      try {
        const discordUser = await client.users.fetch(discordId);
        const bonusEmbed  = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🎁 First Deposit Bonus Credited!')
          .setDescription(
            `Your deposit of 🪙 ${formatBalance(creditsAdded)} received a **100% match bonus**!\n\n` +
            `💰 Bonus Added: 🪙 **${formatBalance(bonus)}**\n` +
            `⚠️ Wager 3× the bonus before withdrawing.`
          )
          .setTimestamp();
        await discordUser.send({ embeds: [bonusEmbed] }).catch(() => {});
      } catch (_) {}
    }
  }

  // ── Referral Commission ─────────────────────────────────────
  const refResult = await processDepositCommission(discordId, creditsAdded);
  if (refResult) {
    try {
      const referrer = await client.users.fetch(refResult.referrerId);
      const refEmbed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('💰 Referral Commission Earned!')
        .setDescription(
          `Your referral made a deposit!\n\n` +
          `💎 Commission: 🪙 **${formatBalance(refResult.commission)}** (2%)`
        )
        .setTimestamp();
      await referrer.send({ embeds: [refEmbed] }).catch(() => {});
    } catch (_) {}
  }

  // ── Wager requirement for deposit itself (not bonus) ────────
  // Standard casino practice: 1× deposit wagering
  // Uncomment if you want wager req on regular deposits too:
  // await createWagerRequirement(discordId, creditsAdded);
}

module.exports.onDepositCompleted = onDepositCompleted;
