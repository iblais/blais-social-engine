import { geminiGenerate } from '@/lib/ai/gemini';

interface AIReplyContext {
  username: string;
  commentText: string;
  brandName: string;
  rulePrompt?: string;
  apiKey: string;
}

/** Generate an AI-powered reply to a comment or DM */
export async function generateAIReply(ctx: AIReplyContext): Promise<string> {
  const systemPrompt = ctx.rulePrompt || buildDefaultPrompt(ctx.brandName);

  const prompt = `${systemPrompt}

User @${ctx.username} wrote:
"${ctx.commentText}"

Write a short, friendly reply (1-2 sentences max). Be conversational and on-brand. Don't use hashtags. Reply only with the message text, nothing else.`;

  const reply = await geminiGenerate(prompt, ctx.apiKey);
  return reply.trim().replace(/^["']|["']$/g, ''); // Strip wrapping quotes
}

function buildDefaultPrompt(brandName: string): string {
  return `You are the social media manager for ${brandName}. You reply to Instagram comments and DMs with a warm, authentic, engaging tone. Keep replies brief and genuine. If someone asks for a link or resource, acknowledge their interest and let them know you'll send it. Never be pushy or salesy.`;
}

/** Generate a smart DM follow-up based on a comment */
export async function generateAIDM(ctx: AIReplyContext & { replyText?: string }): Promise<string> {
  const systemPrompt = ctx.rulePrompt || buildDefaultPrompt(ctx.brandName);

  const prompt = `${systemPrompt}

User @${ctx.username} commented on your post:
"${ctx.commentText}"

${ctx.replyText ? `You already replied to their comment: "${ctx.replyText}"\n` : ''}
Now write a short, friendly DM to follow up and deliver value. Keep it personal and under 3 sentences. Reply only with the DM text, nothing else.`;

  const reply = await geminiGenerate(prompt, ctx.apiKey);
  return reply.trim().replace(/^["']|["']$/g, '');
}
