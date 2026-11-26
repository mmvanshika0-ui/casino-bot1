/**
 * Canvas Profile Card Generator — v2 with Rank System
 * 900×340px. Shows rank tier, rank color theme, rank progress bar.
 * Requires: canvas (npm install canvas)
 */

const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const http  = require('http');
const { formatBalance, levelFromXP } = require('../../utils/format');
const { getRankProgress }            = require('../rank/rankConfig');

const CARD_W = 900;
const CARD_H = 340;

function fetchImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function hexToRgb(hex) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8)  & 0xff;
  const b =  hex        & 0xff;
  return `${r}, ${g}, ${b}`;
}

async function generateProfileCard(user, discordUser, equipped = {}) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx    = canvas.getContext('2d');

  const { current: rank, next: nextRank, pct: rankPct } = getRankProgress(user.totalWagered || 0);
  const rankRgb = hexToRgb(rank.color);

  const effectBorder = equipped.effect === 'gold' ? '#FFD700'
    : equipped.effect === 'neon'                  ? '#9B59B6'
    : `rgb(${rankRgb})`;

  const effectGlow = equipped.effect === 'gold' ? 'rgba(255,210,0,0.20)'
    : equipped.effect === 'neon'                 ? 'rgba(142,68,173,0.25)'
    : `rgba(${rankRgb}, 0.18)`;

  const { level, currentXP, neededXP } = levelFromXP(user.xp || 0);
  const xpPct = neededXP > 0 ? Math.min(1, currentXP / neededXP) : 0;
  const wr    = user.gamesPlayed > 0
    ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1)
    : '0.0';

  // Background
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0A0A18');
  bg.addColorStop(1, '#12122A');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 20);
  ctx.fill();

  // Glow
  const glow = ctx.createRadialGradient(180, CARD_H / 2, 0, 180, CARD_H / 2, 320);
  glow.addColorStop(0, effectGlow);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, 20);
  ctx.fill();

  // Border
  ctx.strokeStyle = effectBorder;
  ctx.lineWidth   = 2.5;
  roundRect(ctx, 1.5, 1.5, CARD_W - 3, CARD_H - 3, 19);
  ctx.stroke();

  // Rank accent strip
  const stripGrad = ctx.createLinearGradient(0, 0, 8, 0);
  stripGrad.addColorStop(0, effectBorder);
  stripGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = stripGrad;
  roundRect(ctx, 0, 0, 8, CARD_H, 20);
  ctx.fill();

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(300, 20);
  ctx.lineTo(300, CARD_H - 20);
  ctx.stroke();

  // Avatar
  const ax = 70, ay = CARD_H / 2 - 10, ar = 88;
  const avatarUrl = discordUser.displayAvatarURL({ format: 'png', size: 256 });

  try {
    const avatarBuffer = await fetchImage(avatarUrl);
    const avatarImg    = await loadImage(avatarBuffer);

    const ringGrad = ctx.createRadialGradient(ax, ay, ar - 2, ax, ay, ar + 14);
    ringGrad.addColorStop(0, effectBorder);
    ringGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, ax - ar, ay - ar, ar * 2, ar * 2);
    ctx.restore();

    ctx.strokeStyle = effectBorder;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.stroke();
  } catch (_) {
    ctx.fillStyle = effectBorder;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rank badge below avatar
  const badgeW = 130, badgeH = 26;
  const badgeX = ax - badgeW / 2, badgeY = ay + ar + 8;
  ctx.fillStyle = effectBorder;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fill();
  ctx.fillStyle   = '#FFFFFF';
  ctx.font        = 'bold 13px sans-serif';
  ctx.textAlign   = 'center';
  ctx.fillText(`${rank.emoji} ${rank.name.toUpperCase()}`, ax, badgeY + 17);

  // Level badge
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, ax - ar, ay - ar - 2, 48, 22, 6);
  ctx.fill();
  ctx.fillStyle = effectBorder;
  ctx.font      = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`LVL ${level}`, ax - ar + 24, ay - ar + 13);

  // Username + shop title
  const textX = 320;
  if (equipped.title) {
    ctx.fillStyle = effectBorder;
    ctx.font      = 'italic 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(equipped.title, textX, 38);
  }

  const shopBadge = equipped.badge ? ` ${equipped.badge}` : '';
  ctx.fillStyle = '#FFFFFF';
  ctx.font      = `bold ${discordUser.username.length > 16 ? '24' : '30'}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(`${discordUser.username}${shopBadge}`, textX, equipped.title ? 68 : 56);

  // Separator
  const sepGrad = ctx.createLinearGradient(textX, 0, CARD_W - 30, 0);
  sepGrad.addColorStop(0, effectBorder);
  sepGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = sepGrad;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(textX, 84);
  ctx.lineTo(CARD_W - 30, 84);
  ctx.stroke();

  // Stats grid
  const stats = [
    { label: '💰 Balance',    value: `🪙 ${formatBalance(user.balance)}` },
    { label: '🏦 Vault',      value: `🪙 ${formatBalance(user.vaultBalance)}` },
    { label: '🎮 Games',      value: user.gamesPlayed.toLocaleString() },
    { label: '🏆 Win Rate',   value: `${wr}%` },
    { label: '💸 Wagered',    value: `🪙 ${formatBalance(user.totalWagered)}` },
    { label: '✨ XP Multi',   value: `${rank.xpMultiplier}x` },
  ];

  const colW   = (CARD_W - textX - 30) / 2;
  const startY = 100;
  const rowH   = 46;

  stats.forEach((stat, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const sx  = textX + col * colW;
    const sy  = startY + row * rowH;

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, sx, sy, colW - 8, 38, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.font      = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(stat.label, sx + 10, sy + 14);

    ctx.fillStyle = '#FFFFFF';
    ctx.font      = 'bold 14px sans-serif';
    ctx.fillText(stat.value, sx + 10, sy + 30);
  });

  // Rank progress bar
  const rBarY = startY + 3 * rowH + 8;
  const rBarW = CARD_W - textX - 30;
  const rBarH = 12;

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, textX, rBarY, rBarW, rBarH, 6);
  ctx.fill();

  if (rankPct > 0) {
    const fillGrad = ctx.createLinearGradient(textX, 0, textX + rBarW, 0);
    fillGrad.addColorStop(0, effectBorder);
    fillGrad.addColorStop(1, 'rgba(255,255,255,0.7)');
    ctx.fillStyle = fillGrad;
    roundRect(ctx, textX, rBarY, Math.max(12, rBarW * (rankPct / 100)), rBarH, 6);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.font      = '11px sans-serif';
  ctx.textAlign = 'left';
  const rankLabel = nextRank
    ? `${rank.emoji} ${rank.name} → ${nextRank.emoji} ${nextRank.name} (${rankPct}%)`
    : `${rank.emoji} ${rank.name} — MAX RANK 👑`;
  ctx.fillText(rankLabel, textX, rBarY + rBarH + 14);

  // XP bar
  const xBarY = rBarY + rBarH + 28;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, textX, xBarY, rBarW, 10, 5);
  ctx.fill();

  if (xpPct > 0) {
    const xpGrad = ctx.createLinearGradient(textX, 0, textX + rBarW, 0);
    xpGrad.addColorStop(0, '#7289DA');
    xpGrad.addColorStop(1, '#B0C4FF');
    ctx.fillStyle = xpGrad;
    roundRect(ctx, textX, xBarY, Math.max(10, rBarW * xpPct), 10, 5);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.font      = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`XP ${currentXP.toLocaleString()} / ${neededXP.toLocaleString()}`, textX, xBarY + 22);

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font      = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('🎰 Casino Bot • Profile', CARD_W - 16, CARD_H - 10);

  return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard };
