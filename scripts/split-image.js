#!/usr/bin/env node

/**
 * split-image.js — Split a 16:9 image down the middle into two halves
 *
 * Takes a 16:9 landscape image and splits it vertically into a left half
 * and right half — perfect for Instagram carousel posts (two 8:9 slides).
 *
 * Usage:
 *   node split-image.js <input-image> [output-dir]
 *
 * Examples:
 *   node split-image.js banner.png              # outputs 01.jpg + 02.jpg in ./split_output/
 *   node split-image.js banner.png ./my-slides   # custom output directory
 *
 * Requires: npm install sharp
 */

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

async function splitImage(inputPath, outputDir) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;
  const halfWidth = Math.floor(width / 2);

  console.log(`Image: ${width}x${height}`);
  console.log(`Splitting down the middle → two ${halfWidth}x${height} panels`);
  console.log(`Output: ${outputDir}`);

  fs.mkdirSync(outputDir, { recursive: true });

  // Left half
  await sharp(inputPath)
    .extract({ left: 0, top: 0, width: halfWidth, height })
    .jpeg({ quality: 95 })
    .toFile(path.join(outputDir, "01.jpg"));
  console.log(`  Created: 01.jpg (left half)`);

  // Right half
  await sharp(inputPath)
    .extract({ left: halfWidth, top: 0, width: halfWidth, height })
    .jpeg({ quality: 95 })
    .toFile(path.join(outputDir, "02.jpg"));
  console.log(`  Created: 02.jpg (right half)`);

  console.log(`\nDone! 2 panels saved to ${outputDir}`);
}

// --- CLI ---
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log("Usage: node split-image.js <input-image> [output-dir]");
  console.log("");
  console.log("Splits a 16:9 image down the middle into two halves (left + right).");
  console.log("");
  console.log("Examples:");
  console.log("  node split-image.js banner.png              # → ./split_output/01.jpg + 02.jpg");
  console.log("  node split-image.js banner.png ./my-slides   # custom output dir");
  process.exit(1);
}

const inputPath = args[0];
const outputDir = args[1] || "./split_output";

splitImage(inputPath, outputDir).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
