const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcDir = 'G:/My Drive/BLAIS SOCIAL ENGINE/BLAIS_LAB_SOCIAL/TRACK_1_TIPS_AND_TRICKS/batch_02/generated';

async function splitImages() {
  const files = fs.readdirSync(srcDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).sort((a, b) => {
    // Sort numerically by first number in filename
    const aNum = parseInt(a.match(/^(\d+)/)[1]);
    const bNum = parseInt(b.match(/^(\d+)/)[1]);
    return aNum - bNum;
  });
  console.log(`Found ${files.length} files`);

  // Group by post number (second part of filename)
  const posts = {};
  for (const file of files) {
    const match = file.match(/^(\d+)_(\d+)_(\d+)/);
    if (!match) { console.log('Skipping:', file); continue; }
    const [, seqNum, postNum, genInPost] = match;
    if (!posts[postNum]) posts[postNum] = [];
    posts[postNum].push({ file, seqNum: parseInt(seqNum), postNum, genInPost: parseInt(genInPost) });
  }

  console.log(`Found ${Object.keys(posts).length} posts: ${Object.keys(posts).sort((a, b) => a - b).join(', ')}`);

  for (const [postNum, gens] of Object.entries(posts).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    // Sort by genInPost (1, 2, 3)
    gens.sort((a, b) => a.genInPost - b.genInPost);

    if (gens.length !== 3) {
      console.log(`WARNING: Post ${postNum} has ${gens.length} files (expected 3): ${gens.map(g => g.file).join(', ')}`);
    }

    const outDir = path.join(srcDir, `post_${postNum}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    let slideNum = 1;
    for (const gen of gens) {
      const imgPath = path.join(srcDir, gen.file);
      const metadata = await sharp(imgPath).metadata();
      const halfWidth = Math.floor(metadata.width / 2);
      const height = metadata.height;

      // Left half
      await sharp(imgPath)
        .extract({ left: 0, top: 0, width: halfWidth, height })
        .toFile(path.join(outDir, `slide_${slideNum}.png`));
      console.log(`  Post ${postNum}: ${gen.file.substring(0, 30)}... LEFT  -> slide_${slideNum}.png (${halfWidth}x${height})`);
      slideNum++;

      // Right half
      await sharp(imgPath)
        .extract({ left: halfWidth, top: 0, width: metadata.width - halfWidth, height })
        .toFile(path.join(outDir, `slide_${slideNum}.png`));
      console.log(`  Post ${postNum}: ${gen.file.substring(0, 30)}... RIGHT -> slide_${slideNum}.png (${metadata.width - halfWidth}x${height})`);
      slideNum++;
    }
    console.log(`Post ${postNum}: ${slideNum - 1} slides created`);
  }
  console.log('\nDone!');
}

splitImages().catch(console.error);
