const { tipUser, getOrCreateUser } = require('../../services/economy/economyService');
const { successEmbed, errorEmbed } = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');

module.exports = {
  name: 'tip',
  description: 'Tip credits to another user.',

  async execute(message, args, client) {
    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);

    if (!target)         return message.reply({ embeds: [errorEmbed('Invalid', 'Mention a user to tip.')] });
    if (target.bot)      return message.reply({ embeds: [errorEmbed('Invalid', 'Cannot tip bots.')] });
    if (target.id === message.author.id) return message.reply({ embeds: [errorEmbed('Invalid', 'Cannot tip yourself.')] });
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid', 'Enter a valid amount.')] });

    await getOrCreateUser(target.id, target.username);
    await tipUser(message.author.id, target.id, amount);

    const embed = successEmbed('Tip Sent', `🪙 **${formatBalance(amount)}** credits sent to **${target.username}**!`);
    await message.reply({ embeds: [embed] });
  },
};
