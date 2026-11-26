const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const bj = require('../../games/blackjack/handler');

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Play Blackjack.',

  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.blackjack <amount>`')] });

    if (client.activeGames.has(message.author.id + '_blackjack')) {
      return message.reply({ embeds: [errorEmbed('Active Game', 'Finish your current blackjack game first.')] });
    }

    try {
      await placeBet(message.author.id, amount, 'blackjack');
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] });
    }

    const state = bj.startGame(message.author.id, amount);
    client.activeGames.set(state.id, state);

    const embed   = bj.buildEmbed(state, message.author);
    const buttons = bj.buildButtons(state);
    await message.reply({ embeds: [embed], components: buttons });
  },
};
