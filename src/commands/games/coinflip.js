const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed, baseEmbed } = require('../../embeds/embedBuilder');
const cf = require('../../games/coinflip/handler');

module.exports = {
  name: 'coinflip',
  aliases: ['cf', 'flip'],
  description: 'Play Coinflip.',
  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.coinflip <amount>`')] });
    try { await placeBet(message.author.id, amount, 'coinflip'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }
    const state = cf.startGame(message.author.id, amount);
    client.activeGames.set(state.id, state);
    const embed = baseEmbed('🪙 Coinflip', `Bet: 🪙 **${amount}**\n\nPick **Heads** or **Tails**!`);
    await message.reply({ embeds: [embed], components: cf.buildButtons(state.id) });
  },
};
