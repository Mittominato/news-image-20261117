// news-image-20261117 — draws one infographic PNG summing up Tuesday 17 November 2026.
// Pure TypeScript, Node stdlib only. No network, no clock, no randomness: two runs
// produce byte-identical output. Run: MAKEFUN_OUTPUT_DIR=out node main.ts
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
const INK = 0x14243c; // deep navy text
const PAPER = 0xf7f2e7; // warm paper panels
const NAVY = 0x0f2038; // header / footer
const NAVY2 = 0x16324f; // header band
const GOLD = 0xe8b84b;
const MIST = 0xb9c8dc; // pale blue-grey text on navy
const WHITE = 0xffffff;
const LINE = 0xd8d0bd; // hairline on paper
const BOX = 0xe9e2cf; // icon box fill

const ACCENTS = [0xc0392b, 0xd35400, 0x1f6f8b, 0x7d3c98, 0x1e8449, 0x2e4053];

// ---------------------------------------------------------------------------
// Tiny raster canvas (RGB, row-major)
// ---------------------------------------------------------------------------
class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  constructor(w: number, h: number, fill: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    this.fill(fill);
  }
  fill(c: number): void {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    for (let i = 0; i < this.px.length; i += 3) {
      this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b;
    }
  }
  dot(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = (c >> 16) & 255;
    this.px[i + 1] = (c >> 8) & 255;
    this.px[i + 2] = c & 255;
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.dot(xx, yy, c);
    }
  }
  frame(x: number, y: number, w: number, h: number, c: number, t = 2): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  hline(x: number, y: number, len: number, c: number, t = 1): void {
    this.rect(x, y, len, t, c);
  }
  vline(x: number, y: number, len: number, c: number, t = 1): void {
    this.rect(x, y, t, len, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (let guard = 0; guard < 4096; guard++) {
      this.rect(x - ((t - 1) >> 1), y - ((t - 1) >> 1), t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  disc(cx: number, cy: number, r: number, c: number): void {
    for (let y = -r; y <= r; y++) {
      const span = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -span; x <= span; x++) this.dot(cx + x, cy + y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: number, t = 2): void {
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(rad) * r);
      const y = Math.round(cy + Math.sin(rad) * r);
      this.rect(x, y, t, t, c);
    }
  }
  // Filled triangle by scanline interpolation.
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number): void {
    const minY = Math.max(0, Math.min(y0, y1, y2));
    const maxY = Math.min(this.h - 1, Math.max(y0, y1, y2));
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: Array<[number, number, number, number]> = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.max(0, Math.floor(Math.min(...xs)));
        const hi = Math.min(this.w - 1, Math.ceil(Math.max(...xs)));
        for (let x = lo; x <= hi; x++) this.dot(x, y, c);
      }
    }
  }
  arrow(x0: number, y0: number, x1: number, y1: number, c: number, t = 4): void {
    this.line(x0, y0, x1, y1, c, t);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const hs = 14;
    const hx = x1 - Math.cos(ang) * hs;
    const hy = y1 - Math.sin(ang) * hs;
    const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
    this.tri(x1, y1, Math.round(hx + px * 7), Math.round(hy + py * 7), Math.round(hx - px * 7), Math.round(hy - py * 7), c);
  }
}

