import React, { useEffect, useState } from 'react';

// Porte do capacete do modo solo: a base é repintada com 2-3 cores sorteadas pelo ID do piloto
const PALETTE = ['#e10600', '#ff7a00', '#ffd400', '#00d26a', '#00a19b', '#00c2ff', '#1e5bff', '#0b2a4a', '#5b2bff', '#b620e0', '#ff3ea5', '#ffffff', '#c0c6cc', '#7a0019', '#d4af37', '#2e7d32', '#111418', '#ff5a1f'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const lum = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const rgb = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function helmetColors(id: string) {
  let x = hash('capacete-' + id);
  const next = () => (x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0);
  const A = PALETTE[next() % PALETTE.length];
  let B = PALETTE[next() % PALETTE.length];
  let k = 0;
  while ((B === A || Math.abs(lum(A) - lum(B)) < 60) && k++ < 12) B = PALETTE[next() % PALETTE.length];
  let C: string | null = null;
  if (next() % 100 < 25) {
    C = PALETTE[next() % PALETTE.length];
    k = 0;
    while ((C === A || C === B) && k++ < 12) C = PALETTE[next() % PALETTE.length];
  }
  return { A, B, C };
}

let basePromise: Promise<ImageData> | null = null;
function loadBase() {
  return (basePromise ??= new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      ok(g.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = fail;
    img.src = '/helmets/base.webp';
  }));
}

function paint(base: ImageData, cf: { A: string; B: string; C: string | null }) {
  const W = base.width;
  const H = base.height;
  const out = new ImageData(new Uint8ClampedArray(base.data), W, H);
  const p = out.data;
  const A = rgb(cf.A);
  const B = rgb(cf.B);
  const C = cf.C ? rgb(cf.C) : null;
  for (let q = 0; q < p.length; q += 4) {
    if (p[q + 3] < 8) continue;
    const r = p[q] / 255, g = p[q + 1] / 255, b = p[q + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx;
    const s = mx > 0 ? (mx - mn) / mx : 0;
    const d = Math.max(mx - mn, 1e-6);
    let hu = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hu *= 60;
    let T: number[] | null = null;
    let k = 1;
    if (s > 0.3 && hu > 20 && hu < 65 && v > 0.25) {
      T = A;
      k = Math.min(1.25, v / 0.85);
    } else if (s < 0.18 && v > 0.62) {
      T = B;
      k = Math.min(1.1, v / 0.95);
    } else if (C && v < 0.5) {
      const xx = ((q / 4) % W) / W, yy = Math.floor(q / 4 / W) / H;
      const visor = xx > 0.4 && xx < 0.97 && yy > 0.3 && yy < 0.68 && (xx - 0.4) * 0.25 + 0.3 < yy + 0.05;
      if (!visor) {
        T = C;
        k = 0.16 + v * 1.15;
      }
    }
    if (T) {
      p[q] = Math.min(255, T[0] * k * 255);
      p[q + 1] = Math.min(255, T[1] * k * 255);
      p[q + 2] = Math.min(255, T[2] * k * 255);
    }
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c.toDataURL('image/webp', 0.88);
}

const cache = new Map<string, string>();

export default function Helmet({ id, size = 56, title }: { id: string; size?: number; title?: string }) {
  const cf = helmetColors(id);
  const key = cf.A + cf.B + (cf.C ?? '');
  const [src, setSrc] = useState(() => cache.get(key) ?? null);

  useEffect(() => {
    if (cache.has(key)) return setSrc(cache.get(key)!);
    let alive = true;
    loadBase()
      .then((base) => {
        const url = cache.get(key) ?? paint(base, cf);
        cache.set(key, url);
        if (alive) setSrc(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  if (!src) return <span style={{ display: 'inline-block', width: size, height: Math.round(size * 0.93) }} aria-hidden="true" />;
  return (
    <img className="helmet" src={src} width={size} height={Math.round(size * 0.93)} alt={title ?? ''} title={title} style={{ objectFit: 'contain' }} />
  );
}
