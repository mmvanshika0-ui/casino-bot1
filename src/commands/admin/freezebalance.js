const { errorEmbed, successEmbed } = require('../../embeds/embedBuilder');
const config = require('../../config/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isAdmin(userId) { return config.admin.ids.includes(userId); }

module.exports = {
  name: 'freezebalance',
  description: '[ADMIN] Freeze/unfreeze a user account.',

  async execute(message, args, client) {
    if (!isAdmin(message.author.id)) return message.reply({ embeds: [errorEmbed('Unauthorized', 'Admin only.')] });

    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid', 'Mention a user.')] });

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });
    if (!user) return message.reply({ embeds: [errorEmbed('Not Found', 'User not registered.')] });

    const newState = !user.frozen;
    await prisma.user.update({ where: { discordId: target.id }, data: { frozen: newState } });
    await prisma.adminLog.create({ data: { adminId: user.id, action: newState ? 'freeze' : 'unfreeze', targetId: target.id } });

    await message.reply({ embeds: [successEmbed('Account Updated', `**${target.username}** is now **${newState ? '🔒 Frozen' : '🔓 Unfrozen'}**.`)] });
  },
};
