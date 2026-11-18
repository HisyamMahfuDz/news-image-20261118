// SPDX-License-Identifier: MIT
// news-image-20261118 — make.fun entry.
// Draws a one-page newspaper front page summing up the world news of
// Wednesday 18 November 2026, as a 1024x1024 PNG, with Node's standard
// library only. No network, no randomness, no clock: two runs write
// identical bytes. Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const W = 1024;
const H = 1024;

// ---- palette ----
const PAPER: RGB = [246, 241, 229];
const WHITE: RGB = [255, 253, 246];
const INK: RGB = [26, 26, 26];
const NAVY: RGB = [22, 35, 63];
const GOLD: RGB = [201, 162, 39];
const RED: RGB = [179, 38, 30];
const BLUE: RGB = [46, 95, 163];
const SEA: RGB = [46, 109, 164];
const SKY: RGB = [207, 227, 242];
const TEAL: RGB = [31, 122, 109];
const GREY: RGB = [120, 120, 116];
const SMOKE: RGB = [168, 168, 160];
const ORANGE: RGB = [214, 110, 44];
const GREEN: RGB = [46, 125, 50];

type RGB = [number, number, number];

// ---- framebuffer ----
const fb = new Uint8Array(W * H * 3);
function fillAll(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    fb[i * 3] = c[0];
    fb[i * 3 + 1] = c[1];
    fb[i * 3 + 2] = c[2];
  }
}
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
    }
  }
}
function frame(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
  for (let a = -t; a <= t; a++) {
    for (let b = -t; b <= t; b++) {
      line(x0 + a, y0 + b, x1 + a, y1 + b, c);
    }
  }
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let xx = cx - dx; xx <= cx + dx; xx++) px(xx, cy + dy, c);
  }
}
function ring(cx: number, cy: number, r: number, c: RGB, t: number): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      px(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.max(0, Math.min(x0, x1, x2));
  const maxX = Math.min(W - 1, Math.max(x0, x1, x2));
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(H - 1, Math.max(y0, y1, y2));
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) px(x, y, c);
    }
  }
}

