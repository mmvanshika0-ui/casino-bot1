const blackjackHandler  = require('../games/blackjack/handler');
const minesHandler      = require('../games/mines/handler');
const hiloHandler       = require('../games/hilo/handler');
const coinflipHandler   = require('../games/coinflip/handler');
const towerHandler      = require('../games/tower/handler');
const diceHandler       = require('../games/dice/handler');
const crashHandler      = require('../games/crash/handler');
const chickenHandler    = require('../games/chicken/handler');
const rouletteHandler   = require('../games/roulette/handler');
const wheelHandler      = require('../games/wheel/handler');
const depositHandler    = require('../commands/economy/deposit').interactionHandler;
const withdrawHandler   = require('../commands/economy/withdraw').interactionHandler;
const vaultHandler      = require('../commands/economy/vault').interactionHandler;
const duelHandler       = require('../commands/economy/duel').interactionHandler;
const leaderboardHandler= require('../commands/economy/leaderboard').interactionHandler;

function registerInteractionHandlers(client) {
  client.interactionHandlers.set('bj',        blackjackHandler);
  client.interactionHandlers.set('mines',     minesHandler);
  client.interactionHandlers.set('hilo',      hiloHandler);
  client.interactionHandlers.set('cf',        coinflipHandler);
  client.interactionHandlers.set('tower',     towerHandler);
  client.interactionHandlers.set('dice',      diceHandler);
  client.interactionHandlers.set('crash',     crashHandler);
  client.interactionHandlers.set('chicken',   chickenHandler);
  client.interactionHandlers.set('roulette',  rouletteHandler);
  client.interactionHandlers.set('wheel',     wheelHandler);
  client.interactionHandlers.set('deposit',   depositHandler);
  client.interactionHandlers.set('withdraw',  withdrawHandler);
  client.interactionHandlers.set('vault',     vaultHandler);
  client.interactionHandlers.set('duel',      duelHandler);
  client.interactionHandlers.set('lb',        leaderboardHandler);
}

module.exports = { registerInteractionHandlers };
