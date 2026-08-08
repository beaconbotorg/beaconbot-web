// Optional live dashboard helper.
// The dashboard's server-side API now reads directly from the Discord bot.
// Refresh the current page's server/user/invite data every 60 seconds.
setInterval(async () => {
  try {
    const status = await fetch("/api/discord/status").then(r=>r.json());
    const el = document.querySelector("[data-discord-live]");
    if (el) el.textContent = status.connected ? "LIVE" : "OFFLINE";
  } catch {}
}, 60000);
