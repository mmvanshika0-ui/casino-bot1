const { EmbedBuilder }   = require('discord.js');
const { claimDaily }     = require('../../services/economy/economyService');
const { errorEmbed }     = require('../../embeds/embedBuilder');
const { formatBalance }  = require('../../utils/format');
const { getActiveEvent } = require('../../services/events/casinoEventService');
const config             = require('../../config/config');

module.exports = {
  name:        'daily',
  aliases:     ['claim', 'bonus'],
  description: 'Claim your daily credits. Rank bonus and events apply.',
  async execute(message, args, client) {
    try {
      const { totalReward, baseReward, rankBonus, eventMult, rank } = await claimDaily(message.author.id, client);
      const event = getActiveEvent(client);

      const breakdownParts = [`Base: 🪙 ${formatBalance(baseReward)}`];
      if (rankBonus > 0) breakdownParts.push(`${rank.emoji} ${rank.name} Bonus: +🪙 ${formatBalance(rankBonus)}`);
      if (eventMult > 1) breakdownParts.push(`🎉 Event (${eventMult}x): total multiplied`);

      const embed = new EmbedBuilder()
        .setColor(rank.color || config.colors.gold)
        .setTitle('💰 Daily Reward Claimed!')
        .setDescription(
          `**🪙 ${formatBalance(totalReward)}** credits added!\n\n` +
          breakdownParts.join('\n')
        )
        .addFields(
          { name: `${rank.emoji} Your Rank`, value: `**${rank.name}**`,                                                                      inline: true },
          { name: '⏰ Next Claim',           value: `<t:${Math.floor((Date.now() + config.economy.dailyCooldown) / 1000)}:R>`,               inline: true },
          event
            ? { name: '🎉 Active Event', value: event.type.replace(/_/g, ' ').toUpperCase(), inline: true }
            : { name: '\u200b', value: '\u200b', inline: true },
        )
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Rank up to increase your daily bonus! • .rank list' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      if (err.message.startsWith('COOLDOWN:')) {
        const remaining = parseInt(err.message.split(':')[1]);
        return message.reply({
          embeds: [errorEmbed('Already Claimed', `Next daily available <t:${Math.floor((Date.now() + remaining) / 1000)}:R>`)],
        });
      }
      return message.reply({ embeds: [errorEmbed('Error', err.message)] });
    }
  },
};
