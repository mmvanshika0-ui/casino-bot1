/**
 * Notifications Service
 * Posts to a configured notifications channel when:
 *  - A player hits a big win (over configured multiplier threshold)
 *  - Jackpot triggers
 *  - Someone tops the leaderboard
 *
 * Config: BIG_WIN_THRESHOLD env var (default: 10x)
 *         NOTIFICATIONS_CHANNEL_ID env var
 */

const { EmbedBuilder } = require('discord.js');
const { formatBalance } = require('../../utils/format');

const BIG_WIN_THRESHOLD    = parseFloat(process.env.BIG_WIN_THRESHOLD)    || 10;
const NOTIFICATIONS_CHANNEL = process.env.NOTIFICATIONS_CHANNEL_ID         || null;

/**
 * Post a big win notification.
 * @param {Client}  client
 * @param {object}  winData — { discordId, username, game, bet, payout, multiplier }
 */
async function notifyBigWin(client, winData) {
  if (!NOTIFICATIONS_CHANNEL) return;
  if (!winData.multiplier || winData.multiplier < BIG_WIN_THRESHOLD) return;

  const channel = await client.channels.fetch(NOTIFICATIONS_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Big Win Alert!')
    .setDescription(
      `**<@${winData.discordId}>** just won big on **${winData.game.toUpperCase()}**!\n\n` +
      `🎯 Multiplier: **${winData.multiplier}x**\n` +
      `💰 Bet: 🪙 ${formatBalance(winData.bet)}\n` +
      `💎 Payout: 🪙 ${formatBalance(winData.payout)}\n`
    )
    .setThumbnail(`https://cdn.discordapp.com/avatars/${winData.discordId}/${winData.avatar}.png`)
    .setTimestamp()
    .setFooter({ text: '🎰 Casino Bot • Big Wins' });

  await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Post a jackpot win notification.
 */
async function notifyJackpot(client, jackpotData) {
  if (!NOTIFICATIONS_CHANNEL) return;

  const channel = await client.channels.fetch(NOTIFICATIONS_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFF6600)
    .setTitle('🎰 ━━ JACKPOT HIT ━━ 🎰')
    .setDescription(
      `🎉 **<@${jackpotData.discordId}>** just hit the **JACKPOT** on **${jackpotData.game.toUpperCase()}**!\n\n` +
      `🏆 Trigger: **${jackpotData.trigger}**\n` +
      `💰 Won: 🪙 **${formatBalance(jackpotData.amount)}** credits!\n\n` +
      `The jackpot has been reset. Start betting to build it back up!`
    )
    .setTimestamp()
    .setFooter({ text: '🎰 Casino Bot • Jackpot System' });

  await channel.send({ content: '@here', embeds: [embed] }).catch(() => {});
}

/**
 * Post a leaderboard change notification — someone took the #1 spot.
 */
async function notifyLeaderboardChange(client, leaderData) {
  if (!NOTIFICATIONS_CHANNEL) return;

  const channel = await client.channels.fetch(NOTIFICATIONS_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('👑 New Leaderboard Leader!')
    .setDescription(
      `**<@${leaderData.discordId}>** has taken the **#1 spot** on the leaderboard!\n\n` +
      `💰 Balance: 🪙 ${formatBalance(leaderData.balance)}`
    )
    .setTimestamp()
    .setFooter({ text: '🎰 Casino Bot • Leaderboard' });

  await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Update bot status with current jackpot amount.
 */
function updateJackpotStatus(client, jackpotAmount) {
  client.user.setActivity(`🎰 Jackpot: 🪙 ${formatBalance(jackpotAmount)}`, { type: 3 }); // WATCHING
}

module.exports = { notifyBigWin, notifyJackpot, notifyLeaderboardChange, updateJackpotStatus, BIG_WIN_THRESHOLD };
