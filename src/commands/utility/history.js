const { EmbedBuilder }  = require('discord.js');
const { PrismaClient }  = require('@prisma/client');
const { errorEmbed }    = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const config            = require('../../config/config');

const prisma = new PrismaClient();

const RESULT_ICONS = { win: '✅', loss: '❌', push: '🤝' };
const GAME_ICONS   = {
  blackjack: '🃏', mines: '💣', hilo: '📊', coinflip: '🪙',
  tower: '🗼', dice: '🎲', keno: '🎯', limbo: '🎢', crash: '🚀',
  chicken: '🐔', roulette: '🎡', wheel: '🎠', slots: '🎰',
};

module.exports = {
  name:        'history',
  aliases:     ['hist', 'gamelog'],
  description: 'View your last 20 game sessions.',
  async execute(message, args, client) {
    const target  = message.mentions.users.first() || message.author;
    const page    = Math.max(1, parseInt(args[0]) || 1);
    const perPage = 10;
    const skip    = (page - 1) * perPage;

    const [sessions, total] = await Promise.all([
      prisma.gameSession.findMany({
        where:   { user: { discordId: target.id } },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    perPage,
      }),
      prisma.gameSession.count({ where: { user: { discordId: target.id } } }),
    ]);

    if (!sessions.length) {
      return message.reply({ embeds: [errorEmbed('No History', 'No game sessions found.')] });
    }

    const pages = Math.ceil(total / perPage);

    const lines = sessions.map((s, i) => {
      const icon   = RESULT_ICONS[s.result] || '❓';
      const game   = GAME_ICONS[s.game]     || '🎮';
      const mult   = s.multiplier ? ` (${s.multiplier}x)` : '';
      const payout = s.result === 'win' ? `+🪙 ${formatBalance(s.payout)}` : `-🪙 ${formatBalance(s.bet)}`;
      const time   = `<t:${Math.floor(new Date(s.createdAt).getTime() / 1000)}:R>`;
      return `${skip + i + 1}. ${icon} ${game} **${s.game}** — Bet 🪙 ${formatBalance(s.bet)} ${payout}${mult} ${time}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle(`📋 Game History — ${target.username}`)
      .setDescription(lines)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Page ${page}/${pages} • ${total} total sessions • .history <page>` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
