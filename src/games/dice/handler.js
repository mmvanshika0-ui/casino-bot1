const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { payoutWin, recordLoss } = require('../../services/economy/economyService');
const { formatBalance } = require('../../utils/format');
const config = require('../../config/config');
const { v4: uuidv4 } = require('uuid');

const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function rollDice() { return Math.floor(Math.random() * 6) + 1; }

// bet types: over7, under7, exactly7, doubles
function resolveBet(d1, d2, betType) {
  const sum = d1 + d2;
  switch (betType) {
    case 'over7':    return { win: sum > 7,       mult: 2.0  };
    case 'under7':   return { win: sum < 7,       mult: 2.0  };
    case 'exactly7': return { win: sum === 7,      mult: 4.5  };
    case 'doubles':  return { win: d1 === d2,      mult: 5.0  };
    default:         return { win: false,          mult: 1.0  };
  }
}

function buildEmbed(state, discordUser, rolled = false) {
  const betLabels = { over7: 'Over 7', under7: 'Under 7', exactly7: 'Exactly 7', doubles: 'Doubles' };
  const betMults  = { over7: '2.0x', under7: '2.0x', exactly7: '4.5x', doubles: '5.0x' };

  let desc = rolled
    ? `${DICE_FACES[state.d1 - 1]} ${DICE_FACES[state.d2 - 1]} — **Sum: ${state.d1 + state.d2}**`
    : '🎲 Press **Roll** to throw the dice!';

  return new EmbedBuilder()
    .setColor(state.status === 'win' ? config.colors.success : state.status === 'loss' ? config.colors.danger : config.colors.info)
    .setTitle('🎲 Dice')
    .setDescription(desc)
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '🎯 Bet Type',   value: betLabels[state.betType] || state.betType, inline: true },
      { name: '📈 Multiplier', value: betMults[state.betType]  || '?',           inline: true },
      { name: '💰 Bet',        value: `🪙 ${formatBalance(state.bet)}`,          inline: true },
      ...(rolled ? [
        { name: '📊 Result', value: state.status === 'win' ? `🏆 WIN! 🪙 ${formatBalance(Math.floor(state.bet * state.mult))}` : '💀 LOSS', inline: false },
      ] : []),
    )
    .setFooter({ text: 'Casino Bot • Dice' }).setTimestamp();
}

module.exports = async function (interaction, parts, client) {
  const [action, gameId] = parts;
  const state = client.activeGames.get(gameId);
  if (!state || state.userId !== interaction.user.id) return interaction.reply({ content: '❌ Not your game.', ephemeral: true });
  if (state.status !== 'playing') return interaction.reply({ content: '❌ Game ended.', ephemeral: true });

  await interaction.deferUpdate();

  if (action === 'roll') {
    state.d1 = rollDice();
    state.d2 = rollDice();
    const { win, mult } = resolveBet(state.d1, state.d2, state.betType);
    state.mult   = mult;
    state.status = win ? 'win' : 'loss';

    if (win) await payoutWin(interaction.user.id, Math.floor(state.bet * mult), 'dice');
    else     await recordLoss(interaction.user.id, 'dice');
    client.activeGames.delete(gameId);

    await interaction.editReply({ embeds: [buildEmbed(state, interaction.user, true)], components: [] });
  }
};

module.exports.startGame = function (userId, bet, betType = 'over7') {
  const valid = ['over7','under7','exactly7','doubles'];
  if (!valid.includes(betType)) betType = 'over7';
  return { id: uuidv4(), userId, bet, betType, d1: null, d2: null, mult: 1, status: 'playing' };
};

module.exports.buildEmbed = buildEmbed;

module.exports.buildButtons = function (gameId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dice:roll:${gameId}`).setLabel('🎲 Roll!').setStyle(ButtonStyle.Primary),
  )];
};
