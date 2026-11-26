function formatBalance(amount) {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000)     return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000)         return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatCurrency(amount) {
  return `🪙 **${formatBalance(amount)}**`;
}

function formatPercent(wins, total) {
  if (!total) return '0%';
  return `${((wins / total) * 100).toFixed(1)}%`;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function levelFromXP(xp) {
  let level = 1;
  let totalXP = 0;
  while (totalXP + xpForLevel(level) <= xp) {
    totalXP += xpForLevel(level);
    level++;
  }
  return { level, currentXP: xp - totalXP, neededXP: xpForLevel(level) };
}

function progressBar(current, total, length = 10) {
  const filled = Math.round((current / total) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = { formatBalance, formatCurrency, formatPercent, formatDuration, xpForLevel, levelFromXP, progressBar };
