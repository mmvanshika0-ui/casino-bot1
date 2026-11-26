const { EmbedBuilder }  = require('discord.js');
const { formatBalance } = require('../../utils/format');
const { getJackpot, getJackpotHistory } = require('../../services/jackpot/jackpotService');
const config = require('../../config/config');

module.exports = {
  name:        'jackpot',
  aliases:     ['jp', 'pool'],
  description: 'View the current jackpot pool and recent winners.',
  async execute(message, args, client) {
    const [amount, history] = await Promise.all([
      getJackpot(),
      getJackpotHistory(5),
    ]);

    const historyLines = history.length
      ? history.map((h, i) => {
          const time = `<t:${Math.floor(new Date(h.createdAt).getTime() / 1000)}:R>`;
          return `**${i + 1}.** <@${h.discordId}> — 🪙 ${formatBalance(h.amount)} on **${h.game}** (${h.trigger}) ${time}`;
        }).join('\n')
      : 'No jackpot winners yet. Be the first!';

    const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('🎰 Jackpot Pool')
      .setDescription(
        `The jackpot grows with every bet across all games.\n` +
        `**0.5%** of every bet feeds the pool.\n\n` +
        `Trigger conditions:\n` +
        `• 🎰 Slots — Five 💎 diamonds\n` +
        `• 💣 Mines — Clear all tiles (1 mine)\n` +
        `• 🃏 Blackjack — Royal suited blackjack\n` +
        `• 🚀 Crash — Cash out at 100×+\n`
      )
      .addFields(
        { name: '💎 Current Pool',  value: `# 🪙 ${formatBalance(amount)}`,  inline: false },
        { name: '🏆 Recent Winners', value: historyLines,                     inline: false },
      )
      .setFooter({ text: 'Casino Bot • Jackpot — 0.5% of every bet builds the pool' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
