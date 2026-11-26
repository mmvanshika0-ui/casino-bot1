const { readdirSync } = require('fs');
const { join } = require('path');
const logger = require('./logger');

async function loadCommands(client) {
  const commandsPath = join(__dirname, '../commands');
  const categories = readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = join(commandsPath, category);
    const files = readdirSync(categoryPath).filter(f => f.endsWith('.js'));

    for (const file of files) {
      try {
        const command = require(join(categoryPath, file));
        if (command.name) {
          client.commands.set(command.name, command);
          logger.debug(`Loaded command: ${command.name}`);
        }
      } catch (err) {
        logger.error(`Failed to load command ${file}:`, err);
      }
    }
  }

  logger.info(`Loaded ${client.commands.size} commands`);
}

module.exports = { loadCommands };