// ---- PNG encoder (8-bit RGB, filter 0) ----
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font (rows are 5-bit values, MSB = leftmost pixel) ----
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ';': [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  '-': [0, 0, 0, 0x1f, 0, 0, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '%': [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  '*': [0, 0x04, 0x15, 0x0e, 0x15, 0x04, 0],
  '#': [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
  _: [0, 0, 0, 0, 0, 0, 0x1f],
  '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  '[': [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  ']': [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
};
function drawChar(x: number, y: number, ch: string, s: number, c: RGB): void {
  const g = FONT[ch];
  if (!g) return;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if ((g[r] >> (4 - col)) & 1) rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function textWidth(text: string, s: number): number {
  return text.length * 6 * s - s;
}
function drawText(x: number, y: number, text: string, s: number, c: RGB, align: 'left' | 'center' = 'left'): void {
  const t = text.toUpperCase();
  let sx = x;
  if (align === 'center') sx = x - Math.floor(textWidth(t, s) / 2);
  for (let i = 0; i < t.length; i++) drawChar(sx + i * 6 * s, y, t[i], s, c);
}
function wrapText(text: string, maxW: number, s: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, s) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(x: number, y: number, text: string, s: number, c: RGB, maxW: number, lh: number): number {
  const lines = wrapText(text, maxW, s);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, lines[i], s, c);
  return lines.length;
}

// ---- small pictograms, one per story panel (drawn in a w x 84 box) ----
function picGulf(x: number, y: number, w: number): void {
  rect(x, y, w, 84, SKY);
  rect(x, y + 56, w, 28, SEA);
  // radar dish on a base
  line(x + 30, y + 56, x + 30, y + 30, INK);
  tri(x + 18, y + 18, x + 42, y + 18, x + 30, y + 34, GREY);
  ring(x + 30, y + 22, 12, INK, 2);
  // two missiles with trails
  thickLine(x + 90, y + 70, x + 150, y + 26, INK, 1);
  tri(x + 150, y + 26, x + 138, y + 22, x + 140, y + 34, RED);
  thickLine(x + 120, y + 74, x + 190, y + 40, INK, 1);
  tri(x + 190, y + 40, x + 178, y + 36, x + 180, y + 48, RED);
  // explosion over the sea
  circle(x + 250, y + 46, 12, ORANGE);
  circle(x + 250, y + 46, 6, GOLD);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    line(
      x + 250 + Math.round(12 * Math.cos(rad)),
      y + 46 + Math.round(12 * Math.sin(rad)),
      x + 250 + Math.round(20 * Math.cos(rad)),
      y + 46 + Math.round(20 * Math.sin(rad)),
      ORANGE,
    );
  }
  line(x + 60, y + 66, x + 280, y + 66, WHITE);
}
function picManila(x: number, y: number, w: number): void {
  rect(x, y, w, 84, SKY);
  circle(x + 250, y + 20, 14, GOLD);
  // airplane: fuselage + wings + tail
  rect(x + 40, y + 38, 150, 10, NAVY);
  tri(x + 190, y + 38, x + 214, y + 43, x + 190, y + 48, NAVY);
  tri(x + 95, y + 38, x + 125, y + 14, x + 140, y + 38, NAVY);
  tri(x + 105, y + 48, x + 125, y + 68, x + 138, y + 48, NAVY);
  tri(x + 44, y + 38, x + 60, y + 24, x + 66, y + 38, NAVY);
  // runway + flags
  rect(x, y + 70, w, 4, GREY);
  line(x + 250, y + 70, x + 250, y + 44, INK);
  rect(x + 250, y + 44, 22, 14, RED);
  rect(x + 250, y + 44, 22, 5, WHITE);
  line(x + 282, y + 70, x + 282, y + 48, INK);
  rect(x + 282, y + 48, 16, 12, BLUE);
}
function picTrade(x: number, y: number, w: number): void {
  rect(x, y, w, 84, [232, 240, 228]);
  // two shaking hands, simplified as two crossing arrows over coins
  circle(x + 70, y + 42, 20, GOLD);
  drawText(x + 70, y + 32, '$', 3, NAVY, 'center');
  circle(x + 130, y + 42, 20, GOLD);
  drawText(x + 130, y + 32, '$', 3, NAVY, 'center');
  thickLine(x + 170, y + 62, x + 250, y + 22, TEAL, 2);
  tri(x + 250, y + 22, x + 232, y + 20, x + 240, y + 36, TEAL);
  thickLine(x + 170, y + 22, x + 250, y + 62, BLUE, 2);
  tri(x + 250, y + 62, x + 232, y + 64, x + 240, y + 48, BLUE);
  rect(x, y + 76, w, 4, GREY);
}
function picBritain(x: number, y: number, w: number): void {
  rect(x, y, w, 84, SKY);
  // Big Ben tower
  rect(x + 60, y + 16, 34, 68, [176, 148, 96]);
  tri(x + 56, y + 16, x + 98, y + 16, x + 77, y + 2, NAVY);
  circle(x + 77, y + 34, 12, WHITE);
  line(x + 77, y + 34, x + 77, y + 26, INK);
  line(x + 77, y + 34, x + 84, y + 34, INK);
  rect(x + 66, y + 52, 22, 32, NAVY);
  // sanction stamp: red ring + bar
  ring(x + 210, y + 42, 26, RED, 4);
  line(x + 188, y + 64, x + 232, y + 20, RED);
  line(x + 188, y + 64, x + 232, y + 20, RED);
  drawText(x + 210, y + 36, 'NO', 2, RED, 'center');
  rect(x, y + 80, w, 4, GREY);
}
function picCyclone(x: number, y: number, w: number): void {
  rect(x, y, w, 84, [214, 226, 232]);
  // spiral: offset rings
  ring(x + 130, y + 42, 34, SEA, 3);
  ring(x + 140, y + 42, 24, SEA, 3);
  ring(x + 148, y + 42, 15, SEA, 3);
  circle(x + 152, y + 42, 6, NAVY);
  // rain streaks
  for (let i = 0; i < 6; i++) {
    line(x + 210 + i * 14, y + 12, x + 204 + i * 14, y + 30, BLUE);
    line(x + 30 + i * 12, y + 58, x + 24 + i * 12, y + 74, BLUE);
  }
  // coastline
  tri(x, y + 84, x + 90, y + 84, x + 40, y + 66, GREEN);
}
function picSport(x: number, y: number, w: number): void {
  rect(x, y, w, 84, [222, 236, 214]);
  // stumps
  rect(x + 60, y + 30, 6, 40, GOLD);
  rect(x + 70, y + 30, 6, 40, GOLD);
  rect(x + 80, y + 30, 6, 40, GOLD);
  rect(x + 58, y + 24, 32, 5, GOLD);
  // bat leaning on the stumps
  thickLine(x + 150, y + 72, x + 190, y + 18, [210, 180, 120], 3);
  rect(x + 184, y + 8, 12, 14, [210, 180, 120]);
  // ball
  circle(x + 240, y + 56, 12, RED);
  line(x + 230, y + 52, x + 250, y + 60, WHITE);
  line(x + 230, y + 60, x + 250, y + 52, WHITE);
  rect(x, y + 76, w, 4, GREEN);
}

// ---- lead illustration: the Kerch bridge, hit for a second day ----
function drawLeadArt(x: number, y: number, w: number, h: number): void {
  const seaY = y + 140;
  rect(x, y, w, 140, SKY);
  circle(x + w - 70, y + 36, 26, GOLD);
  circle(x + 90, y + 34, 16, WHITE);
  circle(x + 118, y + 30, 20, WHITE);
  circle(x + 260, y + 22, 14, WHITE);
  rect(x, seaY, w, h - 140, SEA);
  // waves
  for (let i = 0; i < 8; i++) {
    line(x + 20 + i * 70, seaY + 30 + (i % 3) * 34, x + 60 + i * 70, seaY + 30 + (i % 3) * 34, WHITE);
  }
  // bridge towers and cables
  rect(x + 120, y + 50, 14, 92, NAVY);
  rect(x + 430, y + 50, 14, 92, NAVY);
  line(x + 127, y + 50, x + 16, y + 130, NAVY);
  line(x + 127, y + 50, x + 280, y + 130, NAVY);
  line(x + 437, y + 50, x + 380, y + 130, NAVY);
  line(x + 437, y + 50, x + 584, y + 130, NAVY);
  // deck: two standing spans, middle span fallen
  rect(x, y + 128, 268, 12, NAVY);
  rect(x + 380, y + 128, 204, 12, NAVY);
  // fallen span, tilted into the strait
  tri(x + 272, y + 130, x + 376, y + 128, x + 360, y + 168, GREY);
  tri(x + 272, y + 130, x + 360, y + 168, x + 288, y + 172, GREY);
  // fallen arch in the water: only its top half shows above the strait
  ring(x + 324, y + 176, 34, NAVY, 4);
  rect(x + 290, y + 176, 68, 34, SEA);
  // splash where the fallen span meets the water
  circle(x + 280, y + 168, 7, WHITE);
  circle(x + 368, y + 170, 7, WHITE);
  // smoke over the gap
  circle(x + 306, y + 96, 16, SMOKE);
  circle(x + 330, y + 80, 20, SMOKE);
  circle(x + 352, y + 98, 14, SMOKE);
  // drones
  circle(x + 200, y + 40, 3, INK);
  circle(x + 480, y + 30, 3, INK);
  circle(x + 540, y + 60, 3, INK);
  line(x + 200, y + 40, x + 230, y + 52, INK);
  line(x + 480, y + 30, x + 452, y + 44, INK);
}

// ---- one story panel ----
function panel(
  x: number,
  y: number,
  w: number,
  h: number,
  tag: string,
  tagColor: RGB,
  headline: string[],
  body: string,
  pic: (x: number, y: number, w: number) => void,
): void {
  rect(x, y, w, h, WHITE);
  frame(x, y, w, h, NAVY, 3);
  rect(x + 3, y + 3, w - 6, 34, tagColor);
  drawText(x + w / 2, y + 12, tag, 2, WHITE, 'center');
  pic(x + 12, y + 44, w - 24);
  const cx = x + w / 2;
  for (let i = 0; i < headline.length; i++) {
    drawText(cx, y + 136 + i * 24, headline[i], 3, NAVY, 'center');
  }
  drawPara(x + 12, y + 186, body, 2, INK, w - 24, 13);
}

// ---- the page ----
function drawPage(): void {
  fillAll(PAPER);
  frame(0, 0, W, H, NAVY, 8);

  // masthead
  rect(8, 8, 1008, 116, NAVY);
  rect(8, 124, 1008, 4, GOLD);
  drawText(512, 30, 'THE WORLD IN ONE DAY', 6, WHITE, 'center');
  drawText(512, 86, 'WEDNESDAY - 18 NOVEMBER 2026', 3, GOLD, 'center');

  // lead story: Crimea bridge
  drawLeadArt(16, 144, 584, 268);
  frame(16, 144, 584, 268, NAVY, 3);
  drawText(308, 420, 'THE KERCH BRIDGE - HIT FOR A SECOND DAY', 2, NAVY, 'center');
  drawText(624, 146, 'UKRAINE - LEAD STORY', 2, RED);
  rect(624, 168, 120, 4, RED);
  drawText(624, 182, 'CRIMEA', 5, NAVY);
  drawText(624, 224, 'BRIDGE HIT', 5, NAVY);
  drawText(624, 266, 'ARCH FALLS', 5, NAVY);
  drawPara(
    624,
    312,
    "Ukraine strikes the Kerch bridge for a second day and its road arch falls into the strait. Russia answers by hitting Kyiv's bridges. Kyiv says 1,441 drones flew - the largest attack of the war.",
    2,
    INK,
    384,
    16,
  );

  rect(16, 456, 992, 4, NAVY);

  // row 2
  panel(16, 464, 320, 248, 'THE GULF', RED, ['GULF FIRE', 'EXCHANGED'],
    'Iran drones hit a US radar in Bahrain. US jets hit an IRGC site on Qeshm Island.', picGulf);
  panel(352, 464, 320, 248, 'ASIA', BLUE, ['TRUMP LANDS', 'IN MANILA'],
    'Trump lands in Manila for Quad talks ahead of a China visit. Modi ends his ASEAN trip.', picManila);
  panel(688, 464, 320, 248, 'TRADE', TEAL, ['CANADA-CHINA', 'TRADE DEAL'],
    'Canada and China extend trade deals as Xi meets Carney ahead of the APEC summit.', picTrade);

  // row 3
  panel(16, 720, 320, 248, 'BRITAIN', NAVY, ['UK SANCTIONS', 'SETTLERS'],
    'Britain sanctions Israeli settlement firms to protect the two-state solution.', picBritain);
  panel(352, 720, 320, 248, 'WEATHER', SEA, ['CYCLONE AKVAN', 'STRENGTHENS'],
    'Cyclone Akvan builds over the Bay of Bengal and is set to grow into a severe storm.', picCyclone);
  panel(688, 720, 320, 248, 'SPORT', GREEN, ['DHONI CALLS', 'TIME ON IPL'],
    'MS Dhoni retires from the IPL and becomes mentor of the Chennai Super Kings.', picSport);

  // footer
  rect(8, 976, 1008, 40, NAVY);
  drawText(512, 989, 'WEDNESDAY 18 NOVEMBER 2026 - SIX STORIES THAT DEFINED THE DAY', 2, WHITE, 'center');
}

function main(): void {
  drawPage();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();
