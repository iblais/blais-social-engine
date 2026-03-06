const GRAPH_API_VERSION = 'v22.0';

function getGraphBase(token: string): string {
  return token.startsWith('IGA')
    ? `https://graph.instagram.com/${GRAPH_API_VERSION}`
    : `https://graph.facebook.com/${GRAPH_API_VERSION}`;
}

interface SendMessageResult {
  recipient_id: string;
  message_id: string;
}

/** Send a text DM to an Instagram user */
export async function sendDM(
  igUserId: string,
  recipientId: string,
  text: string,
  accessToken: string
): Promise<SendMessageResult> {
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
      message: { text },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`DM send failed: ${err?.error?.message || res.statusText}`);
  }

  return res.json();
}

/** Send an image DM */
export async function sendImageDM(
  igUserId: string,
  recipientId: string,
  imageUrl: string,
  accessToken: string
): Promise<SendMessageResult> {
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
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl },
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Image DM failed: ${err?.error?.message || res.statusText}`);
  }

  return res.json();
}

/** Get conversation thread with a user */
export async function getConversation(
  igUserId: string,
  userId: string,
  accessToken: string
): Promise<{ id: string; messages: Array<{ id: string; message: string; from: { id: string }; created_time: string }> } | null> {
  const base = getGraphBase(accessToken);
  const url = `${base}/${igUserId}/conversations?user_id=${userId}&fields=messages{id,message,from,created_time}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0] || null;
}
