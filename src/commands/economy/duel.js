const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getOrCreateUser, placeBet, payoutWin, recordLoss } = require('../../services/economy/economyService');
const { successEmbed, errorEmbed, baseEmbed } = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  name: 'duel',
  description: 'Challenge another player to a duel.',

  async execute(message, args, client) {
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);

    if (!target)         return message.reply({ embeds: [errorEmbed('Invalid', 'Mention a user to duel.')] });
    if (target.bot)      return message.reply({ embeds: [errorEmbed('Invalid', 'Cannot duel bots.')] });
    if (target.id === message.author.id) return message.reply({ embeds: [errorEmbed('Invalid', 'Cannot duel yourself.')] });
    if (!amount || amount < 10) return message.reply({ embeds: [errorEmbed('Invalid', 'Minimum duel amount is 10 credits.')] });

    const challenger = await getOrCreateUser(message.author.id, message.author.username);
    if (challenger.balance < amount) return message.reply({ embeds: [errorEmbed('Broke', `You need 🪙 ${formatBalance(amount)} to duel.`)] });

    await getOrCreateUser(target.id, target.username);

    // create duel record
    const expiresAt = new Date(Date.now() + config.economy.duelExpiry);
    const duel = await prisma.duel.create({
      data: {
        challengerId: challenger.id,
        challengedId: (await prisma.user.findUnique({ where: { discordId: target.id } })).id,
        amount,
        expiresAt,
      },
    });

    const embed = baseEmbed(
      '⚔️ Duel Challenge',
      `**${message.author.username}** challenges **${target.username}** to a duel!\n\n💰 **Stakes:** 🪙 ${formatBalance(amount)}\n⏳ **Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
    ).setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel:accept:${duel.id}:${target.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`duel:decline:${duel.id}:${target.id}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
    );

    await message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] });

    // auto-expire
    setTimeout(async () => {
      const d = await prisma.duel.findUnique({ where: { id: duel.id } });
      if (d?.status === 'pending') {
        await prisma.duel.update({ where: { id: duel.id }, data: { status: 'expired' } });
      }
    }, config.economy.duelExpiry);
  },

  interactionHandler: async function (interaction, parts, client) {
    const [action, duelId, targetId] = parts;

    if (action === 'accept' || action === 'decline') {
      if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ Not your duel.', ephemeral: true });

      await interaction.deferUpdate();

      const duel = await prisma.duel.findUnique({ where: { id: duelId } });
      if (!duel || duel.status !== 'pending') return interaction.editReply({ content: '❌ Duel expired or already resolved.', components: [] });
      if (new Date() > duel.expiresAt) {
        await prisma.duel.update({ where: { id: duelId }, data: { status: 'expired' } });
        return interaction.editReply({ content: '❌ Duel expired.', components: [] });
      }

      if (action === 'decline') {
        await prisma.duel.update({ where: { id: duelId }, data: { status: 'declined' } });
        return interaction.editReply({ embeds: [errorEmbed('Duel Declined', `${interaction.user.username} declined the duel.`)], components: [] });
      }

      // accept — both pay
      const challenger = await prisma.user.findUnique({ where: { id: duel.challengerId } });
      const challenged = await prisma.user.findUnique({ where: { id: duel.challengedId } });

      if (challenger.balance < duel.amount || challenged.balance < duel.amount) {
        await prisma.duel.update({ where: { id: duelId }, data: { status: 'declined' } });
        return interaction.editReply({ embeds: [errorEmbed('Duel Failed', 'One or both players do not have enough balance.')], components: [] });
      }

      // coin flip to decide winner
      const challengerWins = Math.random() < 0.5;
      const winner = challengerWins ? challenger : challenged;
      const loser  = challengerWins ? challenged : challenger;

      await Promise.all([
        prisma.user.update({ where: { id: winner.id }, data: { balance: { increment: duel.amount }, gamesWon: { increment: 1 }, gamesPlayed: { increment: 1 } } }),
        prisma.user.update({ where: { id: loser.id  }, data: { balance: { decrement: duel.amount }, gamesLost: { increment: 1 }, gamesPlayed: { increment: 1 } } }),
        prisma.duel.update({ where: { id: duelId }, data: { status: 'completed', winnerId: winner.id } }),
      ]);

      const winnerDiscord = await client.users.fetch(winner.discordId).catch(() => null);
      const embed = successEmbed(
        '⚔️ Duel Complete!',
        `🏆 **${winnerDiscord?.username || 'Winner'}** wins the duel!\n\n💰 Prize: 🪙 **${formatBalance(duel.amount * 2)}** credits`
      );

      await interaction.editReply({ embeds: [embed], components: [] });
    }
  },
};
