const GRAPH_API_VERSION = 'v22.0';

function getGraphBase(token: string): string {
  return token.startsWith('IGA')
    ? `https://graph.instagram.com/${GRAPH_API_VERSION}`
    : `https://graph.facebook.com/${GRAPH_API_VERSION}`;
}

interface IgComment {
  id: string;
  text: string;
  from: { id: string; username: string };
  timestamp: string;
}

interface IgPost {
  id: string;
  caption?: string;
  timestamp: string;
}

/** Fetch recent media (posts) for an IG business account */
export async function fetchRecentPosts(
  igUserId: string,
  accessToken: string,
  limit = 25
): Promise<IgPost[]> {
  const base = getGraphBase(accessToken);
  const url = `${base}/${igUserId}/media?fields=id,caption,timestamp&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch posts: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.data || [];
}

/** Fetch comments on a specific media object */
export async function fetchComments(
  mediaId: string,
  accessToken: string,
  limit = 50
): Promise<IgComment[]> {
  const base = getGraphBase(accessToken);
  const url = `${base}/${mediaId}/comments?fields=id,text,from,timestamp&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch comments: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.data || [];
}

/** Reply to a comment */
export async function replyToComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<string> {
  const base = getGraphBase(accessToken);
  const url = `${base}/${commentId}/replies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to reply: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.id;
}

/** Send a private reply DM to a commenter (uses comment_id as recipient) */
export async function sendPrivateReply(
  igUserId: string,
  commentId: string,
  message: string,
  accessToken: string
): Promise<string> {
  const base = getGraphBase(accessToken);
  const url = `${base}/${igUserId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to send private reply: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.message_id || data.id;
}

/** Send a DM via Instagram Messaging API (requires prior conversation) */
export async function sendInstagramDM(
  igUserId: string,
  recipientId: string,
  message: string,
  accessToken: string
): Promise<string> {
  const base = getGraphBase(accessToken);
  const url = `${base}/${igUserId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to send DM: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.message_id || data.id;
}
