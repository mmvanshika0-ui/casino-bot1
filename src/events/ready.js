const logger = require('../utils/logger');
const { Collection } = require('discord.js');
const { registerInteractionHandlers } = require('../utils/interactionRegistry');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}`);
    client.user.setActivity('🎰 Casino | .help', { type: 0 });
    client.interactionHandlers = new Collection();
    registerInteractionHandlers(client);
  },
};
