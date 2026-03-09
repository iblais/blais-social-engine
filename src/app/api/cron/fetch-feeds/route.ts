import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

/**
 * Fetch RSS feeds and save new items to curated_content.
 * Parses RSS/Atom XML and extracts title, link, description, image.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: feeds } = await supabase
    .from('content_feeds')
    .select('*')
    .eq('is_active', true);

  if (!feeds?.length) {
    return NextResponse.json({ message: 'No active feeds' });
  }

  const startTime = Date.now();
  const TIME_LIMIT = 50000; // 50s safety margin (60s max)

  let totalItems = 0;
  let newItems = 0;
  const feedResults: { name: string; items: number; new: number; error?: string }[] = [];

  // Separate X feeds from RSS feeds — X needs rate limiting
  const xFeeds = feeds.filter(f => /(?:x\.com|twitter\.com)\/(@?[\w]+)/i.test(f.url));
  const rssFeeds = feeds.filter(f => !/(?:x\.com|twitter\.com)\/(@?[\w]+)/i.test(f.url));

  // Process RSS feeds first (fast), then X feeds with time remaining
  for (const feed of rssFeeds) {
    if (Date.now() - startTime > TIME_LIMIT) break;
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'BlaisSocialEngine/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        feedResults.push({ name: feed.name, items: 0, new: 0, error: `HTTP ${res.status}` });
        continue;
      }

      const xml = await res.text();
      const items = parseRssItems(xml);

      totalItems += items.length;

      // Get existing URLs for this feed to avoid duplicates
      const { data: existing } = await supabase
        .from('curated_content')
        .select('url')
        .eq('feed_id', feed.id);
      const existingUrls = new Set((existing || []).map((e: any) => e.url));

      // Filter out items older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentItems = items.filter(item => {
        if (!item.pubDate) return true; // keep items without dates (can't filter)
        const d = new Date(item.pubDate).getTime();
        return !isNaN(d) ? d >= sevenDaysAgo : true;
      });

      let feedNew = 0;
      for (const item of recentItems.slice(0, 20)) {
        if (item.link && existingUrls.has(item.link)) continue;

        const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
        await supabase.from('curated_content').insert({
          feed_id: feed.id,
          user_id: feed.user_id,
          brand_id: feed.brand_id,
          title: item.title || 'Untitled',
          url: item.link || null,
          summary: item.description?.substring(0, 500) || null,
          image_url: item.image || null,
          published_at: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
          source: feed.name,
        });
        feedNew++;
        newItems++;
      }

      // Update last_fetched_at
      await supabase.from('content_feeds').update({
        last_fetched_at: new Date().toISOString(),
      }).eq('id', feed.id);

      feedResults.push({ name: feed.name, items: items.length, new: feedNew });
    } catch (err) {
      feedResults.push({ name: feed.name, items: 0, new: 0, error: (err as Error).message });
    }
  }

  // Process X feeds with 2s delay between requests to avoid 429s
  let xProcessed = 0;
  for (const feed of xFeeds) {
    if (Date.now() - startTime > TIME_LIMIT) break;
    try {
      const xMatch = feed.url.match(/(?:x\.com|twitter\.com)\/(@?[\w]+)/i);
      const username = xMatch![1].replace('@', '');
      const items = await fetchXTimeline(username);
      totalItems += items.length;

      const { data: existing } = await supabase
        .from('curated_content')
        .select('url')
        .eq('feed_id', feed.id);
      const existingUrls = new Set((existing || []).map((e: any) => e.url));

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentItems = items.filter(item => {
        if (!item.pubDate) return true;
        const d = new Date(item.pubDate).getTime();
        return !isNaN(d) ? d >= sevenDaysAgo : true;
      });

      let feedNew = 0;
      for (const item of recentItems.slice(0, 20)) {
        if (item.link && existingUrls.has(item.link)) continue;
        const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
        await supabase.from('curated_content').insert({
          feed_id: feed.id, user_id: feed.user_id, brand_id: feed.brand_id,
          title: item.title || 'Untitled', url: item.link || null,
          summary: item.description?.substring(0, 500) || null,
          image_url: item.image || null,
          published_at: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null,
          source: feed.name,
        });
        feedNew++;
        newItems++;
      }

      await supabase.from('content_feeds').update({
        last_fetched_at: new Date().toISOString(),
      }).eq('id', feed.id);

      feedResults.push({ name: feed.name, items: items.length, new: feedNew });
      xProcessed++;

      // Rate limit: 2s delay between X requests to avoid 429
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      feedResults.push({ name: feed.name, items: 0, new: 0, error: (err as Error).message });
    }
  }

  return NextResponse.json({
    message: 'Done',
    feeds_processed: feedResults.length,
    x_processed: `${xProcessed}/${xFeeds.length}`,
    total_items: totalItems,
    new_items: newItems,
    results: feedResults,
  });
}

type FeedItem = { title: string; link: string; description: string; image: string; pubDate?: string };

/** Parse RSS/Atom XML into items. Simple regex-based parser (no XML library needed). */
function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];

  // Try RSS 2.0 format first
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link') || extractAttr(block, 'link', 'href'),
      description: stripHtml(extractTag(block, 'description') || extractTag(block, 'content:encoded') || ''),
      image: extractAttr(block, 'media:content', 'url') ||
             extractAttr(block, 'media:thumbnail', 'url') ||
             extractAttr(block, 'enclosure', 'url') ||
             extractImageFromHtml(extractTag(block, 'description') || extractTag(block, 'content:encoded') || ''),
      pubDate: extractTag(block, 'pubDate') || extractTag(block, 'dc:date') || '',
    });
  }

  // If no RSS items found, try Atom format
  if (!items.length) {
    const entryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const block = match[1];
      items.push({
        title: extractTag(block, 'title'),
        link: extractAttr(block, 'link', 'href') || extractTag(block, 'link'),
        description: stripHtml(extractTag(block, 'summary') || extractTag(block, 'content') || ''),
        image: extractAttr(block, 'media:content', 'url') ||
               extractAttr(block, 'media:thumbnail', 'url') || '',
        pubDate: extractTag(block, 'published') || extractTag(block, 'updated') || '',
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = regex.exec(xml);
  return m ? m[1].trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
  const m = regex.exec(xml);
  return m ? m[1] : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function extractImageFromHtml(html: string): string {
  const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return imgMatch ? imgMatch[1] : '';
}

/**
 * Fetch tweets from X/Twitter using the public syndication endpoint.
 * No API key required — parses __NEXT_DATA__ JSON from the embedded timeline.
 */
async function fetchXTimeline(username: string): Promise<FeedItem[]> {
  const res = await fetch(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${username}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!res.ok) throw new Error(`X syndication HTTP ${res.status}`);

  const html = await res.text();

  // Extract __NEXT_DATA__ JSON which contains all tweet data
  const dataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!dataMatch) throw new Error(`X syndication: no __NEXT_DATA__ found (HTML length: ${html.length})`);

  try {
    const data = JSON.parse(dataMatch[1]);
    const entries = data?.props?.pageProps?.timeline?.entries || [];
    const items: FeedItem[] = [];

    for (const entry of entries.slice(0, 20)) {
      const tweet = entry?.content?.tweet;
      if (!tweet) continue;

      const text = tweet.full_text || tweet.text || '';
      if (!text) continue;

      const screenName = tweet.user?.screen_name || username;
      const tweetId = tweet.id_str || '';
      const link = tweetId ? `https://x.com/${screenName}/status/${tweetId}` : `https://x.com/${screenName}`;
      const title = text.length > 100 ? text.substring(0, 97) + '...' : text;

      // Get first media image if available
      const media = tweet.entities?.media?.[0] || tweet.extended_entities?.media?.[0];
      const image = media?.media_url_https || '';

      items.push({ title, link, description: text, image, pubDate: tweet.created_at || '' });
    }

    return items;
  } catch {
    return [];
  }
}