// ---------------------------------------------------------------------------
// PNG writer: filter-0 scanlines, zlib deflate, CRC32
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    table[n] = v >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(cv: Canvas): Buffer {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    const rowStart = y * (cv.w * 3 + 1);
    raw[rowStart] = 0; // filter none
    Buffer.from(cv.px.buffer, y * cv.w * 3, cv.w * 3).copy(raw, rowStart + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is 7 rows of 5 cells ("#" = on, "." = off).
// Authored here for this image; only the characters the copy uses are needed.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string[]> = {
  A: ["..#..", ".#.#.", "#...#", "#...#", "#####", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#..##", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
  ",": [".....", ".....", ".....", ".....", ".#...", ".#...", "..#.."],
  "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ":": [".....", "..#..", ".....", ".....", "..#..", ".....", "....."],
  ";": [".....", "..#..", ".....", ".....", "..#..", ".#...", "..#.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "+": [".....", "..#..", "..#..", ".###.", "..#..", "..#..", "....."],
  "=": [".....", ".....", ".###.", ".....", ".###.", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
  $: ["..#..", ".####", "#.#.#", ".###.", "..#.#", "####.", "..#.."],
};

const BLANK = [".....", ".....", ".....", ".....", ".....", ".....", "....."];

function drawChar(cv: Canvas, ch: string, x: number, y: number, s: number, c: number): void {
  const g = GLYPHS[ch] ?? BLANK;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "#") cv.rect(x + col * s, y + r * s, s, s, c);
    }
  }
}

// Width of one character cell at scale s (5 glyph cells + 1 tracking cell).
function cellW(s: number): number {
  return 6 * s;
}

function textW(text: string, s: number): number {
  return Math.max(0, text.length * cellW(s) - s);
}

function drawText(cv: Canvas, text: string, x: number, y: number, s: number, c: number): void {
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    drawChar(cv, upper[i], x + i * cellW(s), y, s, c);
  }
}

function drawCentred(cv: Canvas, text: string, cx: number, y: number, s: number, c: number): void {
  drawText(cv, text, cx - Math.floor(textW(text, s) / 2), y, s, c);
}

// Greedy word wrap into lines of at most maxChars characters.
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function drawPara(cv: Canvas, text: string, x: number, y: number, maxChars: number, s: number, c: number, lh: number): number {
  const lines = wrap(text, maxChars);
  lines.forEach((ln, i) => drawText(cv, ln, x, y + i * lh, s, c));
  return y + lines.length * lh;
}

// ---------------------------------------------------------------------------
// The day's stories. Every fact below was first reported on Tuesday
// 17 November 2026 (AP, BBC, CNN, Reuters and wire coverage checked the
// same day). Nothing here is speculation and nothing is from an earlier day.
// ---------------------------------------------------------------------------
interface Story {
  kicker: string;
  headline: string;
  body: string;
  accent: number;
  icon: number; // 0..5, picks the scene drawn in the icon box
}

const STORIES: Story[] = [
  {
    kicker: "MIDDLE EAST - US-IRAN",
    headline: "US JETS HIT IRGC MISSILE SITE",
    body: "Washington says the strike on Qeshm Island answered Iranian drone attacks on a US base in Bahrain.",
    accent: ACCENTS[0],
    icon: 0,
  },
  {
    kicker: "UKRAINE WAR",
    headline: "KERCH BRIDGE SPAN DESTROYED",
    body: "Kyiv says its strike knocked out a road span of the bridge to Crimea; Russia hit bridges in Kyiv.",
    accent: ACCENTS[1],
    icon: 1,
  },
  {
    kicker: "FRANCE",
    headline: "NATIONWIDE STRIKE OVER LIVING COSTS",
    body: "Unions bring France to a halt; 146,000 people march, 28,000 of them in Paris.",
    accent: ACCENTS[2],
    icon: 2,
  },
  {
    kicker: "UNITED STATES - HEALTH",
    headline: "US LOSES MEASLES-FREE STATUS",
    body: "Elimination status ends after 26 years, with 5,400 cases and 10 deaths reported.",
    accent: ACCENTS[3],
    icon: 3,
  },
  {
    kicker: "MONGOLIA",
    headline: "PRESIDENT RESIGNS IN SCANDAL",
    body: "President Khurelsukh quits amid a corruption scandal shaking the government.",
    accent: ACCENTS[4],
    icon: 4,
  },
  {
    kicker: "TRADE - AHEAD OF APEC",
    headline: "CHINA AND CANADA EASE TARIFFS",
    body: "Beijing and Ottawa widen tariff relief after Xi and Carney meet in China.",
    accent: ACCENTS[5],
    icon: 5,
  },
];

