const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const hilo = require('../../games/hilo/handler');

module.exports = {
  name: 'hilo',
  description: 'Play Hi-Lo.',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.hilo <amount>`')] });
    try { await placeBet(message.author.id, amount, 'hilo'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = hilo.startGame(message.author.id, amount);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [hilo.buildEmbed(state, message.author)], components: hilo.buildButtons(state) });
  },
};
