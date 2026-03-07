import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

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

  let totalItems = 0;
  let newItems = 0;
  const feedResults: { name: string; items: number; new: number; error?: string }[] = [];

  for (const feed of feeds) {
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

      let feedNew = 0;
      for (const item of items.slice(0, 20)) {
        if (item.link && existingUrls.has(item.link)) continue;

        await supabase.from('curated_content').insert({
          feed_id: feed.id,
          user_id: feed.user_id,
          brand_id: feed.brand_id,
          title: item.title || 'Untitled',
          url: item.link || null,
          summary: item.description?.substring(0, 500) || null,
          image_url: item.image || null,
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

  return NextResponse.json({
    message: 'Done',
    feeds_processed: feeds.length,
    total_items: totalItems,
    new_items: newItems,
    results: feedResults,
  });
}

/** Parse RSS/Atom XML into items. Simple regex-based parser (no XML library needed). */
function parseRssItems(xml: string): { title: string; link: string; description: string; image: string }[] {
  const items: { title: string; link: string; description: string; image: string }[] = [];

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
