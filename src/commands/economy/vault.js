const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { vaultDeposit, vaultWithdraw, getOrCreateUser } = require('../../services/economy/economyService');
const { successEmbed, errorEmbed, baseEmbed } = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');

module.exports = {
  name: 'vault',
  description: 'Manage your vault.',

  async execute(message, args, client) {
    const user  = await getOrCreateUser(message.author.id, message.author.username);
    const embed = baseEmbed('🏦 Vault', `**Balance:** 🪙 ${formatBalance(user.balance)}\n**Vault:** 🪙 ${formatBalance(user.vaultBalance)}\n\nDeposit credits into your vault to keep them safe from losses.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vault:deposit:${message.author.id}`).setLabel('📥 Deposit to Vault').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`vault:withdraw:${message.author.id}`).setLabel('📤 Withdraw from Vault').setStyle(ButtonStyle.Success),
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  interactionHandler: async function (interaction, parts, client) {
    const [action, userId] = parts;
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not yours.', ephemeral: true });

    await interaction.reply({
      content: `💡 Enter the amount to **${action}** (numbers only):`,
      ephemeral: true,
    });

    const filter  = m => m.author.id === interaction.user.id && !isNaN(parseInt(m.content));
    const channel = interaction.channel;

    try {
      const collected = await channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
      const msg       = collected.first();
      const amount    = parseInt(msg.content);

      if (action === 'deposit') {
        await vaultDeposit(interaction.user.id, amount);
        await msg.reply({ embeds: [successEmbed('Vault Deposit', `🪙 **${formatBalance(amount)}** moved to your vault.`)] });
      } else {
        await vaultWithdraw(interaction.user.id, amount);
        await msg.reply({ embeds: [successEmbed('Vault Withdraw', `🪙 **${formatBalance(amount)}** moved to your balance.`)] });
      }
    } catch (err) {
      if (err.message === 'time') return;
      channel.send({ embeds: [errorEmbed('Vault Error', err.message)] }).catch(() => {});
    }
  },
};
