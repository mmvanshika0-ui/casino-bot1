const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const crash = require('../../games/crash/handler');

module.exports = {
  name: 'crash',
  description: 'Play Crash.',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.crash <amount>`')] });
    try { await placeBet(message.author.id, amount, 'crash'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    await crash.startGame(message.author.id, amount, message, client);
  },
};
