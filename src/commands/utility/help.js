const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config/config');

const CATEGORIES = {
  games: {
    emoji: '🎮',
    title: 'Games',
    commands: [
      { name: '.blackjack <bet>',          desc: 'Classic card game vs dealer' },
      { name: '.mines <bet> [mines]',       desc: 'Find gems, avoid mines' },
      { name: '.hilo <bet>',               desc: 'Guess higher or lower' },
      { name: '.coinflip <bet>',           desc: 'Heads or tails' },
      { name: '.tower <bet> [difficulty]', desc: 'Climb the tower' },
      { name: '.dice <bet> [type]',        desc: 'Roll the dice' },
      { name: '.keno <bet>',              desc: 'Pick numbers, win big' },
      { name: '.limbo <bet> <target>',     desc: 'Set your multiplier target' },
      { name: '.crash <bet>',             desc: 'Cash out before it crashes' },
      { name: '.chicken <bet>',           desc: 'Cross the road safely' },
      { name: '.roulette <bet> <type>',   desc: 'Spin the roulette wheel' },
      { name: '.wheel <bet>',             desc: 'Spin the wheel of fortune' },
    ],
  },
  economy: {
    emoji: '💰',
    title: 'Economy',
    commands: [
      { name: '.balance [@user]',          desc: 'Check your balance' },
      { name: '.daily',                    desc: 'Claim daily reward' },
      { name: '.tip @user <amount>',       desc: 'Tip credits to a user' },
      { name: '.vault',                    desc: 'Manage your vault' },
      { name: '.deposit',                  desc: 'Deposit crypto' },
      { name: '.withdraw',                 desc: 'Withdraw crypto' },
      { name: '.duel @user <amount>',      desc: 'Challenge a player' },
      { name: '.leaderboard [type]',       desc: 'View top players' },
    ],
  },
  profile: {
    emoji: '👤',
    title: 'Profile',
    commands: [
      { name: '.profile [@user]', desc: 'View casino profile' },
    ],
  },
};

module.exports = {
  name: 'help',
  aliases: ['h', 'commands'],
  description: 'Show all commands.',

  async execute(message, args, client) {
    const category = args[0]?.toLowerCase();

    if (category && CATEGORIES[category]) {
      const cat   = CATEGORIES[category];
      const embed = new EmbedBuilder()
        .setColor(config.colors.purple)
        .setTitle(`${cat.emoji} ${cat.title} Commands`)
        .setDescription(cat.commands.map(c => `\`${c.name}\`\n╰ ${c.desc}`).join('\n\n'))
        .setFooter({ text: 'Casino Bot • Use . prefix' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // main help
    const embed = new EmbedBuilder()
      .setColor(config.colors.purple)
      .setTitle('🎰 Casino Bot — Help')
      .setDescription('Premium Discord casino with **12 games**, crypto deposits/withdrawals, economy system, and more.\n\nSelect a category below or use `.help <category>`.')
      .addFields(
        Object.entries(CATEGORIES).map(([key, cat]) => ({
          name:   `${cat.emoji} ${cat.title}`,
          value:  `${cat.commands.length} commands — \`.help ${key}\``,
          inline: true,
        }))
      )
      .addFields({ name: '💡 Tip', value: 'All commands use `.` prefix. Example: `.blackjack 100`', inline: false })
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ text: 'Casino Bot • Premium Gaming' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      ...Object.entries(CATEGORIES).map(([key, cat]) =>
        new ButtonBuilder()
          .setCustomId(`help:${key}`)
          .setLabel(cat.title)
          .setEmoji(cat.emoji)
          .setStyle(ButtonStyle.Secondary)
      )
    );

    await message.reply({ embeds: [embed], components: [row] });
  },
};
