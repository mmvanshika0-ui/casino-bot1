const { getOrCreateUser } = require('../../services/economy/economyService');
const { balanceEmbed } = require('../../embeds/embedBuilder');
const { errorEmbed } = require('../../embeds/embedBuilder');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'wallet'],
  description: 'Check your or another user\'s balance.',

  async execute(message, args, client) {
    let targetUser = message.author;

    if (args[0]) {
      const mention = message.mentions.users.first();
      if (!mention) return message.reply({ embeds: [errorEmbed('Invalid User', 'Mention a valid user.')] });
      targetUser = mention;
    }

    const user  = await getOrCreateUser(targetUser.id, targetUser.username);
    const embed = balanceEmbed(user, targetUser);
    await message.reply({ embeds: [embed] });
  },
};
