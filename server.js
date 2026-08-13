/* Beacon Bot portal server: Discord OAuth plus live staff-presence cache. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv(path.join(__dirname, '.env'));

const env = process.env;
const PORT = Number(env.PORT || 3000);
const production = env.NODE_ENV === 'production';
const required = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'SESSION_SECRET'];
const roles = { coreteam: env.DISCORD_ROLE_CORE_TEAM, leaddev: env.DISCORD_ROLE_LEAD_DEVELOPER, developer: env.DISCORD_ROLE_DEVELOPER, management: env.DISCORD_ROLE_MANAGEMENT, support: env.DISCORD_ROLE_SUPPORT, member: env.DISCORD_ROLE_COMMUNITY_MEMBER };
const permissions = { member: ['create_ticket', 'create_application', 'create_appeal', 'live_chat'], support: ['view_assigned_tickets', 'manage_tickets', 'live_chat'], management: ['manage_tickets', 'view_applications', 'review_appeals', 'live_chat'], developer: ['manage_tickets', 'view_applications', 'live_chat'], leaddev: ['manage_tickets', 'review_applications', 'live_chat'], coreteam: ['*'] };
const applicationReviewAccess = { 'Support application': ['coreteam', 'management'], 'Partner proposal': ['coreteam', 'management'], 'Bot integration': ['coreteam', 'management'] };
const monitoredGuilds = (env.MONITORED_GUILD_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
const members = new Map();
const onlineStaff = new Map();

function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v[0])); }
function cookie(name, value, { maxAge, httpOnly = true } = {}) { return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; ${httpOnly ? 'HttpOnly; ' : ''}${production ? 'Secure; ' : ''}${maxAge ? `Max-Age=${maxAge}; ` : ''}`; }
function reply(res, status, body, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(body)); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50_000) { reject(new Error('Request body is too large.')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON.')); } });
    req.on('error', reject);
  });
}
function highestRole(memberRoles = []) { for (const role of ['coreteam', 'leaddev', 'developer', 'management', 'support', 'member']) if (roles[role] && memberRoles.includes(roles[role])) return role; return 'member'; }
function canReviewApplication(role, kind, userPermissions = []) {
  if (userPermissions.includes('*')) return true;
  return (applicationReviewAccess[kind] || ['coreteam', 'management']).includes(role);
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }
function sign(payload) { const value = base64url(JSON.stringify(payload)); return `${value}.${crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url')}`; }
function session(req) {
  try {
    const [value, signature] = (cookies(req).beacon_session || '').split('.');
    const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
    if (!value || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const user = JSON.parse(Buffer.from(value, 'base64url'));
    return user.exp > Date.now() ? user : null;
  } catch { return null; }
}
function siteOrigin(req) { return (env.SITE_URL || '').replace(/\/$/, '') || `${production ? 'https' : 'http'}://${req.headers.host}`; }
function redirectUri(req) { return env.DISCORD_REDIRECT_URI || `${siteOrigin(req)}/api/auth/discord/callback`; }
async function discord(url, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${url}`, options);
  if (!response.ok) throw new Error(`Discord API returned ${response.status}`);
  return response.json();
}
async function monitoredGuildMatches(userId) {
  const checks = await Promise.all(monitoredGuilds.map(async guildId => {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Monitored guild check returned ${response.status}`);
    return guildId;
  }));
  return checks.filter(Boolean);
}
async function sendTicketTranscript(ticket) {
  if (!/^\d{17,20}$/.test(ticket.discordId || '')) throw new Error('This ticket is not linked to a Discord account.');
  const dm = await discord('/users/@me/channels', { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient_id: ticket.discordId }) });
  const transcript = [`**Ticket details**`, ticket.details || 'No ticket details provided.', '', ...(ticket.messages || []).flatMap(message => [`**${message.from}** - ${message.time || 'Unknown time'}`, message.text || '', ''])].join('\n');
  const chunks = [];
  let remaining = transcript;
  while (remaining.length) { chunks.push(remaining.slice(0, 3_700)); remaining = remaining.slice(3_700); }
  if (!chunks.length) chunks.push('No messages were recorded for this ticket.');
  for (const [index, description] of chunks.entries()) {
    const embed = index === 0 ? {
      title: `Ticket transcript - #R-${ticket.id}`,
      color: 0x3b82f6,
      fields: [
        { name: 'Subject', value: String(ticket.subject || 'Untitled').slice(0, 1_024), inline: false },
        { name: 'Category', value: String(ticket.category || 'General support').slice(0, 1_024), inline: true },
        { name: 'Status', value: 'Closed', inline: true }
      ],
      description,
      footer: { text: 'Beacon Bot Support' },
      timestamp: new Date().toISOString()
    } : { title: `Ticket transcript continued (${index + 1}/${chunks.length})`, color: 0x3b82f6, description };
    await discord(`/channels/${dm.id}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
  }
}
async function announceApplicationAccepted(application, reviewer) {
  const channelId = (env.DISCORD_STAFF_ANNOUNCEMENTS_CHANNEL_ID || '').trim();
  if (!channelId) throw new Error('Staff announcements channel is not configured on the server.');
  const applicant = application.discordId ? `<@${application.discordId}>` : application.name || 'Unknown applicant';
  const embed = {
    title: 'Application accepted',
    color: 0x45d39d,
    description: `${applicant} has been accepted for **${application.kind || 'an application'}**.`,
    fields: [
      { name: 'Application', value: String(application.kind || 'Application').slice(0, 1_024), inline: true },
      { name: 'Title', value: String(application.title || application.subject || 'Untitled').slice(0, 1_024), inline: true },
      { name: 'Reviewed by', value: String(reviewer.username || 'Staff').slice(0, 1_024), inline: true }
    ],
    footer: { text: 'Beacon Bot Staff Announcements' },
    timestamp: new Date().toISOString()
  };
  await discord(`/channels/${channelId}/messages`, { method: 'POST', headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds: [embed] }) });
}

const roleRank = { coreteam: 0, leaddev: 1, developer: 2, management: 3, support: 4, member: 5 };
const gatewayIntents = 1 + 2 + 256; // GUILDS + GUILD_MEMBERS + GUILD_PRESENCES

function normalizeMember(data) {
  const user = data.user || data;
  return {
    id: user.id,
    name: data.nick || user.global_name || user.username,
    avatar: user.avatar,
    roles: data.roles || [],
    bot: Boolean(user.bot)
  };
}
function isStaffMember(member) {
  if (!member || member.bot) return false;
  return highestRole(member.roles) !== 'member';
}
function updatePresence(member, status) {
  if (!member || member.bot) return member?.id && onlineStaff.delete(member.id);
  if (!isStaffMember(member)) return onlineStaff.delete(member.id);
  if (!status || status === 'offline') return onlineStaff.delete(member.id);
  const rank = highestRole(member.roles);
  onlineStaff.set(member.id, { id: member.id, name: member.name, avatar: member.avatar, role: rank, status });
}
function listOnlineStaff() {
  return [...onlineStaff.values()]
    .filter(person => person?.id && person?.name)
    .sort((left, right) => (roleRank[left.role] ?? 99) - (roleRank[right.role] ?? 99) || left.name.localeCompare(right.name));
}
async function fetchGuildMember(userId) {
  try {
    const item = await discord(`/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    const member = normalizeMember(item);
    if (member.bot) return null;
    members.set(member.id, member);
    return member;
  } catch { return null; }
}
async function syncStaffRoster() {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return;
  let after = null;
  const seen = new Set();
  while (true) {
    const path = after ? `/guilds/${env.DISCORD_GUILD_ID}/members?limit=1000&after=${after}` : `/guilds/${env.DISCORD_GUILD_ID}/members?limit=1000`;
    const batch = await discord(path, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    if (!Array.isArray(batch) || !batch.length) break;
    for (const item of batch) {
      const member = normalizeMember(item);
      seen.add(member.id);
      if (member.bot) {
        members.delete(member.id);
        onlineStaff.delete(member.id);
        continue;
      }
      members.set(member.id, member);
      if (!isStaffMember(member)) onlineStaff.delete(member.id);
    }
    after = batch[batch.length - 1].user.id;
    if (batch.length < 1000) break;
  }
  for (const id of [...members.keys()]) {
    if (!seen.has(id)) {
      members.delete(id);
      onlineStaff.delete(id);
    }
  }
}
function startPresenceGateway() {
  if (!env.DISCORD_BOT_TOKEN || typeof WebSocket === 'undefined') return;
  let heartbeat;
  const connect = () => {
    const socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    socket.addEventListener('open', () => console.log('Discord presence gateway connected.'));
    socket.addEventListener('message', event => {
      const packet = JSON.parse(event.data);
      if (packet.op === 10) {
        heartbeat = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ op: 1, d: null })), packet.d.heartbeat_interval);
        socket.send(JSON.stringify({ op: 2, d: { token: env.DISCORD_BOT_TOKEN, intents: gatewayIntents, properties: { os: 'linux', browser: 'beacon-bot', device: 'beacon-bot' } } }));
        return;
      }
      if (packet.op !== 0) return;
      if (packet.t === 'READY') {
        syncStaffRoster().catch(error => console.error('Staff roster sync failed:', error.message));
        socket.send(JSON.stringify({ op: 8, d: { guild_id: env.DISCORD_GUILD_ID, query: '', limit: 0, presences: true } }));
        return;
      }
      if (packet.t === 'GUILD_MEMBERS_CHUNK') for (const item of packet.d.members) {
        if (item.user?.bot) continue;
        const member = normalizeMember(item);
        members.set(member.id, member);
        const presence = packet.d.presences?.find(p => p.user.id === member.id);
        updatePresence(member, presence?.status || 'offline');
      }
      if (packet.t === 'GUILD_MEMBER_UPDATE') {
        const member = normalizeMember(packet.d);
        if (member.bot) {
          members.delete(member.id);
          onlineStaff.delete(member.id);
          return;
        }
        members.set(member.id, member);
        const current = onlineStaff.get(member.id);
        if (current) updatePresence(member, current.status);
        else if (!isStaffMember(member)) onlineStaff.delete(member.id);
      }
      if (packet.t === 'PRESENCE_UPDATE' && packet.d.guild_id === env.DISCORD_GUILD_ID) {
        const userId = packet.d.user?.id;
        if (!userId || packet.d.user?.bot) return;
        const cached = members.get(userId);
        if (cached) return updatePresence(cached, packet.d.status);
        fetchGuildMember(userId).then(member => member && updatePresence(member, packet.d.status));
      }
    });
    socket.addEventListener('close', code => {
      clearInterval(heartbeat);
      console.warn(`Discord presence gateway closed (${code}). Reconnecting in 5s.`);
      setTimeout(connect, 5000);
    });
    socket.addEventListener('error', error => console.error('Discord presence gateway error:', error.message || error));
  };
  connect();
  setInterval(() => syncStaffRoster().catch(error => console.error('Staff roster sync failed:', error.message)), 5 * 60 * 1000);
}

async function oauthCallback(req, res, url) {
  if (!cookies(req).discord_oauth_state || cookies(req).discord_oauth_state !== url.searchParams.get('state')) return reply(res, 403, { error: 'Invalid OAuth state. Please try signing in again.' });
  try {
    const form = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: redirectUri(req) });
    const token = await discord('/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const user = await discord('/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const member = await discord(`/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`, { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } });
    const role = highestRole(member.roles);
    const data = { id: user.id, username: user.global_name || user.username, avatar: user.avatar, role, permissions: permissions[role], exp: Date.now() + 1000 * 60 * 60 * 8 };
    res.writeHead(302, { Location: '/', 'Set-Cookie': [cookie('beacon_session', sign(data), { maxAge: 60 * 60 * 8 }), cookie('discord_oauth_state', '', { maxAge: 0 })] }); res.end();
  } catch (error) { console.error('Discord authentication failed:', error.message); reply(res, 502, { error: 'Discord sign-in failed. Check server configuration and try again.' }); }
}
function serveStatic(req, res, url) {
  const filename = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return reply(res, 404, { error: 'Not found' });
  const file = path.join(__dirname, filename);
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return reply(res, 404, { error: 'Not found' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  if (url.pathname === '/api/staff/online' && req.method === 'GET') return reply(res, 200, { staff: listOnlineStaff() });
  if (required.some(key => !env[key])) return reply(res, 500, { error: `Server configuration missing: ${required.filter(key => !env[key]).join(', ')}` });
  if (url.pathname.startsWith('/api/moderation/discord/') && req.method === 'GET') {
    const reviewer = session(req), userId = url.pathname.split('/').pop();
    if (!reviewer || !reviewer.permissions.includes('*')) return reply(res, 403, { error: 'Core Team access is required.' });
    if (!/^\d{17,20}$/.test(userId)) return reply(res, 400, { error: 'Invalid Discord user ID.' });
    try { return reply(res, 200, { monitoredGuildMatches: await monitoredGuildMatches(userId) }); }
    catch (error) { console.error('Monitored guild check failed:', error.message); return reply(res, 502, { error: 'Monitored guild check failed.' }); }
  }
  if (url.pathname === '/api/auth/discord' && req.method === 'GET') {
    const state = crypto.randomBytes(24).toString('hex');
    const query = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(req), scope: 'identify guilds.members.read', state, prompt: 'consent' });
    res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${query}`, 'Set-Cookie': cookie('discord_oauth_state', state, { maxAge: 600 }) }); return res.end();
  }
  if (url.pathname === '/api/auth/discord/callback' && req.method === 'GET') return oauthCallback(req, res, url);
  if (url.pathname === '/api/auth/me' && req.method === 'GET') { const user = session(req); return user ? reply(res, 200, { user }) : reply(res, 401, { error: 'Not signed in' }); }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') { res.writeHead(204, { 'Set-Cookie': cookie('beacon_session', '', { maxAge: 0 }) }); return res.end(); }
  if (url.pathname === '/api/tickets/transcript' && req.method === 'POST') {
    const reviewer = session(req);
    if (!reviewer || !(reviewer.permissions.includes('*') || reviewer.permissions.includes('manage_tickets'))) return reply(res, 403, { error: 'Ticket-management access is required.' });
    try { const { ticket } = await readJson(req); if (!ticket || typeof ticket !== 'object') return reply(res, 400, { error: 'Ticket data is required.' }); await sendTicketTranscript(ticket); return reply(res, 204, {}); }
    catch (error) { return reply(res, 422, { error: error.message === 'This ticket is not linked to a Discord account.' ? error.message : 'The transcript could not be delivered. The member may have DMs disabled.' }); }
  }
  if (url.pathname === '/api/applications/review' && req.method === 'POST') {
    const reviewer = session(req);
    if (!reviewer) return reply(res, 401, { error: 'Not signed in' });
    try {
      const { application, decision } = await readJson(req);
      if (!application || typeof application !== 'object') return reply(res, 400, { error: 'Application data is required.' });
      if (!canReviewApplication(reviewer.role, application.kind, reviewer.permissions)) return reply(res, 403, { error: 'You do not have permission to review this application type.' });
      if (decision === 'accepted') await announceApplicationAccepted(application, reviewer);
      return reply(res, 204, {});
    } catch (error) {
      console.error('Application review failed:', error.message);
      return reply(res, 422, { error: error.message || 'The staff announcement could not be sent.' });
    }
  }
  return reply(res, 404, { error: 'API route not found' });
}).listen(PORT, () => {
  console.log(`Beacon Bot portal running at ${env.SITE_URL || `http://localhost:${PORT}`}`);
  syncStaffRoster().catch(error => console.error('Initial staff roster sync failed:', error.message));
  startPresenceGateway();
});
