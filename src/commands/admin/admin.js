const { getOrCreateUser, addBalance } = require('../../services/economy/economyService');
const { getHouseBalance } = require('../../services/transaction/apironeService');
const { successEmbed, errorEmbed, houseBalanceEmbed } = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isAdmin(userId) {
  return config.admin.ids.includes(userId);
}

async function logAdmin(adminId, action, targetId = null, amount = null, description = null) {
  const admin = await prisma.user.findUnique({ where: { discordId: adminId } });
  if (!admin) return;
  await prisma.adminLog.create({ data: { adminId: admin.id, targetId, action, description, amount } });
}

module.exports = {
  name: 'getmoney',
  description: '[ADMIN] Add money to a user.',

  async execute(message, args, client) {
    if (!isAdmin(message.author.id)) return message.reply({ embeds: [errorEmbed('Unauthorized', 'Admin only.')] });

    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);
    if (!target || !amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid', 'Usage: `.getmoney @user amount`')] });

    await getOrCreateUser(target.id, target.username);
    await addBalance(target.id, amount, 'admin', null, `Admin grant by ${message.author.username}`);
    await logAdmin(message.author.id, 'getmoney', target.id, amount, `Granted to ${target.username}`);

    await message.reply({ embeds: [successEmbed('Credits Added', `🪙 **${formatBalance(amount)}** added to **${target.username}**.`)] });
  },
};
