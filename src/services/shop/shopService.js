/**
 * Shop System
 * Players spend credits on:
 *  - Discord roles
 *  - Custom display titles
 *  - Profile badges (shown in .profile embed)
 *  - Special embed effects (neon glow, gold border, etc.)
 *
 * Admins configure shop items via .shopadmin add/remove.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** Default shop items — admins can add more via DB */
const DEFAULT_ITEMS = [
  {
    id:          'title_high_roller',
    name:        '🎲 High Roller',
    description: 'Display title: **High Roller** shown in your profile',
    type:        'title',
    price:       25000,
    value:       'High Roller',
  },
  {
    id:          'title_whale',
    name:        '🐳 Whale',
    description: 'Display title: **Whale** — the biggest fish in the casino',
    type:        'title',
    price:       100000,
    value:       'Whale',
  },
  {
    id:          'title_degen',
    name:        '🔥 Degen',
    description: 'Display title: **Degen** — wear it with pride',
    type:        'title',
    price:       10000,
    value:       'Degen',
  },
  {
    id:          'badge_diamond',
    name:        '💎 Diamond Member',
    description: 'Profile badge: 💎 Diamond shown next to your name',
    type:        'badge',
    price:       50000,
    value:       '💎',
  },
  {
    id:          'badge_crown',
    name:        '👑 Crown',
    description: 'Profile badge: 👑 Crown — royalty status',
    type:        'badge',
    price:       75000,
    value:       '👑',
  },
  {
    id:          'effect_gold',
    name:        '✨ Gold Border',
    description: 'Your profile embed gets a gold (#FFD700) color border',
    type:        'effect',
    price:       30000,
    value:       'gold',
  },
  {
    id:          'effect_neon',
    name:        '🟣 Neon Purple',
    description: 'Your profile embed glows neon purple',
    type:        'effect',
    price:       30000,
    value:       'neon',
  },
];

/** Seed default items into DB on startup */
async function seedShopItems() {
  for (const item of DEFAULT_ITEMS) {
    await prisma.shopItem.upsert({
      where:  { itemId: item.id },
      update: { price: item.price, name: item.name, description: item.description },
      create: {
        itemId:      item.id,
        name:        item.name,
        description: item.description,
        type:        item.type,
        price:       item.price,
        value:       item.value,
        active:      true,
      },
    });
  }
}

/** Get all active shop items */
async function getShopItems() {
  return prisma.shopItem.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
}

/** Buy an item */
async function buyItem(discordId, itemId) {
  const item = await prisma.shopItem.findUnique({ where: { itemId } });
  if (!item || !item.active) throw new Error('Item not found or no longer available.');

  // Check if already owned (for non-stackable items)
  const owned = await prisma.userItem.findFirst({ where: { discordId, itemId } });
  if (owned) throw new Error('You already own this item.');

  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user || user.balance < item.price) throw new Error(`Insufficient credits. Costs 🪙 ${item.price.toLocaleString()}.`);

  // Deduct credits and grant item
  await prisma.$transaction([
    prisma.user.update({
      where: { discordId },
      data: {
        balance: { decrement: item.price },
        transactions: {
          create: {
            type:        'shop_purchase',
            amount:      -item.price,
            description: `Purchased: ${item.name}`,
          },
        },
      },
    }),
    prisma.userItem.create({
      data: { discordId, itemId, type: item.type, value: item.value },
    }),
  ]);

  return item;
}

/** Get a user's inventory */
async function getInventory(discordId) {
  return prisma.userItem.findMany({
    where:   { discordId },
    include: { shopItem: true },
    orderBy: { purchasedAt: 'desc' },
  });
}

/**
 * Equip/activate an item (titles, effects — only one active at a time per type).
 */
async function equipItem(discordId, itemId) {
  const userItem = await prisma.userItem.findFirst({ where: { discordId, itemId } });
  if (!userItem) throw new Error('You do not own this item.');

  // Unequip other items of the same type
  await prisma.userItem.updateMany({
    where:  { discordId, type: userItem.type, equipped: true },
    data:   { equipped: false },
  });

  // Equip this one
  await prisma.userItem.update({
    where: { id: userItem.id },
    data:  { equipped: true },
  });

  return userItem;
}

/** Get a user's currently equipped items */
async function getEquipped(discordId) {
  const items = await prisma.userItem.findMany({
    where: { discordId, equipped: true },
  });

  const equipped = {};
  for (const item of items) {
    equipped[item.type] = item.value;
  }
  return equipped;
}

module.exports = { seedShopItems, getShopItems, buyItem, getInventory, equipItem, getEquipped };
