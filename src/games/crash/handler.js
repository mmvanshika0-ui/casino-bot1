/**
 * Crash Game Handler — Updated
 * Changes over original:
 *  - Provably fair crash point (HMAC-SHA256 chain)
 *  - Auto-cashout: player sets target multiplier before round starts
 *  - Jackpot contribution per bet
 *  - Big win / jackpot notifications
 *  - Rate limiting hook (cooldown handled in command layer)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { getSeedPair, incrementNonce, deriveCrashPoint } = require('../../services/provablyfair/provablyFairService');
const { contributeBet, checkJackpotTrigger, triggerJackpot, getJackpot } = require('../../services/jackpot/jackpotService');
const { notifyBigWin, notifyJackpot } = require('../../services/notifications/notificationService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

function buildEmbed(state, discordUser, jackpotAmount) {
  const { multiplier, crashPoint, status, bet, cashedAt, autoCashout, serverSeedHash, clientSeed, nonce } = state;
  const isCrashed   = status === 'loss';
  const isCashedOut = status === 'win';

  const mult   = isCrashed ? crashPoint : multiplier;
  const payout = isCashedOut
    ? Math.floor(bet * cashedAt)
    : Math.floor(bet * multiplier);

  const graphBar = buildGraph(multiplier, crashPoint, isCrashed);

  const embed = new EmbedBuilder()
    .setColor(isCrashed ? config.colors.danger : isCashedOut ? config.colors.success : config.colors.info)
    .setTitle('🚀 Crash')
    .setDescription(graphBar)
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '📈 Multiplier',    value: `**${mult}x**`,                                    inline: true },
      { name: '💰 Bet',           value: `🪙 ${formatBalance(bet)}`,                        inline: true },
      { name: '💸 Value',         value: `🪙 ${formatBalance(payout)}`,                     inline: true },
      { name: '📊 Status',        value: isCrashed
          ? `💥 Crashed at ${crashPoint}x`
          : isCashedOut
            ? `✅ Cashed out at ${cashedAt}x`
            : autoCashout
              ? `🎯 Auto-cashout at **${autoCashout}x**`
              : '🎮 Flying...',                                                                inline: false },
      { name: '🏆 Jackpot Pool',  value: `🪙 ${formatBalance(jackpotAmount)}`,               inline: true },
    )
    .setFooter({ text: `🔐 Seed Hash: ${serverSeedHash?.slice(0, 16)}… | Nonce: ${nonce} | Provably Fair` })
    .setTimestamp();

  return embed;
}

function buildGraph(current, crashPoint, crashed) {
  const max    = crashed ? crashPoint : Math.max(current, 2);
  const pct    = Math.min(current / max, 1);
  const bars   = 20;
  const filled = Math.floor(pct * bars);
  const bar    = '▰'.repeat(filled) + '▱'.repeat(bars - filled);
  return `\`\`\`\n📈 ${bar} ${current}x\n${crashed ? '💥 CRASHED' : '🚀 FLYING'}\`\`\``;
}

function buildButtons(gameId, canCashout = true) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash:cashout:${gameId}`)
        .setLabel('💸 Cash Out')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canCashout),
      new ButtonBuilder()
        .setCustomId(`crash:setauto:${gameId}`)
        .setLabel('🎯 Set Auto-Cashout')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canCashout),
    ),
  ];
}

/** Interaction handler (button presses) */
module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);

  if (!state || state.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  }
  if (state.status !== 'playing') {
    return interaction.reply({ content: '❌ Game already ended.', ephemeral: true });
  }

  if (action === 'cashout') {
    await interaction.deferUpdate();
    state.status   = 'win';
    state.cashedAt = state.multiplier;
    const payout   = Math.floor(state.bet * state.cashedAt);
    await payoutWin(interaction.user.id, payout, 'crash');

    // Jackpot check
    const jpTrigger = checkJackpotTrigger('crash', { cashedAt: state.cashedAt });
    if (jpTrigger) {
      const jpAmount = await triggerJackpot(interaction.user.id, 'crash', jpTrigger);
      await notifyJackpot(client, { discordId: interaction.user.id, game: 'crash', trigger: jpTrigger, amount: jpAmount });
    }

    // Big win notification
    if (state.cashedAt >= 10) {
      await notifyBigWin(client, {
        discordId:  interaction.user.id,
        username:   interaction.user.username,
        game:       'crash',
        bet:        state.bet,
        payout,
        multiplier: state.cashedAt,
        avatar:     interaction.user.avatar,
      });
    }

    client.activeGames.delete(gameId);
    const jpAmount = await getJackpot();
    return interaction.editReply({ embeds: [buildEmbed(state, interaction.user, jpAmount)], components: [] });
  }

  if (action === 'setauto') {
    // Show a modal for auto-cashout input
    const modal = new ModalBuilder()
      .setCustomId(`crash:automodal:${gameId}`)
      .setTitle('Set Auto-Cashout');

    const input = new TextInputBuilder()
      .setCustomId('auto_value')
      .setLabel('Auto-cashout multiplier (e.g. 2.5)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(10)
      .setRequired(true)
      .setPlaceholder('1.50');

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }
};

