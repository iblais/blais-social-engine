const TOKEN = 'sbp_27948ae333356a83cadc0b07ea18eee2474ceb71';

const query = `
CREATE OR REPLACE FUNCTION claim_due_posts(max_posts int, due_before text)
RETURNS TABLE(id uuid) LANGUAGE sql AS $$
  UPDATE posts SET status = 'publishing'
  WHERE id IN (
    SELECT p.id FROM posts p
    WHERE p.status = 'scheduled'
      AND p.scheduled_at <= due_before::timestamptz
      AND p.platform != 'twitter'
    ORDER BY p.scheduled_at ASC
    LIMIT max_posts
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id;
$$;
`;

fetch('https://api.supabase.com/v1/projects/mzwleneitsihjwfzfuho/database/query', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
}).then(r => r.json()).then(d => console.log(JSON.stringify(d)));
