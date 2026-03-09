/**
 * Split batch_01 diptych images into individual carousel slides.
 *
 * Source: 3 veo-folders (F1, F2, F3) with 16:9 diptych PNGs (2752x1536)
 * Output: edited/D01-D30 folders, 8 slides each (4 diptychs × 2 panels)
 *
 * Each diptych is split into left panel (slide N) and right panel (slide N+1).
 * Carousel order: Hook slide first → content slides → "Save this post" last.
 *
 * Usage: node scripts/split-batch01.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BASE = 'G:/My Drive/BLAIS SOCIAL ENGINE/BLAIS_LAB_SOCIAL/TRACK_1_TIPS_AND_TRICKS/batch_01';
const FOLDERS = {
  F1: path.join(BASE, 'generated', 'veo-folder-'),
  F2: path.join(BASE, 'generated', 'veo-folder-1'),
  F3: path.join(BASE, 'generated', 'veo-folder-3'),
};
const OUTPUT = path.join(BASE, 'edited');
const DIPTYCHS_PER_DAY = 4;

function buildFileIndex() {
  const index = {};
  for (const [key, folder] of Object.entries(FOLDERS)) {
    if (!fs.existsSync(folder)) {
      console.error(`Folder not found: ${folder}`);
      continue;
    }
    for (const fname of fs.readdirSync(folder)) {
      if (!fname.endsWith('.png')) continue;
      const numStr = fname.split('_')[0];
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) {
        index[`${key}_${num}`] = { folder: key, num, path: path.join(folder, fname) };
      }
    }
  }
  return index;
}

function getSortedSequence(index) {
  const sequence = [];
  for (const folderKey of ['F1', 'F2', 'F3']) {
    const entries = Object.values(index)
      .filter((e) => e.folder === folderKey)
      .sort((a, b) => a.num - b.num);
    sequence.push(...entries);
  }
  return sequence;
}

async function splitDiptych(srcPath, width) {
  const halfW = Math.floor(width / 2);
  const img = sharp(srcPath);
  const meta = await img.metadata();

  const left = await sharp(srcPath)
    .extract({ left: 0, top: 0, width: halfW, height: meta.height })
    .png()
    .toBuffer();

  const right = await sharp(srcPath)
    .extract({ left: halfW, top: 0, width: width - halfW, height: meta.height })
    .png()
    .toBuffer();

  return { left, right };
}

async function main() {
  const index = buildFileIndex();
  const sequence = getSortedSequence(index);
  console.log(`Total source diptychs: ${sequence.length}`);
  console.log(`Days: ${Math.ceil(sequence.length / DIPTYCHS_PER_DAY)}`);
  console.log(`Slides per day: ${DIPTYCHS_PER_DAY * 2}\n`);

  // Get dimensions from first image
  const firstMeta = await sharp(sequence[0].path).metadata();
  const imgWidth = firstMeta.width;
  console.log(`Source dimensions: ${imgWidth}x${firstMeta.height}`);
  console.log(`Panel dimensions: ${Math.floor(imgWidth / 2)}x${firstMeta.height}\n`);

  // Clean previous output (only PNGs in day folders)
  if (fs.existsSync(OUTPUT)) {
    for (const dir of fs.readdirSync(OUTPUT)) {
      const dayPath = path.join(OUTPUT, dir);
      if (!fs.statSync(dayPath).isDirectory()) continue;
      if (!/^D\d{2}$/.test(dir) && dir !== 'BONUS') continue;
      for (const f of fs.readdirSync(dayPath)) {
        if (f.endsWith('.png')) {
          fs.unlinkSync(path.join(dayPath, f));
        }
      }
    }
  }

  let day = 1;
  let totalSlides = 0;

  for (let i = 0; i < sequence.length; i += DIPTYCHS_PER_DAY) {
    const group = sequence.slice(i, i + DIPTYCHS_PER_DAY);
    const dayStr = `D${String(day).padStart(2, '0')}`;
    const dayDir = path.join(OUTPUT, dayStr);
    fs.mkdirSync(dayDir, { recursive: true });

    let slideNum = 1;
    for (const entry of group) {
      const { left, right } = await splitDiptych(entry.path, imgWidth);

      const leftPath = path.join(dayDir, `${dayStr}_slide${String(slideNum).padStart(2, '0')}.png`);
      const rightPath = path.join(dayDir, `${dayStr}_slide${String(slideNum + 1).padStart(2, '0')}.png`);

      fs.writeFileSync(leftPath, left);
      fs.writeFileSync(rightPath, right);

      slideNum += 2;
    }

    const slidesInDay = (slideNum - 1);
    totalSlides += slidesInDay;
    console.log(`${dayStr}: ${group.length} diptychs → ${slidesInDay} slides  (${group[0].folder}#${group[0].num} - ${group[group.length - 1].folder}#${group[group.length - 1].num})`);
    day++;
  }

  console.log(`\nDone! ${totalSlides} slides across ${day - 1} days`);
  console.log(`Output: ${OUTPUT}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
