const { EmbedBuilder }  = require('discord.js');
const { errorEmbed }    = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const { getWagerStatus, WAGER_MULTIPLIER } = require('../../services/wager/wagerService');
const { progressBar }   = require('../../utils/format');
const config            = require('../../config/config');

module.exports = {
  name:        'wager',
  aliases:     ['wagereq', 'wr'],
  description: 'Check your active wager requirement before withdrawal.',
  async execute(message, args, client) {
    const status = await getWagerStatus(message.author.id);

    if (!status) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ No Wager Requirement')
        .setDescription(
          'You have no active wager requirement.\n' +
          'You can withdraw at any time!\n\n' +
          `*(A ${WAGER_MULTIPLIER}× wager requirement is applied after bonus credits are awarded.)*`
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    const bar = progressBar(status.wagered, status.required, 15);

    const embed = new EmbedBuilder()
      .setColor(status.pct >= 100 ? config.colors.success : config.colors.warning)
      .setTitle('⚠️ Active Wager Requirement')
      .setDescription(
        'You received bonus credits that require wagering before withdrawal.\n\n' +
        `${bar} **${status.pct}%**`
      )
      .addFields(
        { name: '🎯 Required',    value: `🪙 ${formatBalance(status.required)}`,  inline: true },
        { name: '✅ Wagered',     value: `🪙 ${formatBalance(status.wagered)}`,    inline: true },
        { name: '⏳ Remaining',   value: `🪙 ${formatBalance(status.remaining)}`,  inline: true },
      )
      .setFooter({ text: `Play any game to progress. ${WAGER_MULTIPLIER}× multiplier applied to bonus.` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
