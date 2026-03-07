---
name: split-images
description: Split 16:9 AI-generated images into Instagram carousel slides with quality checking
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob
argument-hint: "[source folder] [output folder]"
---

# Split Images for Instagram Carousels

Split 16:9 AI-generated educational carousel images into left/right halves for Instagram carousel posts.

## Workflow

1. **Scan source folder** for PNG images (numbered like `1_cinematic_...png`)
2. **Review each image** visually to check if content straddles the center split line
3. **Pick best versions** when multiple versions exist (base, (1), (2), etc.)
4. **Pair images sequentially** — #1+#2 = Post 01, #3+#4 = Post 02, etc.
5. **Split each image** into left half + right half using Sharp
6. **Generate "SAVE THIS" CTA** as slide 05 for each post
7. **Route posts**: clean posts → `edited/`, problematic posts → `need revisions/`

## Each Post = 5 Slides
- `01.jpg` = Left half of first image (cover)
- `02.jpg` = Right half of first image
- `03.jpg` = Left half of second image
- `04.jpg` = Right half of second image
- `05.jpg` = "SAVE THIS" CTA slide

## Quality Checks
When reviewing images for center-split quality:
- Text that straddles the center → NEEDS REVISION
- Character/mascot cut in half at center → NEEDS REVISION
- Product grids spanning the center → NEEDS REVISION
- Decorative elements clipped at edges → ACCEPTABLE (minor)

## Tools Required
- Node.js with `sharp` package: `npm install sharp`

## Arguments
- `$0` = Source folder path (where generated PNGs live)
- `$1` = Output base folder path (will create `edited/` and `need revisions/` subdirs)

If no arguments provided, ask the user for paths.

## Reference Script
See `process-batch-v2.js` in the Heal Frontier folder for a working implementation:
`C:\Users\itsbl\Dropbox\0 Business 2024\0 - Social Media Automations\Heal Frontier\process-batch-v2.js`
