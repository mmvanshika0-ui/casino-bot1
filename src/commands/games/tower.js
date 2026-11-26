const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const tower = require('../../games/tower/handler');

module.exports = {
  name: 'tower',
  description: 'Play Tower. Usage: `.tower <bet> [easy|medium|hard]`',
  async execute(message, args, client) {
    const amount     = parseInt(args[0]);
    const difficulty = ['easy','medium','hard'].includes(args[1]) ? args[1] : 'medium';
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.tower <amount> [difficulty]`')] });
    try { await placeBet(message.author.id, amount, 'tower'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = tower.startGame(message.author.id, amount, difficulty);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [tower.buildEmbed(state, message.author)], components: tower.buildTowerDisplay(state) });
  },
};
