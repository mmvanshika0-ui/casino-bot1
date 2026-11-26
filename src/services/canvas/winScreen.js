/**
 * Win Screen Canvas Generator
 * Generates a 700×280px win announcement graphic.
 * Used when: multiplier ≥ 10×, jackpot hit, big payout.
 *
 * Style: dark background, gold/purple neon text, pulsing multiplier.
 * Requires: canvas
 */

const { createCanvas, loadImage } = require('canvas');
const { formatBalance } = require('../../utils/format');

const W = 700, H = 280;

const WIN_TIERS = [
  { min: 100,  label: '🌟 LEGENDARY WIN',  bg: ['#1A0A00', '#3D1A00'], accent: '#FF6600', text: '#FFD700' },
  { min: 50,   label: '💎 EPIC WIN',        bg: ['#0A001A', '#1E0040'], accent: '#CC00FF', text: '#E040FF' },
  { min: 20,   label: '🔥 GREAT WIN',       bg: ['#001A0A', '#003D1A'], accent: '#00FF88', text: '#00FF88' },
  { min: 10,   label: '✨ BIG WIN',         bg: ['#0A0A1A', '#1A1A3D'], accent: '#7289DA', text: '#B0C4FF' },
  { min: 0,    label: '🏆 WIN',             bg: ['#0D0D0D', '#1A1A2E'], accent: '#FFD700', text: '#FFFFFF' },
];

function getTier(multiplier) {
  return WIN_TIERS.find(t => multiplier >= t.min) || WIN_TIERS[WIN_TIERS.length - 1];
}

/**
 * Generate a win screen PNG buffer.
 * @param {object} winData — { username, game, bet, payout, multiplier }
 */
async function generateWinScreen(winData) {
  const { username, game, bet, payout, multiplier } = winData;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const tier   = getTier(multiplier);

  // ── Background gradient ────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, tier.bg[0]);
  bg.addColorStop(1, tier.bg[1]);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.fill();

  // ── Particle streaks (decorative lines) ────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 20; i++) {
    const x = (i / 20) * W;
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth   = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 60, H);
    ctx.stroke();
  }
  ctx.restore();

  // ── Glow circle behind multiplier ─────────────────────────────
  const glowX = W / 2, glowY = H * 0.52;
  const glow  = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, 180);
  glow.addColorStop(0, tier.accent + '55');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Border ─────────────────────────────────────────────────────
  ctx.strokeStyle = tier.accent;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.roundRect(1, 1, W - 2, H - 2, 15);
  ctx.stroke();

  // ── Win tier label ─────────────────────────────────────────────
  ctx.fillStyle = tier.accent;
  ctx.font      = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '4px';
  ctx.fillText(tier.label.toUpperCase(), W / 2, 36);
  ctx.letterSpacing = '0px';

  // ── Multiplier (huge center text) ──────────────────────────────
  ctx.save();
  ctx.font      = `bold 96px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shadow / glow effect via multiple strokes
  ctx.shadowColor   = tier.accent;
  ctx.shadowBlur    = 30;
  ctx.fillStyle     = tier.text;
  ctx.fillText(`${multiplier}×`, W / 2, H * 0.52);
  ctx.shadowBlur    = 0;
  ctx.restore();

  // ── Game name & username ───────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font      = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${username} · ${game.toUpperCase()}`, W / 2, H - 54);

  // ── Bet → Payout ───────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font      = 'bold 18px sans-serif';
  ctx.fillText(
    `🪙 ${formatBalance(bet)}  →  🪙 ${formatBalance(payout)}`,
    W / 2, H - 28
  );

  // ── Corner watermark ───────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font      = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('🎰 Casino Bot', W - 14, H - 10);

  return canvas.toBuffer('image/png');
}

module.exports = { generateWinScreen };
