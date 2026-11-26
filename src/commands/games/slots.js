const { placeBet }    = require('../../services/economy/economyService');
const { errorEmbed }  = require('../../embeds/embedBuilder');
const { recordWager } = require('../../services/wager/wagerService');
const slots           = require('../../games/slots/handler');

module.exports = {
  name:        'slots',
  aliases:     ['slot', 's'],
  description: 'Spin the slots! 5 reels, weighted symbols, jackpot, bonus rounds.',
  async execute(message, args, client) {
    // Active game guard
    for (const [, g] of client.activeGames) {
      if (g.userId === message.author.id) {
        return message.reply({ embeds: [errorEmbed('Active Game', 'Finish your current game first.')] });
      }
    }

    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.slots <amount>`')] });
    }

    try {
      await placeBet(message.author.id, amount, 'slots');
      await recordWager(message.author.id, amount);
    } catch (err) {
      return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] });
    }

    await slots.startGame(message, amount, client);
  },
};
