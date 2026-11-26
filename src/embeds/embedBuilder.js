const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config/config');
const { formatBalance, progressBar, levelFromXP } = require('../utils/format');

function baseEmbed(title, description, color = config.colors.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: '🎰 Casino Bot • Premium Gaming' });
}

function successEmbed(title, description) {
  return baseEmbed(`✅ ${title}`, description, config.colors.success);
}

function errorEmbed(title, description) {
  return baseEmbed(`❌ ${title}`, description, config.colors.danger);
}

function warningEmbed(title, description) {
  return baseEmbed(`⚠️ ${title}`, description, config.colors.warning);
}

function profileEmbed(user, discordUser) {
  const { level, currentXP, neededXP } = levelFromXP(user.xp);
  const bar = progressBar(currentXP, neededXP, 12);
  const wr  = user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : '0.0';

  return new EmbedBuilder()
    .setColor(config.colors.purple)
    .setTitle(`🎰 ${discordUser.username}'s Casino Profile`)
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '💰 Balance',      value: `🪙 ${formatBalance(user.balance)}`,       inline: true },
      { name: '🏦 Vault',        value: `🪙 ${formatBalance(user.vaultBalance)}`,   inline: true },
      { name: '⭐ Level',        value: `**${level}**`,                             inline: true },
      { name: '📊 XP Progress',  value: `${bar}\n${currentXP}/${neededXP} XP`,     inline: false },
      { name: '🎮 Games Played', value: `${user.gamesPlayed}`,                      inline: true },
      { name: '🏆 Wins',         value: `${user.gamesWon}`,                         inline: true },
      { name: '📉 Losses',       value: `${user.gamesLost}`,                        inline: true },
      { name: '🎯 Win Rate',     value: `${wr}%`,                                   inline: true },
      { name: '💸 Total Wagered',value: `🪙 ${formatBalance(user.totalWagered)}`,   inline: true },
      { name: '💎 Total Won',    value: `🪙 ${formatBalance(user.totalWon)}`,        inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '🎰 Casino Bot • Premium Gaming' });
}

function balanceEmbed(user, discordUser) {
  return new EmbedBuilder()
    .setColor(config.colors.gold)
    .setTitle('💰 Wallet')
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🪙 Balance',      value: `**${formatBalance(user.balance)}** credits`,      inline: true },
      { name: '🏦 Vault',        value: `**${formatBalance(user.vaultBalance)}** credits`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `${discordUser.username} • Casino Bot` });
}

function leaderboardEmbed(users, type, page, pages) {
  const labels = {
    balance: { title: 'Richest Players',  field: u => `🪙 ${formatBalance(u.balance)}`     },
    level:   { title: 'Highest Levels',   field: u => `⭐ Level ${u.level}`                },
    wins:    { title: 'Most Wins',         field: u => `🏆 ${u.gamesWon} wins`              },
    games:   { title: 'Most Games Played', field: u => `🎮 ${u.gamesPlayed} games`         },
    xp:      { title: 'Most XP',           field: u => `✨ ${u.xp.toLocaleString()} XP`    },
  };

  const { title, field } = labels[type] || labels.balance;
  const medals = ['🥇', '🥈', '🥉'];
  const offset = (page - 1) * 10;

  const rows = users.map((u, i) => {
    const rank   = offset + i + 1;
    const medal  = rank <= 3 ? medals[rank - 1] : `**#${rank}**`;
    return `${medal} **${u.username}** — ${field(u)}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(config.colors.gold)
    .setTitle(`🏆 Leaderboard — ${title}`)
    .setDescription(rows || 'No players yet.')
    .setFooter({ text: `Page ${page}/${pages} • Casino Bot` })
    .setTimestamp();
}

function depositEmbed(deposit, qrBuffer) {
  const currency = config.currencies.find(c => c.id === deposit.currency);
  const embed = new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(`${currency?.icon || '💎'} Deposit ${currency?.symbol || deposit.currency}`)
    .setDescription('Send **any amount** to the address below. Credits are added automatically after 1 confirmation.')
    .addFields(
      { name: '📬 Deposit Address', value: `\`\`\`${deposit.address}\`\`\``, inline: false },
      { name: '💱 Currency',        value: currency?.name || deposit.currency,              inline: true },
      { name: '⏳ Expires',          value: `<t:${Math.floor(new Date(deposit.expiresAt).getTime() / 1000)}:R>`, inline: true },
      { name: '🔄 Status',          value: '⏳ Pending', inline: true },
      { name: '💡 Rate',             value: '1 USD = 100 Credits', inline: true },
    )
    .setImage('attachment://qr.png')
    .setTimestamp()
    .setFooter({ text: 'Send exact amount. Partial payments also credited.' });

  return embed;
}

function withdrawEmbed(withdrawal) {
  const statusIcons = { pending: '⏳', processing: '🔄', completed: '✅', failed: '❌', rejected: '🚫' };
  const icon = statusIcons[withdrawal.status] || '⏳';

  return new EmbedBuilder()
    .setColor(withdrawal.status === 'completed' ? config.colors.success : config.colors.warning)
    .setTitle(`${icon} Withdrawal ${withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}`)
    .addFields(
      { name: '💱 Currency',  value: withdrawal.currency.toUpperCase(),                     inline: true },
      { name: '📬 Address',   value: `\`${withdrawal.address}\``,                           inline: false },
      { name: '💸 Credits',   value: `🪙 ${formatBalance(withdrawal.amount)}`,              inline: true },
      { name: '🪙 Crypto',    value: withdrawal.amountCrypto ? `${withdrawal.amountCrypto}` : 'Calculating...', inline: true },
      { name: '📋 Status',    value: `${icon} ${withdrawal.status}`,                        inline: true },
      { name: '🔗 TX Hash',   value: withdrawal.txHash ? `\`${withdrawal.txHash}\`` : 'Pending...', inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Casino Bot • Withdrawals processed automatically' });
}

function houseBalanceEmbed(houseData, stats) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.purple)
    .setTitle('🏦 House Balance Dashboard')
    .setDescription('Real-time overview of casino financials.')
    .addFields(
      { name: '💰 Total Credits in Circulation', value: `🪙 ${formatBalance(stats.totalBalance)}`, inline: false },
      { name: '📥 Total Deposited',   value: `🪙 ${formatBalance(stats.totalDeposited)}`,  inline: true },
      { name: '📤 Total Withdrawn',   value: `🪙 ${formatBalance(stats.totalWithdrawn)}`,  inline: true },
      { name: '🎮 Total Games',        value: `${stats.totalGames}`,                       inline: true },
      { name: '👥 Total Players',      value: `${stats.totalPlayers}`,                     inline: true },
      { name: '💸 Total Wagered',      value: `🪙 ${formatBalance(stats.totalWagered)}`,   inline: true },
      { name: '🏆 Total Paid Out',     value: `🪙 ${formatBalance(stats.totalWon)}`,        inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Admin Dashboard • Casino Bot' });

  if (houseData) {
    embed.addFields({ name: '⛓️ Crypto Wallets', value: JSON.stringify(houseData, null, 2).slice(0, 1000), inline: false });
  }

  return embed;
}

module.exports = {
  baseEmbed, successEmbed, errorEmbed, warningEmbed,
  profileEmbed, balanceEmbed, leaderboardEmbed,
  depositEmbed, withdrawEmbed, houseBalanceEmbed,
};
