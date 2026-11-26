const logger = require('../utils/logger');

// Map game prefix → handler module path
const GAME_HANDLERS = {
  blackjack: '../../games/blackjack/handler',
  mines:     '../../games/mines/handler',
  hilo:      '../../games/hilo/handler',
  coinflip:  '../../games/coinflip/handler',
  tower:     '../../games/tower/handler',
  dice:      '../../games/dice/handler',
  keno:      '../../games/keno/handler',
  limbo:     '../../games/limbo/handler',
  crash:     '../../games/crash/handler',
  chicken:   '../../games/chicken/handler',
  roulette:  '../../games/roulette/handler',
  wheel:     '../../games/wheel/handler',
  slots:     '../../games/slots/handler',
};

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    try {
      // ── Button interactions ─────────────────────────────────────
      if (interaction.isButton()) {
        const [game, ...parts] = interaction.customId.split(':');
        const handlerPath = GAME_HANDLERS[game];
        if (!handlerPath) return;

        const handler = require(handlerPath);
        await handler(interaction, parts, client);
        return;
      }

      // ── Modal submit interactions ───────────────────────────────
      if (interaction.isModalSubmit()) {
        const [game, action, ...parts] = interaction.customId.split(':');

        // crash auto-cashout modal
        if (game === 'crash' && action === 'automodal') {
          const handler = require('../../games/crash/handler');
          await handler.handleAutoModal(interaction, parts, client);
          return;
        }
      }

      // ── Select menu interactions ────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        const [game, ...parts] = interaction.customId.split(':');
        const handlerPath = GAME_HANDLERS[game];
        if (!handlerPath) return;
        const handler = require(handlerPath);
        if (handler.handleSelect) await handler.handleSelect(interaction, parts, client);
        return;
      }

    } catch (err) {
      logger.error('Interaction error:', err);
      const payload = { content: '❌ Something went wrong.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
