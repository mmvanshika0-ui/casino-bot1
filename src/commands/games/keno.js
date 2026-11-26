const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const keno = require('../../games/keno/handler');

module.exports = {
  name: 'keno',
  description: 'Play Keno.',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.keno <amount>`')] });
    try { await placeBet(message.author.id, amount, 'keno'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = keno.startGame(message.author.id, amount);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [keno.buildEmbed(state, message.author)], components: keno.buildGridDisplay(state) });
  },
};
