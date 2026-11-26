/**
 * Rank System Configuration
 *
 * Ranks are determined by totalWagered (lifetime credits wagered).
 * Each rank grants perks that stack on top of base economy.
 *
 * Casino Event multipliers:
 *   "hot_streak" event boosts payouts per rank:
 *     Bronze–Gold   → 2.0×
 *     Platinum      → 2.25×
 *     Diamond       → 2.5×
 *     Obsidian      → 3.0×
 */

const RANKS = [
  {
    id:            'obsidian',
    name:          'Obsidian',
    emoji:         '🖤',
    color:         0x1A0030,        // deep dark purple
    minWagered:    50_000_000,      // 50M credits lifetime wagered
    dailyBonus:    5000,            // extra on top of base daily
    xpMultiplier:  3.0,            // XP earned per game × this
    eventMultiplier: 3.0,          // during hot_streak event
    withdrawLimit: 10_000_000,     // daily withdrawal cap
    shopDiscount:  0.20,           // 20% off shop items
    description:   'The pinnacle. Reserved for the true degenerates.',
    roleEnvKey:    'RANK_ROLE_OBSIDIAN',
  },
  {
    id:            'diamond',
    name:          'Diamond',
    emoji:         '💎',
    color:         0x00BFFF,
    minWagered:    10_000_000,
    dailyBonus:    3000,
    xpMultiplier:  2.5,
    eventMultiplier: 2.5,
    withdrawLimit: 5_000_000,
    shopDiscount:  0.15,
    description:   'Elite tier. The house respects you.',
    roleEnvKey:    'RANK_ROLE_DIAMOND',
  },
  {
    id:            'platinum',
    name:          'Platinum',
    emoji:         '🪙',
    color:         0xE5E4E2,
    minWagered:    2_000_000,
    dailyBonus:    1500,
    xpMultiplier:  2.0,
    eventMultiplier: 2.25,
    withdrawLimit: 2_000_000,
    shopDiscount:  0.10,
    description:   'High roller status confirmed.',
    roleEnvKey:    'RANK_ROLE_PLATINUM',
  },
  {
    id:            'gold',
    name:          'Gold',
    emoji:         '🥇',
    color:         0xFFD700,
    minWagered:    500_000,
    dailyBonus:    750,
    xpMultiplier:  1.75,
    eventMultiplier: 2.0,
    withdrawLimit: 500_000,
    shopDiscount:  0.05,
    description:   'You\'re serious about this.',
    roleEnvKey:    'RANK_ROLE_GOLD',
  },
  {
    id:            'silver',
    name:          'Silver',
    emoji:         '🥈',
    color:         0xC0C0C0,
    minWagered:    100_000,
    dailyBonus:    300,
    xpMultiplier:  1.5,
    eventMultiplier: 2.0,
    withdrawLimit: 200_000,
    shopDiscount:  0,
    description:   'Getting warmed up.',
    roleEnvKey:    'RANK_ROLE_SILVER',
  },
  {
    id:            'bronze',
    name:          'Bronze',
    emoji:         '🥉',
    color:         0xCD7F32,
    minWagered:    0,              // everyone starts here
    dailyBonus:    0,
    xpMultiplier:  1.0,
    eventMultiplier: 2.0,
    withdrawLimit: 100_000,
    shopDiscount:  0,
    description:   'Just getting started.',
    roleEnvKey:    'RANK_ROLE_BRONZE',
  },
];

/** Get rank config from totalWagered amount */
function getRankFromWagered(totalWagered) {
  for (const rank of RANKS) {
    if (totalWagered >= rank.minWagered) return rank;
  }
  return RANKS[RANKS.length - 1]; // bronze fallback
}

/** Get rank config by id */
function getRankById(id) {
  return RANKS.find(r => r.id === id) || RANKS[RANKS.length - 1];
}

/** Get the next rank above current */
function getNextRank(currentRankId) {
  const idx = RANKS.findIndex(r => r.id === currentRankId);
  if (idx <= 0) return null; // already obsidian
  return RANKS[idx - 1];
}

/** Progress to next rank: returns { next, remaining, pct } */
function getRankProgress(totalWagered) {
  const current = getRankFromWagered(totalWagered);
  const next    = getNextRank(current.id);
  if (!next) return { current, next: null, remaining: 0, pct: 100 };

  const range     = next.minWagered - current.minWagered;
  const progress  = totalWagered - current.minWagered;
  const pct       = Math.min(100, Math.floor((progress / range) * 100));
  const remaining = next.minWagered - totalWagered;

  return { current, next, remaining, pct };
}

module.exports = { RANKS, getRankFromWagered, getRankById, getNextRank, getRankProgress };
