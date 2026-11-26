const { AttachmentBuilder } = require('discord.js');
const { getOrCreateUser }   = require('../../services/economy/economyService');
const { profileEmbed, errorEmbed } = require('../../embeds/embedBuilder');
const { getEquipped }        = require('../../services/shop/shopService');
const { getWagerStatus }     = require('../../services/wager/wagerService');
const { generateProfileCard } = require('../../services/canvas/profileCard');
const { formatBalance }      = require('../../utils/format');

module.exports = {
  name:        'profile',
  aliases:     ['p', 'me'],
  description: 'View your casino profile card (canvas image).',
  async execute(message, args, client) {
    const target     = message.mentions.users.first() || message.author;
    const user       = await getOrCreateUser(target.id, target.username);
    const equipped   = await getEquipped(target.id);
    const wagerStat  = await getWagerStatus(target.id);

    // Try to generate canvas card — fall back to embed if canvas not installed
    try {
      const cardBuffer = await generateProfileCard(user, target, equipped);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'profile.png' });

      // Minimal embed with wager requirement info if present
      const { EmbedBuilder } = require('discord.js');
      const config = require('../../config/config');

      const color = equipped.effect === 'gold'  ? 0xFFD700
                  : equipped.effect === 'neon'  ? 0x9B59B6
                  : config.colors.primary;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setImage('attachment://profile.png')
        .setTimestamp()
        .setFooter({ text: '🎰 Casino Bot • Profile Card' });

      if (wagerStat) {
        embed.addFields({
          name:  '⚠️ Wager Requirement',
          value: `Wager 🪙 ${formatBalance(wagerStat.remaining)} more before withdrawing.\n` +
                 `Progress: **${wagerStat.pct}%** (🪙 ${formatBalance(wagerStat.wagered)} / 🪙 ${formatBalance(wagerStat.required)})`,
          inline: false,
        });
      }

      return message.reply({ embeds: [embed], files: [attachment] });
    } catch (err) {
      // Canvas not installed — fall back to plain embed
      if (err.code === 'MODULE_NOT_FOUND') {
        const embed = profileEmbed(user, target);
        if (wagerStat) {
          embed.addFields({
            name:  '⚠️ Wager Requirement',
            value: `Wager 🪙 ${formatBalance(wagerStat.remaining)} more before withdrawing (${wagerStat.pct}%).`,
            inline: false,
          });
        }
        return message.reply({ embeds: [embed] });
      }
      throw err;
    }
  },
};
