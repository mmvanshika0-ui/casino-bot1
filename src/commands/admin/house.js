const { getHouseBalance } = require('../../services/transaction/apironeService');
const { houseBalanceEmbed, errorEmbed } = require('../../embeds/embedBuilder');
const config = require('../../config/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isAdmin(id) { return config.admin.ids.includes(id); }

module.exports = {
  name: 'house',
  aliases: ['housebal', 'dashboard'],
  description: '[ADMIN] View house balance dashboard.',

  async execute(message, args, client) {
    if (!isAdmin(message.author.id)) return message.reply({ embeds: [errorEmbed('Unauthorized', 'Admin only.')] });

    const [totalBalResult, totalPlayers, totalGames, wageredResult, wonResult, depositResult, withdrawResult] = await Promise.all([
      prisma.user.aggregate({ _sum: { balance: true, vaultBalance: true } }),
      prisma.user.count(),
      prisma.gameSession.count(),
      prisma.user.aggregate({ _sum: { totalWagered: true } }),
      prisma.user.aggregate({ _sum: { totalWon: true } }),
      prisma.deposit.aggregate({ _sum: { amount: true }, where: { status: 'completed' } }),
      prisma.withdrawal.aggregate({ _sum: { amount: true }, where: { status: 'completed' } }),
    ]);

    const stats = {
      totalBalance:   (totalBalResult._sum.balance || 0) + (totalBalResult._sum.vaultBalance || 0),
      totalPlayers,
      totalGames,
      totalWagered:   wageredResult._sum.totalWagered || 0,
      totalWon:       wonResult._sum.totalWon         || 0,
      totalDeposited: (depositResult._sum.amount      || 0) * 100,
      totalWithdrawn: (withdrawResult._sum.amount     || 0),
    };

    let houseData = null;
    try { houseData = await getHouseBalance(); } catch {}

    const embed = houseBalanceEmbed(houseData, stats);
    await message.reply({ embeds: [embed] });
  },
};
