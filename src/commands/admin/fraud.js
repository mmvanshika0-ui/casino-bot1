/**
 * .fraud — Admin command to review and manage fraud flags
 * Subcommands: list, resolve <userId>, freeze <userId>
 */

const { EmbedBuilder } = require('discord.js');
const { errorEmbed }   = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const { PrismaClient } = require('@prisma/client');
const config           = require('../../config/config');

const prisma = new PrismaClient();

function isAdmin(message) {
  return config.admin.ids.includes(message.author.id) ||
    (config.admin.roleId && message.member?.roles.cache.has(config.admin.roleId));
}

module.exports = {
  name:        'fraud',
  aliases:     ['fraudreview', 'flags'],
  description: 'Admin: review and manage fraud flags.',
  async execute(message, args, client) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [errorEmbed('No Permission', 'Admins only.')] });
    }

    const sub = (args[0] || 'list').toLowerCase();

    if (sub === 'list') {
      const flags = await prisma.fraudFlag.findMany({
        where:   { resolved: false },
        orderBy: { lastFlagged: 'desc' },
        take:    15,
      });

      if (!flags.length) {
        return message.reply({ embeds: [{ color: 0x2ECC71, title: '✅ No Active Fraud Flags', description: 'All clear.', timestamp: new Date() }] });
      }

      const lines = flags.map((f, i) =>
        `**${i + 1}.** <@${f.discordId}> — **${f.reason}** (×${f.count}) — <t:${Math.floor(new Date(f.lastFlagged).getTime() / 1000)}:R>`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🚨 Active Fraud Flags')
        .setDescription(lines)
        .setFooter({ text: `.fraud resolve <userId> | .fraud freeze <userId>` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'resolve') {
      const userId = args[1];
      if (!userId) return message.reply({ embeds: [errorEmbed('Usage', '.fraud resolve <discordId>')] });

      await prisma.fraudFlag.updateMany({
        where: { discordId: userId },
        data:  { resolved: true },
      });

      return message.reply({ embeds: [{ color: 0x2ECC71, title: '✅ Flag Resolved', description: `<@${userId}>'s fraud flag cleared.`, timestamp: new Date() }] });
    }

    if (sub === 'freeze') {
      const userId = args[1];
      if (!userId) return message.reply({ embeds: [errorEmbed('Usage', '.fraud freeze <discordId>')] });

      await prisma.user.update({
        where: { discordId: userId },
        data:  { frozen: true },
      });

      await prisma.fraudFlag.updateMany({
        where: { discordId: userId },
        data:  { resolved: true },
      });

      return message.reply({ embeds: [{ color: 0xE74C3C, title: '🔒 Account Frozen', description: `<@${userId}>'s account has been frozen.`, timestamp: new Date() }] });
    }

    return message.reply({ embeds: [errorEmbed('Usage', '`.fraud list` · `.fraud resolve <id>` · `.fraud freeze <id>`')] });
  },
};
