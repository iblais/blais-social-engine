---
name: fix-deploy
description: Fix a bug or implement a feature, then build-test-commit-deploy in one flow
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: "[description of what to fix or build]"
---

# Fix & Deploy Pipeline

End-to-end workflow: understand the issue → fix it → verify → deploy.

## Steps

1. **Understand**: Read the relevant code files to understand the issue described in `$ARGUMENTS`

2. **Plan**: Briefly outline what needs to change (1-3 sentences max)

3. **Fix**: Make the code changes
   - Working directory: `C:/Users/itsbl/projects/blais-social-engine/`
   - Follow existing patterns and conventions
   - Don't over-engineer — minimal changes only

4. **Build**: Run `npx next build` to verify no TypeScript or build errors
   - If build fails, fix the error and rebuild

5. **Commit**: Stage changed files and commit with a descriptive message
   - Always append: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

6. **Deploy**: Push and deploy
   - `git push`
   - `vercel --prod --yes --scope ernest-blais-projects`

7. **Report**: Show summary of changes, commit hash, and deploy URL

## Project Context
- Next.js 16 + React 19 + TypeScript + Supabase + shadcn/ui + Tailwind CSS 4
- Dashboard pages: `src/app/(dashboard)/`
- API routes: `src/app/api/`
- Components: `src/components/`
- Lib: `src/lib/` (posters, hooks, store, supabase, ai)
- Types: `src/types/database.ts`
