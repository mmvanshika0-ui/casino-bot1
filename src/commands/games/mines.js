const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const mines = require('../../games/mines/handler');

module.exports = {
  name: 'mines',
  description: 'Play Mines. Usage: `.mines <bet> [minecount 1-24]`',

  async execute(message, args, client) {
    const amount     = parseInt(args[0]);
    const mineCount  = Math.min(24, Math.max(1, parseInt(args[1]) || 3));
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.mines <amount> [mines]`')] });

    try { await placeBet(message.author.id, amount, 'mines'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }

    const state = mines.startGame(message.author.id, amount, mineCount);
    client.activeGames.set(state.id, state);

    await message.reply({ embeds: [mines.buildEmbed(state, message.author)], components: mines.buildGrid(state) });
  },
};
