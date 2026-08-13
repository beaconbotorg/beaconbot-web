# Beacon Bot Website

**Live site:** [https://beaconbot.site](https://beaconbot.site)

Static website for GitHub Pages. Discord roles, login, and staff online come from your bot (`beaconbot2.0`) at `https://api.beaconbot.site`.

## Upload to GitHub

All files in this folder are safe to publish — no secrets.

## How it connects to your bot

```
https://beaconbot.site          →  GitHub Pages (this website)
https://api.beaconbot.site      →  Your bot host (portal API)
```

1. Website loads roles from `https://api.beaconbot.site/api/portal/config`
2. Staff online from `https://api.beaconbot.site/api/staff/online`
3. Discord login via `https://api.beaconbot.site/api/auth/discord`
4. After login, user is sent back to `https://beaconbot.site`

Secrets stay in `beaconbot2.0/.env` on your bot server only.

## Hostinger DNS

| Type | Name | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `YOUR_USERNAME.github.io` |
| A | `api` | Your bot server IP |

In GitHub → **Settings → Pages → Custom domain**, set `beaconbot.site`.

## Discord Developer Portal

Add this OAuth redirect URL:

`https://api.beaconbot.site/api/auth/discord/callback`

Enable **Server Members Intent** and **Presence Intent** on your bot.
