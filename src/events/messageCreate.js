/**
 * messageCreate event — updated
 * Additions over original:
 *  - Per-command rate limiting (3s default, game commands 5s)
 *  - Max 1 active game per user globally
 *  - Active-user tracking for .rain command (via Map in client)
 */

const { getOrCreateUser }  = require('../services/economy/economyService');
const { errorEmbed }        = require('../embeds/embedBuilder');
const logger                = require('../utils/logger');

// Per-user, per-command cooldown map: `userId:cmdName` → timestamp
const cooldownMap = new Map();

// Cooldown durations in ms per command category
const COOLDOWNS = {
  // Game commands — 5s to prevent spam
  blackjack: 5000, mines: 5000, hilo: 5000, coinflip: 5000, tower: 5000,
  dice:      5000, keno:  5000, limbo: 5000, crash: 5000, chicken: 5000,
  roulette:  5000, wheel: 5000, slots: 5000,
  // Economy commands — 3s
  tip: 3000, duel: 3000, vault: 3000, withdraw: 3000,
  // Default
  _default: 2000,
};

// Game commands that require no active game before starting
const GAME_COMMANDS = new Set([
  'blackjack', 'bj', 'mines', 'hilo', 'coinflip', 'cf', 'flip',
  'tower', 'dice', 'keno', 'limbo', 'crash', 'chicken', 'roulette',
  'wheel', 'slots', 'slot', 's',
]);

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    if (message.author.bot) return;
    if (!message.content.startsWith('.')) return;

    const args    = message.content.slice(1).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();

    const command = client.commands.get(cmdName);
    if (!command) return;

    // ── Ensure user exists ──────────────────────────────────────
    try {
      await getOrCreateUser(message.author.id, message.author.username);
    } catch (err) {
      logger.error('User creation failed:', err);
    }

    // ── Active-user tracking for .rain ─────────────────────────
    if (!client.activeUsers) client.activeUsers = new Map(); // channelId → Set of userId+timestamp
    // Not doing per-message storage here — rain reads message history directly

    // ── Rate limiting ───────────────────────────────────────────
    const cooldownKey = `${message.author.id}:${cmdName}`;
    const cooldownMs  = COOLDOWNS[cmdName] || COOLDOWNS[command.name] || COOLDOWNS._default;
    const lastUsed    = cooldownMap.get(cooldownKey) || 0;
    const remaining   = cooldownMs - (Date.now() - lastUsed);

    if (remaining > 0) {
      const secs = (remaining / 1000).toFixed(1);
      return message.reply({
        embeds: [errorEmbed('Slow Down', `Wait **${secs}s** before using \`.${cmdName}\` again.`)],
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
    }

    cooldownMap.set(cooldownKey, Date.now());

    // ── Max 1 active game per user ──────────────────────────────
    if (GAME_COMMANDS.has(cmdName)) {
      let hasActive = false;
      for (const [, game] of client.activeGames) {
        if (game.userId === message.author.id) { hasActive = true; break; }
      }
      if (hasActive) {
        return message.reply({
          embeds: [errorEmbed('Game Active', 'You already have an active game running. Finish it first.')],
        });
      }
    }

    // ── Execute ─────────────────────────────────────────────────
    try {
      await command.execute(message, args, client);
    } catch (err) {
      logger.error(`Command ${cmdName} error:`, err);
      const embed = errorEmbed('Command Error', err.message || 'Something went wrong.');
      await message.reply({ embeds: [embed] }).catch(() => {});
    }
  },
};
