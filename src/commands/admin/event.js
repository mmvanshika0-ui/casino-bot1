/**
 * .event — Admin command to start, stop, and check casino events.
 *
 * Usage:
 *   .event start hot_streak 60m     — 60-minute hot streak event
 *   .event start double_xp 30m      — 30-min XP event
 *   .event start double_daily 2h    — 2-hour double daily
 *   .event start rain_boost 45m     — 45-min rain boost
 *   .event start happy_hour 1h      — 1-hour happy hour (xp + payouts)
 *   .event stop                     — end current event early
 *   .event status                   — show current event info
 */

const { EmbedBuilder } = require('discord.js');
const { errorEmbed }   = require('../../embeds/embedBuilder');
const { formatDuration } = require('../../utils/format');
const {
  EVENT_TYPES, startEvent, stopEvent, getActiveEvent, buildEventEmbed,
} = require('../../services/events/casinoEventService');
const config = require('../../config/config');

function isAdmin(message) {
  return config.admin.ids.includes(message.author.id) ||
    (config.admin.roleId && message.member?.roles.cache.has(config.admin.roleId));
}

/** Parse duration string like "30m", "2h", "90s" → milliseconds */
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val  = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * mult[unit];
}

module.exports = {
  name:        'event',
  aliases:     ['casinoevent', 'cevent'],
  description: 'Admin: start, stop, or check casino events.',
  async execute(message, args, client) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [errorEmbed('No Permission', 'Admins only.')] });
    }

    const sub = (args[0] || 'status').toLowerCase();

    // ── .event status ───────────────────────────────────────────
    if (sub === 'status') {
      const event = getActiveEvent(client);
      if (!event) {
        const typeList = Object.entries(EVENT_TYPES)
          .map(([id, e]) => `\`${id}\` — ${e.label}: ${e.description}`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setColor(0x2C2F33)
          .setTitle('🎪 Casino Events — No Active Event')
          .setDescription(`Start one with \`.event start <type> <duration>\`\n\n**Available Types:**\n${typeList}`)
          .addFields({
            name:  '⏱️ Duration Format',
            value: '`30s` · `5m` · `2h` · `1d`',
            inline: false,
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      return message.reply({ embeds: [buildEventEmbed(event, event.expiresAt - event.startedAt)] });
    }

    // ── .event start <type> <duration> ─────────────────────────
    if (sub === 'start') {
      const type       = args[1]?.toLowerCase();
      const durationMs = parseDuration(args[2]);

      if (!type || !EVENT_TYPES[type]) {
        const types = Object.keys(EVENT_TYPES).join(', ');
        return message.reply({ embeds: [errorEmbed('Invalid Type', `Valid types: ${types}`)] });
      }

      if (!durationMs || durationMs < 60_000 || durationMs > 86_400_000) {
        return message.reply({ embeds: [errorEmbed('Invalid Duration', 'Duration must be between 1m and 24h.\nExamples: `30m`, `2h`, `90s`')] });
      }

      // End any existing event first
      const existing = getActiveEvent(client);
      if (existing) stopEvent(client);

      const event = startEvent(client, type, durationMs, `${message.author.username}#${message.author.discriminator || '0'}`);
      const meta  = EVENT_TYPES[type];

      // Announce to notifications channel
      const notifChannel = process.env.NOTIFICATIONS_CHANNEL_ID;
      if (notifChannel) {
        const ch = await client.channels.fetch(notifChannel).catch(() => null);
        if (ch) {
          await ch.send({
            content: '@here',
            embeds:  [buildEventEmbed(event, durationMs)],
          }).catch(() => {});
        }
      }

      // Reply in command channel
      const embed = new EmbedBuilder()
        .setColor(meta.color)
        .setTitle(`${meta.label} — EVENT STARTED!`)
        .setDescription(meta.description)
        .addFields(
          { name: '⏱️ Duration',     value: formatDuration(durationMs),                                    inline: true },
          { name: '⏳ Ends',         value: `<t:${Math.floor(event.expiresAt / 1000)}:R>`,                 inline: true },
          { name: '🎯 Started By',   value: message.author.username,                                       inline: true },
          {
            name:   '📊 Rank Multipliers (hot_streak / happy_hour)',
            value:  '🥉 Bronze/Silver/Gold: **2×** · 🪙 Platinum: **2.25×** · 💎 Diamond: **2.5×** · 🖤 Obsidian: **3×**',
            inline: false,
          },
        )
        .setFooter({ text: 'Casino Bot • Admin Events • .event stop to end early' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ── .event stop ─────────────────────────────────────────────
    if (sub === 'stop') {
      const existing = getActiveEvent(client);
      if (!existing) {
        return message.reply({ embeds: [errorEmbed('No Event', 'No active event to stop.')] });
      }

      stopEvent(client);

      const meta  = EVENT_TYPES[existing.type];
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle(`${meta.label} — EVENT ENDED`)
        .setDescription(`The event was ended early by **${message.author.username}**.`)
        .setTimestamp();

      // Announce end
      const notifChannel = process.env.NOTIFICATIONS_CHANNEL_ID;
      if (notifChannel) {
        const ch = await client.channels.fetch(notifChannel).catch(() => null);
        if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
      }

      return message.reply({ embeds: [embed] });
    }

    // ── .event list ─────────────────────────────────────────────
    if (sub === 'list') {
      const lines = Object.entries(EVENT_TYPES).map(([id, e]) =>
        `**\`${id}\`** — ${e.label}\n  ${e.description}`
      ).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎪 Available Casino Event Types')
        .setDescription(lines)
        .addFields({ name: '📌 Usage', value: '`.event start <type> <duration>` — e.g. `.event start hot_streak 1h`' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    return message.reply({ embeds: [errorEmbed('Usage', '`.event status` · `.event start <type> <duration>` · `.event stop` · `.event list`')] });
  },
};
