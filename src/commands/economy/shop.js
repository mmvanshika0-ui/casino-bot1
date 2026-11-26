const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { errorEmbed }  = require('../../embeds/embedBuilder');
const { formatBalance } = require('../../utils/format');
const { getShopItems, buyItem, getInventory, equipItem, getEquipped } = require('../../services/shop/shopService');
const config = require('../../config/config');

const TYPE_ICONS = { title: '📛', badge: '🏅', effect: '✨', role: '🎭' };

module.exports = {
  name:        'shop',
  aliases:     ['store', 'buy'],
  description: 'Browse and buy items with your credits.',
  async execute(message, args, client) {
    const sub = (args[0] || 'browse').toLowerCase();

    // .shop browse — list all items
    if (sub === 'browse' || sub === 'list') {
      const items = await getShopItems();
      if (!items.length) return message.reply({ embeds: [errorEmbed('Shop Empty', 'No items in the shop right now.')] });

      const byType = {};
      for (const item of items) {
        if (!byType[item.type]) byType[item.type] = [];
        byType[item.type].push(item);
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.gold)
        .setTitle('🛒 Casino Shop')
        .setDescription('Spend your credits on titles, badges, and profile effects.\nUse `.shop buy <item_id>` to purchase.')
        .setFooter({ text: 'Casino Bot • Shop • Use .shop inventory to see your items' })
        .setTimestamp();

      for (const [type, typeItems] of Object.entries(byType)) {
        const icon  = TYPE_ICONS[type] || '🎁';
        const lines = typeItems.map(i =>
          `**\`${i.itemId}\`** — ${i.name}\n  ${i.description}\n  💰 Price: 🪙 ${formatBalance(i.price)}`
        ).join('\n\n');
        embed.addFields({ name: `${icon} ${type.charAt(0).toUpperCase() + type.slice(1)}s`, value: lines, inline: false });
      }

      return message.reply({ embeds: [embed] });
    }

    // .shop buy <item_id>
    if (sub === 'buy') {
      const itemId = args[1];
      if (!itemId) return message.reply({ embeds: [errorEmbed('Missing Item', 'Usage: `.shop buy <item_id>`')] });

      try {
        const item = await buyItem(message.author.id, itemId);
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ Purchase Successful!')
          .setDescription(`You bought **${item.name}**!`)
          .addFields(
            { name: '🎁 Item',   value: item.description,              inline: false },
            { name: '💰 Paid',   value: `🪙 ${formatBalance(item.price)}`, inline: true  },
          )
          .setFooter({ text: 'Use .shop equip <item_id> to activate it.' })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      } catch (err) {
        return message.reply({ embeds: [errorEmbed('Purchase Failed', err.message)] });
      }
    }

    // .shop inventory — show owned items
    if (sub === 'inventory' || sub === 'inv') {
      const items = await getInventory(message.author.id);
      if (!items.length) return message.reply({ embeds: [errorEmbed('Empty Inventory', 'You haven\'t bought anything yet.')] });

      const lines = items.map(i =>
        `${i.equipped ? '✅' : '⬜'} **${i.shopItem?.name || i.itemId}** (${i.type}) ${i.equipped ? '— *Equipped*' : ''}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(config.colors.purple)
        .setTitle('🎒 Your Inventory')
        .setDescription(lines)
        .setFooter({ text: 'Use .shop equip <item_id> to equip an item.' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // .shop equip <item_id>
    if (sub === 'equip') {
      const itemId = args[1];
      if (!itemId) return message.reply({ embeds: [errorEmbed('Missing Item', 'Usage: `.shop equip <item_id>`')] });

      try {
        await equipItem(message.author.id, itemId);
        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('✅ Item Equipped!')
          .setDescription(`**\`${itemId}\`** is now active on your profile.`)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      } catch (err) {
        return message.reply({ embeds: [errorEmbed('Equip Failed', err.message)] });
      }
    }

    return message.reply({
      embeds: [errorEmbed('Usage',
        '`.shop browse` · `.shop buy <id>` · `.shop inventory` · `.shop equip <id>`'
      )],
    });
  },
};
