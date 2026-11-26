/**
 * .rain <amount> — Admin or high-roller drops credits to everyone
 * active in the channel in the last 30 minutes.
 * "Active" = sent at least 1 message in this channel in the last 30m.
 * High-roller threshold: balance ≥ 500,000 credits (configurable).
 */

const { EmbedBuilder, Collection } = require('discord.js');
const { getOrCreateUser }   = require('../../services/economy/economyService');
const { errorEmbed }         = require('../../embeds/embedBuilder');
const { formatBalance }      = require('../../utils/format');
const { PrismaClient }       = require('@prisma/client');
const config                 = require('../../config/config');

const prisma = new PrismaClient();

const ACTIVE_WINDOW_MS     = 30 * 60 * 1000; // 30 minutes
const HIGH_ROLLER_THRESHOLD = 500_000;        // credits to qualify as high-roller

function isAdmin(member) {
  return config.admin.ids.includes(member.id) ||
    (config.admin.roleId && member.roles.cache.has(config.admin.roleId));
}

module.exports = {
  name:        'rain',
  aliases:     ['droprain', 'shower'],
  description: 'Drop credits to everyone active in the channel (admin or high-roller).',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount < 100) {
      return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Usage: `.rain <amount>` (minimum 100)')] });
    }

    const sender = await prisma.user.findUnique({ where: { discordId: message.author.id } });
    if (!sender) return message.reply({ embeds: [errorEmbed('No Account', 'Start by playing a game first.')] });

    const isAdminUser     = isAdmin(message.member);
    const isHighRoller    = sender.balance >= HIGH_ROLLER_THRESHOLD;

    if (!isAdminUser && !isHighRoller) {
      return message.reply({
        embeds: [errorEmbed('Not Authorized',
          `Only admins or High Rollers (balance ≥ 🪙 ${formatBalance(HIGH_ROLLER_THRESHOLD)}) can rain.\nYour balance: 🪙 ${formatBalance(sender.balance)}.`
        )],
      });
    }

    if (sender.balance < amount) {
      return message.reply({ embeds: [errorEmbed('Insufficient Balance', `You only have 🪙 ${formatBalance(sender.balance)}.`)] });
    }

    // Fetch recent messages in the channel
    const recentMessages = await message.channel.messages.fetch({ limit: 100 }).catch(() => new Collection());
    const cutoff         = Date.now() - ACTIVE_WINDOW_MS;

    // Collect unique users who sent messages recently (exclude bots and sender)
    const activeUserIds = new Set();
    for (const msg of recentMessages.values()) {
      if (msg.createdTimestamp >= cutoff &&
          !msg.author.bot &&
          msg.author.id !== message.author.id) {
        activeUserIds.add(msg.author.id);
      }
    }

    if (activeUserIds.size === 0) {
      return message.reply({ embeds: [errorEmbed('No Active Users', 'No one has sent a message in this channel in the last 30 minutes.')] });
    }

    const perUser    = Math.floor(amount / activeUserIds.size);
    const totalActual = perUser * activeUserIds.size;

    if (perUser < 1) {
      return message.reply({ embeds: [errorEmbed('Too Many Users', `With ${activeUserIds.size} active users, each would receive less than 1 credit.`)] });
    }

    // Deduct from sender
    await prisma.user.update({
      where: { discordId: message.author.id },
      data:  {
        balance: { decrement: totalActual },
        transactions: {
          create: { type: 'rain_sent', amount: -totalActual, description: `Rain to ${activeUserIds.size} users` },
        },
      },
    });

    // Credit each active user
    const mentions = [];
    for (const userId of activeUserIds) {
      await getOrCreateUser(userId, `user_${userId}`);
      await prisma.user.update({
        where: { discordId: userId },
        data:  {
          balance: { increment: perUser },
          transactions: {
            create: { type: 'rain_received', amount: perUser, description: `Rain from ${message.author.username}` },
          },
        },
      });
      mentions.push(`<@${userId}>`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00BFFF)
      .setTitle('🌧️ It\'s Raining Credits!')
      .setDescription(
        `**${message.author.username}** just made it rain!\n\n` +
        `💸 **🪙 ${formatBalance(perUser)}** credits dropped on **${activeUserIds.size}** active players!\n\n` +
        `${mentions.slice(0, 20).join(' ')}${mentions.length > 20 ? ` ...and ${mentions.length - 20} more` : ''}`
      )
      .addFields(
        { name: '🎁 Total Dropped', value: `🪙 ${formatBalance(totalActual)}`, inline: true },
        { name: '👥 Recipients',    value: `${activeUserIds.size} players`,     inline: true },
        { name: '💰 Per Player',    value: `🪙 ${formatBalance(perUser)}`,       inline: true },
      )
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Casino Bot • Rain — Active in last 30 minutes' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
