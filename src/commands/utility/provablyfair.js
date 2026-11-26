const { EmbedBuilder } = require('discord.js');
const { errorEmbed }   = require('../../embeds/embedBuilder');
const {
  getSeedPair, rotateSeedPair, setClientSeed, getSeedHistory, verifyResult,
} = require('../../services/provablyfair/provablyFairService');
const config = require('../../config/config');

module.exports = {
  name:        'fair',
  aliases:     ['seed', 'provable', 'verify'],
  description: 'Manage your provably fair seed pair. Verify any past result.',
  async execute(message, args, client) {
    const sub = (args[0] || 'info').toLowerCase();

    // .fair info — show current seed pair
    if (sub === 'info') {
      const pair = await getSeedPair(message.author.id);
      const embed = new EmbedBuilder()
        .setColor(config.colors.purple)
        .setTitle('🔐 Provably Fair — Your Seed Pair')
        .setDescription(
          'Every game result is derived from **HMAC-SHA256(serverSeed, clientSeed:nonce)**.\n' +
          'The server seed is revealed after you rotate, allowing full verification.'
        )
        .addFields(
          {
            name:   '🔒 Server Seed Hash (pre-commitment)',
            value:  `\`${pair.serverSeedHash}\``,
            inline: false,
          },
          {
            name:   '🎲 Client Seed',
            value:  `\`${pair.clientSeed}\`\n*(Change with `.fair setseed <your_seed>`)*`,
            inline: false,
          },
          {
            name:   '🔢 Current Nonce',
            value:  `**${pair.nonce}** *(increments each game)*`,
            inline: true,
          },
        )
        .setFooter({ text: 'Rotate seeds to reveal the server seed → .fair rotate' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // .fair rotate — reveal server seed, generate new pair
    if (sub === 'rotate') {
      const result = await rotateSeedPair(message.author.id);
      if (!result) return message.reply({ embeds: [errorEmbed('No Pair', 'Start a game first to initialize your seed pair.')] });

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🔐 Seeds Rotated')
        .setDescription('Your old server seed is now revealed. Use it to verify past results.')
        .addFields(
          { name: '🔓 Revealed Server Seed', value: `\`${result.revealed.serverSeed}\``, inline: false },
          { name: '✅ Hash (verify it)',      value: `\`${result.revealed.serverSeedHash}\`\n*SHA-256(serverSeed) should match the hash you were shown.*`, inline: false },
          { name: '🎲 Old Client Seed',      value: `\`${result.revealed.clientSeed}\``, inline: true },
          { name: '🔢 Nonces Used',          value: `0 — ${result.revealed.nonce - 1}`,  inline: true },
          { name: '🆕 New Server Seed Hash', value: `\`${result.fresh.serverSeedHash}\``, inline: false },
        )
        .setFooter({ text: 'SHA-256 the revealed seed to confirm it matches the hash you were shown.' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // .fair setseed <seed> — set custom client seed
    if (sub === 'setseed') {
      const seed = args.slice(1).join(' ');
      if (!seed) return message.reply({ embeds: [errorEmbed('Missing Seed', 'Usage: `.fair setseed <your_seed>`')] });

      try {
        await setClientSeed(message.author.id, seed);
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ Client Seed Updated')
          .addFields({ name: '🎲 New Client Seed', value: `\`${seed}\`` })
          .setFooter({ text: 'Your next game will use this client seed.' })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      } catch (err) {
        return message.reply({ embeds: [errorEmbed('Invalid Seed', err.message)] });
      }
    }

    // .fair history — show past seed pairs
    if (sub === 'history') {
      const history = await getSeedHistory(message.author.id, 5);
      if (!history.length) return message.reply({ embeds: [errorEmbed('No History', 'No previous seed pairs found.')] });

      const lines = history.map((h, i) =>
        `**${i + 1}.** Server Seed: \`${h.serverSeed.slice(0, 16)}…\` | Client: \`${h.clientSeed.slice(0, 8)}…\` | Nonces: 0–${h.nonce - 1}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('🔐 Seed Pair History')
        .setDescription(lines)
        .setFooter({ text: 'Use .fair rotate to reveal your current server seed.' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // .fair verify <serverSeed> <clientSeed> <nonce>
    if (sub === 'verify') {
      const [, serverSeed, clientSeed, nonceStr] = args;
      if (!serverSeed || !clientSeed || !nonceStr) {
        return message.reply({ embeds: [errorEmbed('Usage', '`.fair verify <serverSeed> <clientSeed> <nonce>`')] });
      }

      const nonce  = parseInt(nonceStr);
      const result = verifyResult(serverSeed, clientSeed, nonce);

      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle('🔍 Result Verification')
        .addFields(
          { name: '🔑 Server Seed',         value: `\`${result.serverSeed}\``, inline: false },
          { name: '🎲 Client Seed',          value: `\`${result.clientSeed}\``, inline: false },
          { name: '🔢 Nonce',                value: `${result.nonce}`,          inline: true  },
          { name: '📐 Derived Float [0,1)',  value: `\`${result.float.toFixed(10)}\``, inline: false },
          { name: '🔒 Server Seed Hash',     value: `\`${result.hash}\``, inline: false },
        )
        .setDescription(
          'The derived float is the raw randomness used to compute the game outcome.\n' +
          'Cross-check the hash with what was shown before the game.\n' +
          '**Formula:** `HMAC-SHA256(serverSeed, clientSeed:nonce)` → first 8 hex chars → uint32 / 2^32'
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // Default: help
    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle('🔐 Provably Fair — Commands')
      .addFields(
        { name: '`.fair info`',                           value: 'Show your current seed pair and nonce', inline: false },
        { name: '`.fair rotate`',                         value: 'Reveal server seed, get a new pair',   inline: false },
        { name: '`.fair setseed <seed>`',                 value: 'Set a custom client seed',             inline: false },
        { name: '`.fair history`',                        value: 'Show past revealed seed pairs',        inline: false },
        { name: '`.fair verify <sSeed> <cSeed> <nonce>`', value: 'Verify any past game result',          inline: false },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
