const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const limbo = require('../../games/limbo/handler');

module.exports = {
  name: 'limbo',
  description: 'Play Limbo. Usage: `.limbo <bet> <target_multiplier>`',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    const target = parseFloat(args[1]) || 2.0;
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.limbo <amount> <target>`')] });
    try { await placeBet(message.author.id, amount, 'limbo'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = limbo.startGame(message.author.id, amount, target);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [limbo.buildEmbed(state, message.author)], components: limbo.buildButtons(state.id) });
  },
};
