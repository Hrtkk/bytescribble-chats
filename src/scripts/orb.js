/**
 * The voice orb: a canvas blob that breathes when idle, swells with your
 * voice when listening, spins while thinking, and ripples while speaking.
 * Pure canvas — no libraries, no images.
 */

const PALETTE = {
  idle: ['#3A4152', '#4A5468'],
  listening: ['#FFB347', '#FF8A3D'],
  thinking: ['#A78BFA', '#7C6BF5'],
  speaking: ['#5EE6C0', '#37C9A6']
};

export class Orb {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.level = 0;
    this.smooth = 0;
    this.t = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  resize() {
    const rect = this.c.getBoundingClientRect();
    this.w = rect.width || 320;
    this.h = rect.height || 320;
    this.c.width = this.w * this.dpr;
    this.c.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  set(state) {
    this.state = state;
  }

  setLevel(v) {
    this.level = v;
  }

  loop = () => {
    const { ctx, w, h } = this;
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) * 0.27;
    this.t += 0.016;

    const target = this.state === 'listening' ? this.level : 0;
    this.smooth += (target - this.smooth) * 0.18;

    ctx.clearRect(0, 0, w, h);

    const [c1, c2] = PALETTE[this.state] || PALETTE.idle;
    const breathe = Math.sin(this.t * 1.5) * 0.02;
    const spin = this.state === 'thinking' ? this.t * 2.2 : this.t * 0.35;
    const r = base * (1 + breathe + this.smooth * 0.42);

    // Outer halo
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.5);
    halo.addColorStop(0, `${c1}44`);
    halo.addColorStop(1, `${c1}00`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Ripple rings while speaking
    if (this.state === 'speaking') {
      for (let i = 0; i < 3; i++) {
        const phase = (this.t * 0.7 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.05 + phase * 1.15), 0, Math.PI * 2);
        ctx.strokeStyle = `${c1}${Math.round((1 - phase) * 90)
          .toString(16)
          .padStart(2, '0')}`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // The blob: a circle with low-frequency wobble, louder voice = more wobble
    const wobble = 0.05 + this.smooth * 0.3 + (this.state === 'thinking' ? 0.06 : 0);
    ctx.beginPath();
    const STEPS = 128;
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const n =
        Math.sin(a * 3 + spin) * 0.6 +
        Math.sin(a * 5 - spin * 1.4) * 0.3 +
        Math.sin(a * 2 + spin * 0.7) * 0.4;
      const rr = r * (1 + n * wobble);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const fill = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    fill.addColorStop(0, c1);
    fill.addColorStop(1, c2);
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Inner highlight gives the blob some depth
    const gloss = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 1, cx, cy, r);
    gloss.addColorStop(0, 'rgba(255,255,255,.28)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fill();

    // Level bars around the rim while listening
    if (this.state === 'listening') {
      const bars = 44;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const jitter = Math.abs(Math.sin(this.t * 6 + i * 0.9));
        const len = 4 + this.smooth * 40 * (0.5 + jitter * 0.7);
        const x1 = cx + Math.cos(a) * (r * 1.24);
        const y1 = cy + Math.sin(a) * (r * 1.24);
        const x2 = cx + Math.cos(a) * (r * 1.24 + len);
        const y2 = cy + Math.sin(a) * (r * 1.24 + len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(255,179,71,${0.25 + this.smooth * 0.6})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    requestAnimationFrame(this.loop);
  };
}
