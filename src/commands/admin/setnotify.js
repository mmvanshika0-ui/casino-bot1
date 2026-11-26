/**
 * .setnotify — Set the notifications channel for big wins, jackpots, leaderboard changes.
 * Sets NOTIFICATIONS_CHANNEL_ID via runtime env (or store in DB for persistence).
 */

const { EmbedBuilder } = require('discord.js');
const { errorEmbed }   = require('../../embeds/embedBuilder');
const { PrismaClient } = require('@prisma/client');
const config           = require('../../config/config');

const prisma = new PrismaClient();

function isAdmin(message) {
  return config.admin.ids.includes(message.author.id) ||
    (config.admin.roleId && message.member?.roles.cache.has(config.admin.roleId));
}

module.exports = {
  name:        'setnotify',
  aliases:     ['setnotifications', 'notifychannel'],
  description: 'Admin: set the notifications channel for big wins and jackpots.',
  async execute(message, args, client) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [errorEmbed('No Permission', 'Admins only.')] });
    }

    const channel = message.mentions.channels.first() || message.channel;

    // Store in DB as a config key (requires a BotConfig model — add to schema if needed)
    // For now, set env at runtime (note: this resets on bot restart — set in .env for persistence)
    process.env.NOTIFICATIONS_CHANNEL_ID = channel.id;

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('✅ Notifications Channel Set')
      .setDescription(`Big wins, jackpots, and leaderboard changes will now post to ${channel}.`)
      .addFields({
        name:  '⚠️ Persistence Note',
        value: `Add \`NOTIFICATIONS_CHANNEL_ID=${channel.id}\` to your \`.env\` file to persist across restarts.`,
        inline: false,
      })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
