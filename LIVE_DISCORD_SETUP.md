# Beacon Bot — Live Discord Dashboard

This version keeps the original pages and adds a NEW live Discord data layer.

## What is now live

The dashboard pulls from the actual Discord bot:
- Servers the bot is currently in
- Server names and icons
- Server owner names and IDs
- Member counts
- Users across the bot's servers
- User avatars
- Number of servers each user shares with Beacon
- Invite codes
- Invite creators
- Invite uses / limits / expiry
- Automatic background synchronization

## Setup

1. Install Node.js 18+.
2. Copy `.env.example` to `.env`.
3. Put your Discord bot token in `DISCORD_BOT_TOKEN`.
4. Run:
   `npm install`
   `npm start`
5. Open:
   `http://localhost:3000`

## IMPORTANT Discord Developer Portal settings

Enable:
- Server Members Intent

For invite information, the bot also needs permission to view/fetch invites in each server. The exact permission can be granted with `Manage Guild` / `Manage Server` depending on your setup.

Do NOT put the bot token in frontend JavaScript.

## Updating

The server sync runs every 60 seconds by default. Set `SYNC_INTERVAL_MS=30000` for 30 seconds.

The current settings endpoint is intentionally kept simple. To make server settings persistent between restarts, connect those endpoints to your existing bot database.
