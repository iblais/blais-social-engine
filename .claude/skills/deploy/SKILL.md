---
name: deploy
description: Build, commit, push, and deploy the Blais Social Engine to Vercel production
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
argument-hint: "[commit message]"
---

# Deploy to Production

One-command deploy pipeline for Blais Social Engine.

## Steps

1. **Pre-flight checks**:
   - Run `git status` to see changed files
   - Run `git diff --stat` to summarize changes
   - If no changes exist, say "Nothing to deploy" and stop

2. **Build verification**:
   - Run `cd C:/Users/itsbl/projects/blais-social-engine && npx next build`
   - If build fails, show the error and stop — do NOT deploy broken code

3. **Commit**:
   - Stage only the relevant changed files (NOT `.env`, credentials, or `node_modules`)
   - If `$ARGUMENTS` is provided, use it as the commit message
   - Otherwise, analyze the diff and write a concise commit message
   - Always append: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

4. **Push & Deploy**:
   - Run `git push`
   - Run `vercel --prod --yes --scope ernest-blais-projects`
   - Show the deployment URL when complete

5. **Verify**:
   - Confirm deployment succeeded
   - Show summary: files changed, commit hash, deploy URL

## Important
- Vercel Hobby plan — crons must be daily only
- Auto-deploy webhook is broken — always use `vercel --prod --yes --scope ernest-blais-projects`
- Working directory: `C:/Users/itsbl/projects/blais-social-engine/`
