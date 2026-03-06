import type { DmRule, MatchMode } from '@/types/database';

interface MatchResult {
  matched: boolean;
  rule: DmRule;
  matchedKeyword: string;
}

/** Check if text matches a rule's keywords based on match_mode */
export function matchesRule(text: string, rule: DmRule): { matched: boolean; keyword: string } {
  const lower = text.toLowerCase();

  for (const keyword of rule.keywords) {
    const kw = keyword.toLowerCase();
    let matched = false;

    switch (rule.match_mode as MatchMode) {
      case 'exact':
        matched = lower === kw;
        break;
      case 'contains':
        matched = lower.includes(kw);
        break;
      case 'starts_with':
        matched = lower.startsWith(kw);
        break;
      case 'regex':
        try {
          matched = new RegExp(keyword, 'i').test(text);
        } catch {
          matched = false;
        }
        break;
    }

    if (matched) return { matched: true, keyword };
  }

  return { matched: false, keyword: '' };
}

/** Find the best matching rule for a comment/message, respecting priority */
export function findMatchingRule(text: string, rules: DmRule[]): MatchResult | null {
  const activeRules = rules
    .filter((r) => r.is_active)
    .sort((a, b) => b.priority - a.priority); // highest priority first

  for (const rule of activeRules) {
    const { matched, keyword } = matchesRule(text, rule);
    if (matched) {
      return { matched: true, rule, matchedKeyword: keyword };
    }
  }

  return null;
}

/** Render a response template with variables */
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/** Check if cooldown has elapsed for a user + rule combo */
export function isCooldownActive(
  lastTriggeredAt: string | null,
  cooldownMinutes: number
): boolean {
  if (!lastTriggeredAt) return false;
  const elapsed = Date.now() - new Date(lastTriggeredAt).getTime();
  return elapsed < cooldownMinutes * 60 * 1000;
}
