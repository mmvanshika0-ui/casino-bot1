const { placeBet } = require('../../services/economy/economyService');
const { errorEmbed, baseEmbed } = require('../../embeds/embedBuilder');
const roulette = require('../../games/roulette/handler');

module.exports = {
  name: 'roulette',
  aliases: ['rl'],
  description: 'Play Roulette. `.roulette <bet> color red|black|green` or `parity even|odd` or `half low|high` or `dozen 1st|2nd|3rd` or `straight <0-36>`',
  async execute(message, args, client) {
    const amount   = parseInt(args[0]);
    const betType  = args[1]?.toLowerCase();
    const betValue = args[2]?.toLowerCase();
    const validTypes = ['color','parity','half','dozen','straight'];

    if (!amount || amount <= 0) return message.reply({ embeds: [errorEmbed('Invalid Bet', 'Usage: `.roulette <amount> <bettype> <betvalue>`')] });
    if (!validTypes.includes(betType)) return message.reply({ embeds: [errorEmbed('Invalid Bet Type', `Choose: ${validTypes.join(', ')}`)] });
    if (!betValue) return message.reply({ embeds: [errorEmbed('Missing Value', 'Specify a bet value.')] });

    try { await placeBet(message.author.id, amount, 'roulette'); }
    catch (err) { return message.reply({ embeds: [errorEmbed('Bet Failed', err.message)] }); }

    const state = roulette.startGame(message.author.id, amount, betType, betValue);
    client.activeGames.set(state.id, state);
    await message.reply({ embeds: [roulette.buildEmbed(state, message.author)], components: roulette.buildButtons(state.id) });
  },
};