/** Handle auto-cashout modal submission */
module.exports.handleAutoModal = async function (interaction, parts, client) {
  const gameId = parts[0];
  const state  = client.activeGames.get(gameId);

  if (!state || state.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  }

  const val = parseFloat(interaction.fields.getTextInputValue('auto_value'));
  if (isNaN(val) || val < 1.01) {
    return interaction.reply({ content: '❌ Auto-cashout must be ≥ 1.01.', ephemeral: true });
  }

  state.autoCashout = val;
  await interaction.deferUpdate();

  const jpAmount = await getJackpot();
  return interaction.editReply({
    embeds:     [buildEmbed(state, interaction.user, jpAmount)],
    components: buildButtons(gameId),
  });
};

/** Start a new crash game */
module.exports.startGame = async function (userId, bet, message, client) {
  const id       = uuidv4();
  const seedPair = await getSeedPair(userId);
  const crashPoint = deriveCrashPoint(seedPair.serverSeed, seedPair.clientSeed, seedPair.nonce);

  await incrementNonce(seedPair.id);

  const state = {
    id,
    userId,
    bet,
    multiplier:     1.0,
    crashPoint,
    status:         'playing',
    cashedAt:       null,
    autoCashout:    null,
    serverSeedHash: seedPair.serverSeedHash,
    clientSeed:     seedPair.clientSeed,
    nonce:          seedPair.nonce,
  };

  client.activeGames.set(id, state);
  await contributeBet(bet);

  const jpAmount = await getJackpot();
  const msg = await message.reply({
    embeds:     [buildEmbed(state, message.author, jpAmount)],
    components: buildButtons(id),
  });

  // Tick every 600ms
  const interval = setInterval(async () => {
    if (!client.activeGames.has(id)) { clearInterval(interval); return; }

    state.multiplier = parseFloat((state.multiplier * 1.06).toFixed(2));

    // Auto-cashout check
    if (state.autoCashout && state.multiplier >= state.autoCashout) {
      state.status   = 'win';
      state.cashedAt = state.multiplier;
      const payout   = Math.floor(state.bet * state.cashedAt);
      await payoutWin(userId, payout, 'crash');

      if (state.cashedAt >= 10) {
        await notifyBigWin(client, {
          discordId: userId, username: message.author.username,
          game: 'crash', bet: state.bet, payout, multiplier: state.cashedAt,
          avatar: message.author.avatar,
        });
      }

      client.activeGames.delete(id);
      clearInterval(interval);
      const jp = await getJackpot();
      await msg.edit({ embeds: [buildEmbed(state, message.author, jp)], components: [] }).catch(() => {});
      return;
    }

    // Crash check
    if (state.multiplier >= state.crashPoint) {
      state.multiplier = state.crashPoint;
      state.status     = 'loss';
      await recordLoss(userId, 'crash');
      client.activeGames.delete(id);
      clearInterval(interval);
      const jp = await getJackpot();
      await msg.edit({ embeds: [buildEmbed(state, message.author, jp)], components: [] }).catch(() => {});
      return;
    }

    const autoLabel = state.autoCashout ? ` (auto @ ${state.autoCashout}x)` : '';
    const cashoutRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash:cashout:${id}`)
        .setLabel(`💸 Cash Out — 🪙 ${formatBalance(Math.floor(state.bet * state.multiplier))}${autoLabel}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`crash:setauto:${id}`)
        .setLabel('🎯 Auto-Cashout')
        .setStyle(ButtonStyle.Secondary),
    );

    const jp = await getJackpot();
    await msg.edit({
      embeds:     [buildEmbed(state, message.author, jp)],
      components: [cashoutRow],
    }).catch(() => {});
  }, 600);

  return state;
};

module.exports.buildEmbed = buildEmbed;
