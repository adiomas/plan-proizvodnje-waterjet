/**
 * Generira PWA ikone (192, 512, maskable-512) iz SVG stringa.
 * Koristi sharp ako je dostupan, inače zapisuje SVG pa instrukcije za konverziju.
 *
 * Pokretanje: node scripts/generate-icons.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "public", "icons");

// Heksagon + točka dizajn (iz dashboard headera)
function createSvg(size, padding = 0) {
  const p = padding;
  const s = size - 2 * p;
  const cx = size / 2;
  const cy = size / 2;
  const r = s * 0.42; // heksagon radius
  const dotR = s * 0.1; // centralna točka

  // Heksagon path (flat-top)
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  const hexPath = `M${points.join("L")}Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#111827" rx="${size * 0.15}"/>
  <path d="${hexPath}" fill="none" stroke="white" stroke-width="${s * 0.04}"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR}" fill="white"/>
</svg>`;
}

// Maskable ikona — veći safe zone padding (20% na svaku stranu)
function createMaskableSvg(size) {
  const padding = size * 0.2;
  const s = size - 2 * padding;
  const cx = size / 2;
  const cy = size / 2;
  const r = s * 0.42;
  const dotR = s * 0.1;

  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  const hexPath = `M${points.join("L")}Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#111827"/>
  <path d="${hexPath}" fill="none" stroke="white" stroke-width="${s * 0.04}"/>
  <circle cx="${cx}" cy="${cy}" r="${dotR}" fill="white"/>
</svg>`;
}

async function main() {
  const sizes = [192, 512];

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    // sharp nije instaliran — zapisujemo SVG datoteke
    console.log("sharp nije dostupan, zapisujem SVG datoteke...");

    for (const size of sizes) {
      const svg = createSvg(size);
      const svgPath = join(ICONS_DIR, `icon-${size}.svg`);
      writeFileSync(svgPath, svg);
      console.log(`  Zapisano: ${svgPath}`);
    }

    const maskableSvg = createMaskableSvg(512);
    const maskableSvgPath = join(ICONS_DIR, "icon-maskable-512.svg");
    writeFileSync(maskableSvgPath, maskableSvg);
    console.log(`  Zapisano: ${maskableSvgPath}`);

    console.log("\nZa konverziju u PNG, instaliraj sharp:");
    console.log("  npm install -D sharp");
    console.log("  node scripts/generate-icons.mjs");

    // Bez sharpa, generiraj PNG koristeći resvg-js ili pad-back na SVG
    // Pokušaj s canvas fallbackom
    console.log("\nPokušavam s canvas fallbackom...");
    try {
      const { createCanvas } = await import("canvas");
      for (const size of sizes) {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext("2d");
        const r = size * 0.42;
        const dotR = size * 0.1;
        const cx = size / 2;
        const cy = size / 2;

        // Background
        ctx.fillStyle = "#111827";
        roundRect(ctx, 0, 0, size, size, size * 0.15);
        ctx.fill();

        // Heksagon
        ctx.strokeStyle = "white";
        ctx.lineWidth = size * 0.04;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Dot
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();

        const buffer = canvas.toBuffer("image/png");
        const pngPath = join(ICONS_DIR, `icon-${size}.png`);
        writeFileSync(pngPath, buffer);
        console.log(`  PNG: ${pngPath}`);
      }

      // Maskable
      {
        const size = 512;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext("2d");
        const padding = size * 0.2;
        const s = size - 2 * padding;
        const r = s * 0.42;
        const dotR = s * 0.1;
        const cx = size / 2;
        const cy = size / 2;

        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = "white";
        ctx.lineWidth = s * 0.04;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();

        const buffer = canvas.toBuffer("image/png");
        const pngPath = join(ICONS_DIR, "icon-maskable-512.png");
        writeFileSync(pngPath, buffer);
        console.log(`  PNG: ${pngPath}`);
      }
    } catch {
      console.log("canvas također nije dostupan.");
      console.log("Koristit ću inline SVG pristup — ažuriram manifest da koristi SVG...");

      // Ažuriraj manifest da koristi SVG ikone
      const manifestPath = join(__dirname, "..", "public", "manifest.json");
      const manifest = JSON.parse(
        (await import("fs")).readFileSync(manifestPath, "utf-8")
      );
      manifest.icons = [
        { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
        { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        { src: "/icons/icon-maskable-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
      ];
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      console.log("Manifest ažuriran s SVG ikonama.");
    }
    return;
  }

  // Sharp je dostupan — generiraj PNG
  for (const size of sizes) {
    const svg = createSvg(size);
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const pngPath = join(ICONS_DIR, `icon-${size}.png`);
    writeFileSync(pngPath, buffer);
    console.log(`Generirano: ${pngPath}`);
  }

  const maskableSvg = createMaskableSvg(512);
  const maskableBuffer = await sharp(Buffer.from(maskableSvg)).png().toBuffer();
  const maskablePath = join(ICONS_DIR, "icon-maskable-512.png");
  writeFileSync(maskablePath, maskableBuffer);
  console.log(`Generirano: ${maskablePath}`);

  console.log("\nSve ikone generirane uspješno!");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

main().catch(console.error);
