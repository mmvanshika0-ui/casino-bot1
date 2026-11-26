/**
 * .chat <message>
 * Posts your message to the designated casino lounge channel from the bot.
 * Only usable if CASINO_LOUNGE_CHANNEL_ID is set in env.
 */

const { EmbedBuilder } = require('discord.js');
const { errorEmbed }   = require('../../embeds/embedBuilder');
const config           = require('../../config/config');

const LOUNGE_CHANNEL = process.env.CASINO_LOUNGE_CHANNEL_ID || null;
const CHAT_COOLDOWN  = new Map(); // userId → timestamp
const COOLDOWN_MS    = 10_000;    // 10s between chat messages

module.exports = {
  name:        'chat',
  aliases:     ['say', 'lounge'],
  description: 'Send a message to the casino lounge channel.',
  async execute(message, args, client) {
    if (!LOUNGE_CHANNEL) {
      return message.reply({ embeds: [errorEmbed('Not Configured', 'Set `CASINO_LOUNGE_CHANNEL_ID` in your `.env` to enable the lounge.')] });
    }

    const content = args.join(' ').trim();
    if (!content) return message.reply({ embeds: [errorEmbed('Empty Message', 'Usage: `.chat <your message>`')] });
    if (content.length > 300) return message.reply({ embeds: [errorEmbed('Too Long', 'Messages must be under 300 characters.')] });

    // Cooldown
    const lastChat = CHAT_COOLDOWN.get(message.author.id) || 0;
    if (Date.now() - lastChat < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastChat)) / 1000);
      return message.reply({ embeds: [errorEmbed('Cooldown', `Wait ${remaining}s before chatting again.`)] });
    }

    const lounge = await client.channels.fetch(LOUNGE_CHANNEL).catch(() => null);
    if (!lounge) return message.reply({ embeds: [errorEmbed('Channel Not Found', 'Lounge channel not found.')] });

    CHAT_COOLDOWN.set(message.author.id, Date.now());

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setDescription(content)
      .setAuthor({
        name:    message.author.username,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp()
      .setFooter({ text: '🎰 Casino Lounge' });

    await lounge.send({ embeds: [embed] });
    await message.react('✅').catch(() => {});
  },
};
