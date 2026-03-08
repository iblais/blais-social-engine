const https = require('https');

const url = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/OpenAI';

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'text/html',
  },
}).then(r => r.text()).then(html => {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) { console.log('No __NEXT_DATA__ found'); return; }
  const j = JSON.parse(m[1]);
  const entries = j.props?.pageProps?.timeline?.entries || [];
  console.log('Total entries:', entries.length);
  entries.slice(0, 3).forEach(e => {
    const t = e.content?.tweet || {};
    console.log('TEXT:', (t.full_text || t.text || '').substring(0, 120));
    console.log('USER:', t.user?.screen_name);
    console.log('ID:', t.id_str);
    console.log('MEDIA:', (t.entities?.media || []).map(m => m.media_url_https).join(', '));
    console.log('---');
  });
});
