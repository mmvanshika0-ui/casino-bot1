const { errorEmbed, successEmbed } = require('../../embeds/embedBuilder');
const config = require('../../config/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isAdmin(id) { return config.admin.ids.includes(id); }

module.exports = {
  name: 'clearbalance',
  description: '[ADMIN] Clear a user\'s balance.',

  async execute(message, args, client) {
    if (!isAdmin(message.author.id)) return message.reply({ embeds: [errorEmbed('Unauthorized', 'Admin only.')] });

    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [errorEmbed('Invalid', 'Mention a user.')] });

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });
    if (!user) return message.reply({ embeds: [errorEmbed('Not Found', 'User not registered.')] });

    await prisma.user.update({ where: { discordId: target.id }, data: { balance: 0 } });
    await prisma.adminLog.create({ data: { adminId: user.id, action: 'clearbalance', targetId: target.id, amount: user.balance } });

    await message.reply({ embeds: [successEmbed('Balance Cleared', `**${target.username}**'s balance has been cleared.`)] });
  },
};
