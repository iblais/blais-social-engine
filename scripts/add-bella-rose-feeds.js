const fs = require('fs');
const TOKEN = 'sbp_27948ae333356a83cadc0b07ea18eee2474ceb71';
const USER_ID = '2a950381-392e-444d-8a64-3355a1060e19';
const BELLA_ROSE = '980a3bed-4390-41b6-b930-5ed5c9276c0e';

async function run() {
  const data = JSON.parse(fs.readFileSync('scripts/bella-rose-feeds.json', 'utf-8'));
  const feeds = data.feeds;

  // Insert in batches of 50 to avoid query size limits
  const batchSize = 50;
  let total = 0;

  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize);
    const values = batch.map(f => {
      const name = f.name.replace(/'/g, "''");
      const url = f.url.replace(/'/g, "''");
      return `('${USER_ID}', '${BELLA_ROSE}', '${name}', '${url}', true)`;
    }).join(', ');

    const query = `INSERT INTO content_feeds (user_id, brand_id, name, url, is_active) VALUES ${values} ON CONFLICT DO NOTHING RETURNING name;`;

    const res = await fetch('https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const result = await res.json();
    if (Array.isArray(result)) {
      total += result.length;
      console.log(`Batch ${Math.floor(i / batchSize) + 1}: added ${result.length} feeds`);
    } else {
      console.log(`Batch ${Math.floor(i / batchSize) + 1} error:`, result.message || JSON.stringify(result));
    }
  }

  console.log(`\nTotal added: ${total} feeds for Bella Rose`);
}

run();