const ALSO_LINE =
  "ALSO: Japan scrambles jets as Russian planes enter its airspace. A Russian military plane crash kills 19 in Kemerovo.";

// ---------------------------------------------------------------------------
// Icon scenes. Each draws inside a 120 x 104 box at (bx, by).
// ---------------------------------------------------------------------------
function burst(cv: Canvas, cx: number, cy: number, r: number, c: number): void {
  for (let a = 0; a < 360; a += 30) {
    const rad = (a * Math.PI) / 180;
    cv.line(cx, cy, Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r), c, 3);
  }
  cv.disc(cx, cy, 6, c);
}

function drawIcon(cv: Canvas, kind: number, bx: number, by: number): void {
  const cx = bx + 60;
  if (kind === 0) {
    // Missile climbing past a burst, over sea waves.
    cv.line(bx + 30, by + 78, bx + 62, by + 30, 0x333333, 5);
    cv.tri(bx + 62, by + 30, bx + 52, by + 44, bx + 70, by + 42, 0xc0392b);
    cv.line(bx + 30, by + 78, bx + 22, by + 88, 0xd35400, 4);
    cv.line(bx + 30, by + 78, bx + 38, by + 90, 0xd35400, 4);
    burst(cv, bx + 92, by + 26, 20, 0xe8b84b);
    cv.disc(bx + 92, by + 26, 5, 0xc0392b);
    cv.hline(bx + 10, by + 94, 100, 0x1f6f8b, 3);
    cv.hline(bx + 22, by + 100, 76, 0x1f6f8b, 3);
  } else if (kind === 1) {
    // Bridge with a broken middle span and smoke over the gap.
    cv.rect(bx + 12, by + 30, 8, 44, 0x2e4053);
    cv.rect(bx + 100, by + 30, 8, 44, 0x2e4053);
    cv.hline(bx + 8, by + 72, 44, 0x2e4053, 6);
    cv.hline(bx + 68, by + 72, 44, 0x2e4053, 6);
    cv.line(bx + 16, by + 30, bx + 52, by + 72, 0x2e4053, 3);
    cv.line(bx + 104, by + 30, bx + 68, by + 72, 0x2e4053, 3);
    cv.disc(bx + 60, by + 38, 7, 0x95a5a6);
    cv.disc(bx + 52, by + 30, 5, 0x95a5a6);
    cv.disc(bx + 70, by + 30, 5, 0xbdc3c7);
    cv.tri(bx + 52, by + 72, bx + 60, by + 60, bx + 68, by + 72, 0xc0392b);
    cv.hline(bx + 10, by + 92, 100, 0x1f6f8b, 3);
  } else if (kind === 2) {
    // Crowd with a placard.
    cv.disc(bx + 34, by + 40, 11, 0x1f6f8b);
    cv.disc(bx + 60, by + 34, 11, 0x7d3c98);
    cv.disc(bx + 86, by + 40, 11, 0xc0392b);
    cv.rect(bx + 23, by + 53, 22, 40, 0x1f6f8b);
    cv.rect(bx + 49, by + 47, 22, 46, 0x7d3c98);
    cv.rect(bx + 75, by + 53, 22, 40, 0xc0392b);
    cv.rect(bx + 44, by + 8, 34, 20, 0xe8b84b);
    cv.frame(bx + 44, by + 8, 34, 20, 0x14243c, 2);
    cv.vline(bx + 60, by + 28, 20, 0x14243c, 3);
  } else if (kind === 3) {
    // Spiky virus ball with a small cross badge.
    for (let a = 0; a < 360; a += 45) {
      const rad = (a * Math.PI) / 180;
      const x1 = Math.round(cx + Math.cos(rad) * 24);
      const y1 = Math.round(by + 52 + Math.sin(rad) * 24);
      const x2 = Math.round(cx + Math.cos(rad) * 36);
      const y2 = Math.round(by + 52 + Math.sin(rad) * 36);
      cv.line(x1, y1, x2, y2, 0x7d3c98, 4);
      cv.disc(x2, y2, 4, 0x7d3c98);
    }
    cv.disc(cx, by + 52, 24, 0x7d3c98);
    cv.disc(cx - 7, by + 45, 5, 0xffffff);
    cv.disc(cx + 8, by + 58, 4, 0xffffff);
    cv.disc(bx + 96, by + 18, 13, 0xc0392b);
    cv.hline(bx + 89, by + 17, 14, WHITE, 4);
    cv.vline(bx + 95, by + 11, 14, WHITE, 4);
  } else if (kind === 4) {
    // Parliament building with a falling arrow.
    cv.rect(bx + 26, by + 40, 68, 8, 0x1e8449);
    cv.tri(bx + 26, by + 40, bx + 94, by + 40, bx + 60, by + 24, 0x1e8449);
    for (let i = 0; i < 4; i++) cv.rect(bx + 32 + i * 16, by + 48, 7, 34, 0x1e8449);
    cv.rect(bx + 22, by + 82, 76, 6, 0x1e8449);
    cv.arrow(bx + 96, by + 12, bx + 108, by + 38, 0xc0392b, 5);
  } else {
    // Globe with two crossing trade arrows.
    cv.ring(cx, by + 52, 30, 0x2e4053, 3);
    cv.hline(cx - 30, by + 52, 60, 0x2e4053, 2);
    cv.vline(cx, by + 22, 60, 0x2e4053, 2);
    cv.line(cx - 22, by + 32, cx + 22, by + 72, 0x2e4053, 2);
    cv.arrow(bx + 14, by + 88, bx + 46, by + 62, 0x1e8449, 4);
    cv.arrow(bx + 106, by + 88, bx + 74, by + 62, 0xd35400, 4);
  }
}

