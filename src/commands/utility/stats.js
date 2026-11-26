const { EmbedBuilder }  = require('discord.js');
const { PrismaClient }  = require('@prisma/client');
const { errorEmbed }    = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const config            = require('../../config/config');

const prisma = new PrismaClient();

const ALL_GAMES = ['blackjack', 'mines', 'hilo', 'coinflip', 'tower', 'dice', 'keno', 'limbo', 'crash', 'chicken', 'roulette', 'wheel', 'slots'];

module.exports = {
  name:        'stats',
  aliases:     ['gamestats', 'mystats'],
  description: 'Per-game breakdown of your casino performance.',
  async execute(message, args, client) {
    const target = message.mentions.users.first() || message.author;

    // Aggregate per-game stats from GameSession
    const gameSessions = await prisma.gameSession.groupBy({
      by:    ['game'],
      where: { user: { discordId: target.id } },
      _count:  { id: true },
      _sum:    { bet: true, payout: true },
      _avg:    { multiplier: true },
      _max:    { multiplier: true },
    });

    if (!gameSessions.length) {
      return message.reply({ embeds: [errorEmbed('No Stats', `${target.username} hasn't played any games yet.`)] });
    }

    // Per-game win counts
    const winCounts = await prisma.gameSession.groupBy({
      by:    ['game', 'result'],
      where: { user: { discordId: target.id }, result: 'win' },
      _count: { id: true },
    });

    const winMap = {};
    for (const w of winCounts) winMap[w.game] = w._count.id;

    // Best crash cashout specifically
    const bestCrash = await prisma.gameSession.findFirst({
      where:   { user: { discordId: target.id }, game: 'crash', result: 'win' },
      orderBy: { multiplier: 'desc' },
    });

    const lines = [];
    const ICONS = {
      blackjack: '🃏', mines: '💣', hilo: '📊', coinflip: '🪙', tower: '🗼',
      dice: '🎲', keno: '🎯', limbo: '🎢', crash: '🚀', chicken: '🐔',
      roulette: '🎡', wheel: '🎠', slots: '🎰',
    };

    for (const gs of gameSessions.sort((a, b) => b._count.id - a._count.id)) {
      const played = gs._count.id;
      const wins   = winMap[gs.game] || 0;
      const losses = played - wins;
      const wr     = played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0';
      const wagered = gs._sum.bet || 0;
      const wonTotal = gs._sum.payout || 0;
      const avgMult  = gs._avg.multiplier ? gs._avg.multiplier.toFixed(2) : 'N/A';
      const maxMult  = gs._max.multiplier ? gs._max.multiplier.toFixed(2) : 'N/A';

      const icon = ICONS[gs.game] || '🎮';
      lines.push(
        `${icon} **${gs.game.toUpperCase()}** — ${played} games • ${wr}% WR (${wins}W/${losses}L)\n` +
        `  💸 Wagered: 🪙 ${formatBalance(wagered)} • 🏆 Won: 🪙 ${formatBalance(wonTotal)} • ✕ Avg: ${avgMult}x • Best: ${maxMult}x`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.purple)
      .setTitle(`📊 Game Stats — ${target.username}`)
      .setDescription(lines.join('\n\n'))
      .setThumbnail(target.displayAvatarURL({ dynamic: true }));

    if (bestCrash) {
      embed.addFields({
        name:  '🚀 Best Crash Cashout',
        value: `**${bestCrash.multiplier}x** — 🪙 ${formatBalance(bestCrash.payout)} on 🪙 ${formatBalance(bestCrash.bet)} bet`,
        inline: false,
      });
    }

    embed.setFooter({ text: 'Casino Bot • Game Stats' }).setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
