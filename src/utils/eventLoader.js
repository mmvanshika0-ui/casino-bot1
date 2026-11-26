const { readdirSync } = require('fs');
const { join } = require('path');
const logger = require('./logger');

async function loadEvents(client) {
  const eventsPath = join(__dirname, '../events');
  const files = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const event = require(join(eventsPath, file));
      if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
      } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
      }
      logger.debug(`Loaded event: ${event.name}`);
    } catch (err) {
      logger.error(`Failed to load event ${file}:`, err);
    }
  }
}

module.exports = { loadEvents };