// ---------------------------------------------------------------------------
// Composition: header, six panels, footer.
// ---------------------------------------------------------------------------
function drawHeader(cv: Canvas): void {
  cv.rect(0, 0, W, 150, NAVY);
  cv.rect(0, 150, W, 4, GOLD);
  drawCentred(cv, "THE WORLD IN ONE IMAGE", W / 2, 20, 2, GOLD);
  drawCentred(cv, "TUESDAY 17 NOVEMBER 2026", W / 2, 50, 5, WHITE);
  cv.hline(412, 108, 200, GOLD, 3);
  drawCentred(cv, "SIX STORIES THAT DEFINED THE DAY", W / 2, 120, 2, MIST);
}

function drawPanel(cv: Canvas, s: Story, x: number, y: number): void {
  const w = 480;
  const h = 252;
  cv.rect(x, y, w, h, PAPER);
  cv.rect(x, y, w, 10, s.accent);
  cv.frame(x, y, w, h, LINE, 2);
  drawText(cv, s.kicker, x + 18, y + 24, 2, s.accent);
  const headLines = wrap(s.headline, 24);
  headLines.slice(0, 2).forEach((ln, i) => drawText(cv, ln, x + 18, y + 50 + i * 28, 3, INK));
  const iconX = x + 18;
  const iconY = y + 122;
  cv.rect(iconX, iconY, 120, 104, BOX);
  cv.frame(iconX, iconY, 120, 104, LINE, 2);
  drawIcon(cv, s.icon, iconX, iconY);
  drawPara(cv, s.body, x + 154, iconY + 4, 25, 2, INK, 19);
}

function drawFooter(cv: Canvas): void {
  cv.rect(0, 962, W, 62, NAVY);
  cv.rect(0, 962, W, 3, GOLD);
  drawText(cv, "ALSO ON TUESDAY:", 24, 972, 2, GOLD);
  drawPara(cv, ALSO_LINE.replace(/^ALSO: /, ""), 24, 990, 80, 2, WHITE, 15);
}

function compose(): Canvas {
  const cv = new Canvas(W, H, NAVY2);
  drawHeader(cv);
  STORIES.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawPanel(cv, s, 24 + col * (480 + 16), 166 + row * (252 + 14));
  });
  drawFooter(cv);
  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const png = encodePng(compose());
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
