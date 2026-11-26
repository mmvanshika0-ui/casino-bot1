const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed } = require('../../embeds/embedBuilder');
const dice = require('../../games/dice/handler');

module.exports = {
  name: 'dice',
  description: 'Play Dice. Usage: `.dice <bet> [over7|under7|exactly7|doubles]`',
  async execute(message, args, client) {
    const amount  = parseInt(args[0]);
    const betType = ['over7','under7','exactly7','doubles'].includes(args[1]) ? args[1] : 'over7';
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.dice <amount> [bettype]`')] });
    try { await placeBet(message.author.id, amount, 'dice'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = dice.startGame(message.author.id, amount, betType);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [dice.buildEmbed(state, message.author)], components: dice.buildButtons(state.id) });
  },
};
