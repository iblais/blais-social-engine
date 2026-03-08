// Add all RSS feeds and X accounts to content_feeds
const TOKEN = 'sbp_27948ae333356a83cadc0b07ea18eee2474ceb71';
const USER_ID = '2a950381-392e-444d-8a64-3355a1060e19';
const BLAIS_LAB = '7e7f79bb-71ed-4ebb-ac61-448d3199c604';

const feeds = [
  // AI Company Blogs
  ['Stability AI Blog', 'https://stability.ai/blog/rss'],
  ['ElevenLabs Blog', 'https://blog.elevenlabs.io/rss'],
  ['Anthropic News', 'https://www.anthropic.com/news/rss.xml'],
  ['Midjourney Blog RSS', 'https://midjourney.com/blog/rss'],
  ['Hugging Face Blog', 'https://huggingface.co/blog/feed.xml'],
  ['Replicate Blog', 'https://replicate.com/blog/rss.xml'],
  ['RunPod Blog', 'https://blog.runpod.io/rss'],
  ['NVIDIA Blog', 'https://www.nvidia.com/en-us/rss/blog.xml'],
  ['NVIDIA Developer', 'https://www.nvidia.com/en-us/rss/developer.xml'],
  ['Stability AI News', 'https://stability.ai/news/rss'],
  ['Leonardo AI Blog', 'https://leonardo.ai/blog/rss'],
  ['Kling AI Blog', 'https://kling.ai/blog/rss'],
  ['Pika Art Blog', 'https://pika.art/blog/rss'],
  ['Runway ML Blog', 'https://runwayml.com/blog/rss'],
  ['Dreamina Blog', 'https://dreamina.capcut.com/blog/rss'],
  ['Recraft AI Blog', 'https://recraft.ai/blog/rss'],
  ['Midjourney Blog Feed', 'https://blog.midjourney.com/feed'],
  ['OpenArt Blog', 'https://openart.ai/blog/rss'],

  // Design & Creative
  ['Canva Blog', 'https://blog.canva.com/feed/'],
  ['Adobe AI Blog', 'https://blog.adobe.com/en/publish/categories/ai.xml'],
  ['Adobe Creative Cloud', 'https://blog.adobe.com/en/topics/creative-cloud.rss'],
  ['Creative Bloq', 'https://www.creativebloq.com/feeds/all'],
  ['DesignBoom', 'https://www.designboom.com/feed/'],
  ['Smashing Magazine', 'https://www.smashingmagazine.com/feed/'],
  ['99designs Blog', 'https://99designs.com/blog/feed/'],
  ['LogoMyWay Blog', 'https://blog.logomyway.com/feed/'],
  ['Dribbble Stories', 'https://dribbble.com/stories.rss'],
  ['Procreate Blog', 'https://blog.procreate.com/feed'],
  ['Kittl Blog', 'https://blog.kittl.com/rss'],
  ['Creative Fabrica', 'https://creativefabrica.com/the-artistry/feed/'],
  ['Freepik Blog', 'https://www.freepik.com/blog/feed'],
  ['Design Tuts+', 'https://design.tutsplus.com/posts/rss'],
  ['GD Stack Exchange', 'https://graphicdesign.stackexchange.com/feeds'],
  ['Icons8 Blog', 'https://blog.icons8.com/rss'],

  // AI News & Media
  ['VentureBeat AI', 'https://venturebeat.com/category/ai/feed/'],
  ['Wired AI', 'https://www.wired.com/feed/tag/ai/latest/rss'],
  ['The Verge AI', 'https://www.theverge.com/rss/ai/index.xml'],
  ['TechCrunch AI', 'https://techcrunch.com/tag/artificial-intelligence/feed/'],
  ['MIT Tech Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed/'],
  ['AI Trends', 'https://www.aitrends.com/feed/'],
  ['Synced Review', 'https://syncedreview.com/feed/'],
  ['Future Tools', 'https://futuretools.io/feed'],
  ['The Rundown AI', 'https://therundown.ai/rss'],
  ['Superhuman AI', 'https://superhuman.ai/rss'],

  // AI Research & Learning
  ['Google AI Blog', 'https://ai.googleblog.com/feeds/posts/default'],
  ['DeepMind Blog Feed', 'https://blog.deepmind.com/rss'],
  ['BAIR Berkeley', 'https://bair.berkeley.edu/blog/feed.xml'],
  ['AI Weirdness', 'https://aiweirdness.com/rss'],
  ['ML Mastery', 'https://machinelearningmastery.com/blog/feed/'],
  ['a16z Blog', 'https://a16z.com/feed/'],

  // Prompt Engineering
  ['Prompt Engineering', 'https://promptengineering.org/feed'],
  ['Learn Prompting', 'https://learnprompting.org/blog/rss.xml'],
  ['PromptBase Blog', 'https://promptbase.com/blog/rss'],
  ['Prompt Eng Daily', 'https://promptengineeringdaily.com/rss'],
  ['TDS Prompt Eng', 'https://towardsdatascience.com/tagged/prompt-engineering/rss'],
  ['Medium Generative AI', 'https://medium.com/tag/generative-ai/feed'],
  ['Medium Prompt Eng', 'https://medium.com/tag/prompt-engineering/feed'],

  // E-commerce & POD
  ['Etsy Blog', 'https://blog.etsy.com/en/feed/'],
  ['Printful Blog RSS', 'https://www.printful.com/blog/rss'],
  ['Printify Blog RSS', 'https://www.printify.com/blog/rss'],
  ['Shopify Blog', 'https://www.shopify.com/blog/rss.xml'],
  ['BigCommerce Blog', 'https://www.bigcommerce.com/blog/rss.xml'],
  ['Redbubble Blog', 'https://www.redbubble.com/blog/feed'],
  ['Gelato Blog', 'https://gelato.com/blog/rss'],

  // Startup / Product
  ['Product Hunt', 'https://producthunt.com/feed'],
  ['Y Combinator Blog', 'https://www.ycombinator.com/blog/rss'],
  ['Indie Hackers', 'https://indiehackers.com/feed'],
];

