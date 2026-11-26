const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const wheel = require('../../games/wheel/handler');

module.exports = {
  name: 'wheel',
  description: 'Spin the Wheel of Fortune.',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.wheel <amount>`')] });
    try { await placeBet(message.author.id, amount, 'wheel'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = wheel.startGame(message.author.id, amount);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [wheel.buildEmbed(state, message.author)], components: wheel.buildButtons(state.id) });
  },
};
