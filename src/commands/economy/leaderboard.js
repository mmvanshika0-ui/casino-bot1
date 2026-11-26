const { EmbedBuilder }   = require('discord.js');
const { getLeaderboard } = require('../../services/economy/economyService');
const { errorEmbed }     = require('../../embeds/embedBuilder');
const { formatBalance }  = require('../../utils/format');
const { getRankFromWagered } = require('../../services/rank/rankConfig');
const config             = require('../../config/config');

const TYPES = {
  balance: { label: 'Richest Players',   field: u => `🪙 ${formatBalance(u.balance)}`     },
  level:   { label: 'Highest Levels',    field: u => `⭐ Level ${u.level}`                },
  wins:    { label: 'Most Wins',         field: u => `🏆 ${u.gamesWon} wins`              },
  games:   { label: 'Most Games Played', field: u => `🎮 ${u.gamesPlayed} games`          },
  xp:      { label: 'Most XP',           field: u => `✨ ${u.xp.toLocaleString()} XP`     },
  wagered: { label: 'Most Wagered',      field: u => `💸 ${formatBalance(u.totalWagered)}` },
};

module.exports = {
  name:        'leaderboard',
  aliases:     ['lb', 'top'],
  description: 'View the casino leaderboard. Types: balance, level, wins, games, xp, wagered.',
  async execute(message, args, client) {
    const type = (args[0] || 'balance').toLowerCase();
    const page = Math.max(1, parseInt(args[1]) || 1);

    if (!TYPES[type]) {
      return message.reply({ embeds: [errorEmbed('Invalid Type', `Valid types: ${Object.keys(TYPES).join(', ')}`)] });
    }

    const { users, total, pages } = await getLeaderboard(type, page, 10);
    if (!users.length) return message.reply({ embeds: [errorEmbed('Empty', 'No players yet.')] });

    const { label, field } = TYPES[type];
    const medals = ['🥇', '🥈', '🥉'];
    const offset = (page - 1) * 10;

    const rows = users.map((u, i) => {
      const rank  = getRankFromWagered(u.totalWagered);
      const pos   = offset + i + 1;
      const medal = pos <= 3 ? medals[pos - 1] : `**#${pos}**`;
      return `${medal} ${rank.emoji} **${u.username}** — ${field(u)}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(config.colors.gold)
      .setTitle(`🏆 Leaderboard — ${label}`)
      .setDescription(rows)
      .setFooter({ text: `Page ${page}/${pages} • ${total} players • .lb <type> <page>` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
