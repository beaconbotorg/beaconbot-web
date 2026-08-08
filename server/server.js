require("dotenv").config();
const express = require("express");
const path = require("path");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.GuildMember]
});

let cache = {
  updatedAt: null,
  servers: [],
  users: [],
  invites: []
};

function avatarFor(guild) {
  return guild.iconURL({ extension: "png", size: 128 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";
}

async function syncDiscord() {
  if (!client.isReady()) return;

  const servers = [];
  const usersMap = new Map();
  const invites = [];

  for (const guild of client.guilds.cache.values()) {
    let ownerName = "Unknown";
    try {
      const owner = await guild.fetchOwner();
      ownerName = owner.user.globalName || owner.user.username;
    } catch {}

    // Fetch members so the dashboard has real Discord users.
    // This requires the Server Members Intent to be enabled in the Developer Portal.
    try {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        const user = member.user;
        if (user.bot) continue;

        const existing = usersMap.get(user.id) || {
          id: user.id,
          name: user.globalName || user.username,
          username: user.username,
          avatar: user.displayAvatarURL({ extension: "png", size: 64 }),
          servers: 0,
          role: "Member",
          lastSeen: "Unknown"
        };

        existing.servers++;
        if (member.permissions.has("Administrator")) existing.role = "Administrator";
        usersMap.set(user.id, existing);
      }
    } catch (err) {
      console.error(`Member sync failed for ${guild.name}:`, err.message);
    }

    servers.push({
      id: guild.id,
      name: guild.name,
      owner: ownerName,
      ownerId: guild.ownerId,
      members: guild.memberCount ?? 0,
      invites: 0,
      status: "online",
      joined: guild.joinedAt ? guild.joinedAt.toISOString().slice(0,10) : null,
      icon: avatarFor(guild)
    });

    // Invite data is only available when the bot has the required permission.
    try {
      const inviteManager = await guild.invites.fetch();
      for (const invite of inviteManager.values()) {
        invites.push({
          code: invite.code,
          server: guild.name,
          serverId: guild.id,
          creator: invite.inviter
            ? (invite.inviter.globalName || invite.inviter.username)
            : "Unknown",
          uses: invite.uses ?? 0,
          maxUses: invite.maxUses || "∞",
          expires: invite.expiresAt ? invite.expiresAt.toISOString() : "Never"
        });
      }
      const row = servers[servers.length - 1];
      row.invites = inviteManager.size;
    } catch (err) {
      console.warn(`Invite sync unavailable for ${guild.name}: ${err.message}`);
    }
  }

  cache = {
    updatedAt: new Date().toISOString(),
    servers,
    users: [...usersMap.values()],
    invites
  };

  console.log(
    `[SYNC] ${cache.servers.length} servers • ${cache.users.length} users • ${cache.invites.length} invites`
  );
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await syncDiscord();

  // Keep dashboard data fresh. Change to 30000 for 30 seconds if desired.
  setInterval(syncDiscord, Number(process.env.SYNC_INTERVAL_MS || 60000));
});

app.get("/api/discord/status", (req, res) => {
  res.json({
    connected: client.isReady(),
    bot: client.user ? client.user.tag : null,
    updatedAt: cache.updatedAt
  });
});

app.get("/api/servers", (req, res) => {
  res.json(cache.servers);
});

app.get("/api/users", (req, res) => {
  res.json(cache.users);
});

app.get("/api/invites", (req, res) => {
  res.json(cache.invites);
});

app.get("/api/stats", (req, res) => {
  res.json({
    users: cache.users.length,
    servers: cache.servers.length,
    commands: 0,
    uptime: client.isReady() ? "Online" : "Offline",
    updatedAt: cache.updatedAt
  });
});

// Keep settings API available for the existing dashboard.
// Replace the in-memory object with your database when your bot settings table is ready.
const settings = new Map();

app.get("/api/settings/:serverId", (req,res) => {
  res.json(settings.get(req.params.serverId) || {
    prefix:"!",
    welcomeEnabled:true,
    welcomeChannel:"welcome",
    welcomeMessage:"Welcome {user} to {server}!",
    farewellEnabled:true,
    farewellChannel:"goodbye",
    farewellMessage:"Goodbye {user}!",
    loggingEnabled:true,
    logChannel:"mod-logs",
    antiSpam:true,
    antiLinks:false,
    antiRaid:true,
    antiAlt:false,
    leveling:true,
    economy:true,
    vcPoints:true
  });
});

app.put("/api/settings/:serverId", (req,res) => {
  settings.set(req.params.serverId, req.body);
  res.json({ok:true,message:"Settings saved"});
});

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"..","index.html"));
});

app.listen(PORT,()=>{
  console.log(`Dashboard: http://localhost:${PORT}`);
});

if (!BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN is missing. Create a .env file before starting.");
} else {
  client.login(BOT_TOKEN).catch(err => {
    console.error("Discord login failed:", err.message);
  });
}
