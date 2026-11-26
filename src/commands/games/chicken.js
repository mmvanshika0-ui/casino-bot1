const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const chicken = require('../../games/chicken/handler');

module.exports = {
  name: 'chicken',
  description: 'Play Chicken Cross.',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.chicken <amount>`')] });
    try { await placeBet(message.author.id, amount, 'chicken'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = chicken.startGame(message.author.id, amount);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [chicken.buildEmbed(state, message.author)], components: chicken.buildRoadDisplay(state) });
  },
};
