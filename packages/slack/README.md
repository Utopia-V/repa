# @opencode-ai/slack

> **Status — retained OpenCode integration outside Repa's TUI baseline.** This README documents source-local behavior and setup for the inherited Slack bot. It does not authorize connecting, deploying, building, or releasing Slack as a Repa product surface; an accepted Repa ADR or Gate must explicitly admit that scope.
> Current Repa authority is indexed by the [documentation map](../../docs/README.md).

The retained integration creates OpenCode sessions for threaded Slack conversations.

## Source-Local Setup

1. Create a Slack app at https://api.slack.com/apps
2. Enable Socket Mode
3. Add the following OAuth scopes:
   - `chat:write`
   - `app_mentions:read`
   - `channels:history`
   - `groups:history`
4. Install the app to your workspace
5. Set environment variables in `.env`:
   - `SLACK_BOT_TOKEN` - Bot User OAuth Token
   - `SLACK_SIGNING_SECRET` - Signing Secret from Basic Information
   - `SLACK_APP_TOKEN` - App-Level Token from Basic Information

## Source-Local Usage

```bash
# Edit .env with your Slack app credentials
bun dev
```

When this retained integration is intentionally run, the bot responds to messages in channels where it is added and creates a separate OpenCode session for each thread.
