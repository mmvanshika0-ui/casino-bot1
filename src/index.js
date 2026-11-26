require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { PrismaClient }       = require('@prisma/client');
const { loadCommands }       = require('./utils/commandLoader');
const { loadEvents }         = require('./utils/eventLoader');
const logger                 = require('./utils/logger');
const { startCallbackServer } = require('./services/transaction/callbackServer');
const { getJackpot }         = require('./services/jackpot/jackpotService');
const { updateJackpotStatus } = require('./services/notifications/notificationService');
const { seedShopItems }      = require('./services/shop/shopService');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const prisma = new PrismaClient();
client.prisma      = prisma;
client.commands    = new Collection();
client.activeGames = new Map();
client.casinoEvent = null;
client._eventTimer = null;

async function main() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    // Seed default shop items
    await seedShopItems();
    logger.info('Shop items seeded');

    await loadCommands(client);
    await loadEvents(client);

    await client.login(process.env.DISCORD_TOKEN);
    logger.info('Bot logged in');

    startCallbackServer(client);

    // ── Jackpot status update every 5 minutes ───────────────────
    setInterval(async () => {
      try {
        const amount = await getJackpot();
        updateJackpotStatus(client, amount);
      } catch (_) {}
    }, 5 * 60 * 1000);

    // Initial jackpot status
    setTimeout(async () => {
      const amount = await getJackpot();
      updateJackpotStatus(client, amount);
    }, 5000);

  } catch (err) {
    logger.error('Startup error:', err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException',  (err) => { logger.error('Uncaught exception:', err); process.exit(1); });

main();