// X/Twitter accounts
const xAccounts = [
  'tibo_maker', 'levelsio', 'karpathy', 'rowancheung', 'midjourney',
  'Canva', 'Kittl', 'CreativeTim', 'Figma', 'VisualizeValue', 'nickfloats',
  'digitalart_ai', 'PromptHero', 'OpenArtAI', 'TheRealGregIsenberg',
  'alex_prompter', 'godofprompt', 'trq212', 'Artedeingenio',
  'claudeai', 'AnthropicAI', 'OpenAI', 'GoogleGeminiApp', 'stabilityai',
  'leonardoai', 'openart_ai', 'HiggsfieldAI', 'kling_ai', 'heygen_official',
  'ElevenLabsIO', 'copy_ai', 'recraftai', 'promptmagazine', 'promptprism',
  'futurewalt_ai', 'trend_ai_tech', 'airessearches', 'TheAISurfer',
  'SabrinaRamonov', 'GregIsenberg', 'dope_motions', 'jackroberts__',
  'vibecodeapp', 'manus_ai', 'dreamina_ai', 'robonuggets',
];

for (const handle of xAccounts) {
  feeds.push([`X: @${handle}`, `https://x.com/${handle}`]);
}

async function run() {
  // Build VALUES clause
  const values = feeds.map(([name, url]) => {
    const safeName = name.replace(/'/g, "''");
    const safeUrl = url.replace(/'/g, "''");
    return `('${USER_ID}', '${BLAIS_LAB}', '${safeName}', '${safeUrl}', true)`;
  }).join(', ');

  const query = `INSERT INTO content_feeds (user_id, brand_id, name, url, is_active) VALUES ${values} ON CONFLICT DO NOTHING RETURNING name, url;`;

  const res = await fetch('https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (Array.isArray(data)) {
    console.log(`Added ${data.length} new feeds:`);
    data.forEach(f => console.log(`  - ${f.name}`));
  } else {
    console.log('Response:', JSON.stringify(data, null, 2));
  }
}

run();
