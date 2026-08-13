const apiBase = () => (window.DISCORD_PORTAL_CONFIG?.apiBaseUrl || '/api').replace(/\/$/, '');
const apiUrl = path => `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
const portalConfig = () => window.DISCORD_PORTAL_CONFIG || {};
const roleLabel = role => portalConfig().roleLabels?.[role] || role;
const roleStyles = { member: { color: '#8490a5', bg: '#1a2230' }, support: { color: '#45d39d', bg: '#1a3d2e' }, management: { color: '#ffab4b', bg: '#3d2e1a' }, developer: { color: '#4b9cff', bg: '#1a2d4a' }, leaddev: { color: '#51d9e8', bg: '#1a3a40' }, coreteam: { color: '#a580ff', bg: '#2a1a40' } };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const read = key => JSON.parse(localStorage.getItem(key) || '[]');
const state = { role: 'member', tickets: read('beacon-tickets'), applications: read('beacon-applications'), appeals: read('beacon-appeals'), notifications: read('beacon-notifications'), chats: JSON.parse(localStorage.getItem('beacon-chats') || '{}'), queue: 'tickets', selected: 0, conversation: null, activeTicket: -1, authenticated: false, user: null };

function escape(value) { const element = document.createElement('div'); element.textContent = value || ''; return element.innerHTML; }
function save() { localStorage.setItem('beacon-tickets', JSON.stringify(state.tickets)); localStorage.setItem('beacon-applications', JSON.stringify(state.applications)); localStorage.setItem('beacon-appeals', JSON.stringify(state.appeals)); localStorage.setItem('beacon-notifications', JSON.stringify(state.notifications)); localStorage.setItem('beacon-chats', JSON.stringify(state.chats)); }
const applicationReviewAccess = () => window.PORTAL_FORM_CONFIG?.applicationReviewAccess || { 'Support application': ['coreteam', 'management'] };
const appealReviewAccess = () => window.PORTAL_FORM_CONFIG?.appealReviewAccess || ['management', 'coreteam'];
function canReviewApplication(kind) { if (state.user?.permissions?.includes('*')) return true; return (applicationReviewAccess()[kind] || ['coreteam', 'management']).includes(state.role); }
function canViewApplicationsQueue() {
  if (state.role === 'support') return false;
  if (state.user?.permissions?.includes('*')) return true;
  if (state.user?.permissions?.includes('review_applications')) return true;
  return Object.values(applicationReviewAccess()).some(roles => roles.includes(state.role));
}
function canReviewAppeals() { if (state.user?.permissions?.includes('*')) return true; return appealReviewAccess().includes(state.role); }
function pendingApplications() { if (!canViewApplicationsQueue()) return []; return state.applications.filter(record => (!record.status || record.status === 'Under review') && canReviewApplication(record.kind)); }
function pendingAppeals() { if (!canReviewAppeals()) return []; return state.appeals.filter(record => (!record.status || record.status === 'Under review') && record.kind === 'Ban appeal'); }
function addNotification(notification) { state.notifications.unshift(notification); save(); renderNotifications(); updateNotificationBadge(); }
function updateNotificationBadge() { const badge = $('#notificationBadge'); if (!badge) return; const unread = state.authenticated ? state.notifications.filter(note => !note.read && note.userId === state.user?.id).length : 0; badge.textContent = unread; badge.style.display = unread ? 'inline-flex' : 'none'; }
async function reviewApplication(id, decision) {
  const application = state.applications.find(record => record.id === id);
  if (!application || (application.status && application.status !== 'Under review')) return toast('This application has already been reviewed.');
  if (!canReviewApplication(application.kind)) return toast('You do not have permission to review this application type.');
  if (decision === 'accepted') {
    try {
      const response = await fetch(apiUrl('/applications/review'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ application, decision }) });
      const result = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(result.error || 'The staff announcement could not be sent.');
    } catch (error) { return toast(error.message); }
  }
  application.status = decision === 'accepted' ? 'Accepted' : 'Denied';
  application.reviewedAt = 'Just now';
  application.reviewedBy = state.user?.username || 'Staff';
  addNotification({ id: Date.now(), userId: application.discordId || null, username: application.name, type: 'application', title: decision === 'accepted' ? 'Application accepted' : 'Application denied', message: `Your ${application.kind} "${application.title}" was ${decision === 'accepted' ? 'accepted' : 'denied'} by ${application.reviewedBy}.`, applicationId: application.id, decision, created: 'Just now', read: false });
  save(); renderApplications(); renderQueue();
  toast(decision === 'accepted' ? 'Application accepted and announced in staff announcements.' : 'Application denied. The member has been notified.');
}
function reviewAppeal(id, decision) {
  const appeal = state.appeals.find(record => record.id === id);
  if (!appeal || (appeal.status && appeal.status !== 'Under review')) return toast('This appeal has already been reviewed.');
  if (!canReviewAppeals()) return toast('Only Management and Core Team can review ban appeals.');
  appeal.status = decision === 'accepted' ? 'Accepted' : 'Denied';
  appeal.reviewedAt = 'Just now';
  appeal.reviewedBy = state.user?.username || 'Staff';
  addNotification({ id: Date.now(), userId: appeal.discordId || null, username: appeal.name, type: 'appeal', title: decision === 'accepted' ? 'Ban appeal accepted' : 'Ban appeal denied', message: `Your ban appeal "${appeal.subject}" was ${decision === 'accepted' ? 'accepted' : 'denied'} by ${appeal.reviewedBy}.`, appealId: appeal.id, decision, created: 'Just now', read: false });
  save(); renderAppeals(); renderQueue();
  toast(decision === 'accepted' ? 'Ban appeal accepted. The member has been notified.' : 'Ban appeal denied. The member has been notified.');
}
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2700); }
function isStaff() { return state.role !== 'member'; }
function avatarUrl(id, hash) { return hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id || '0') >> 22n) % 6n)}.png`; }
function roleBadge(role) { const style = roleStyles[role] || roleStyles.member; return `<span class="role-badge role-${role}" style="--role-color:${style.color};--role-bg:${style.bg}">${escape(roleLabel(role))}</span>`; }
function avatarHtml(discordId, avatarHash, name, className = 'ticket-avatar') { return `<div class="${className}"><img src="${avatarUrl(discordId, avatarHash)}" alt="${escape(name || 'User')}"></div>`; }
function ticketStatusClass(status) { if (status === 'Closed') return 'closed'; if (status === 'In progress') return 'progress'; return 'open'; }
function visibleTickets() { if (isStaff()) return state.tickets; if (!state.authenticated) return []; return state.tickets.filter(ticket => ticket.discordId === state.user?.id); }
function ticketMessages(ticket) {
  const messages = [];
  if (ticket.details) messages.push({ from: ticket.name, discordId: ticket.discordId, avatar: ticket.avatar, role: ticket.role || 'member', text: ticket.details, time: ticket.created, opening: true });
  messages.push(...(ticket.messages || []));
  return messages;
}
function renderTicketThread(ticket) {
  const messages = ticketMessages(ticket);
  if (!messages.length) return '<div class="thread-empty">No messages yet.</div>';
  return messages.map(message => `<article class="ticket-message role-border-${message.role || 'member'}">${avatarHtml(message.discordId, message.avatar, message.from)}<div class="ticket-message-body"><header><b>${escape(message.from)}</b>${roleBadge(message.role || 'member')}<small>${escape(message.time)}</small></header><p>${escape(message.text)}</p></div></article>`).join('');
}
function pushTicketMessage(ticket, text) {
  const message = { from: state.user?.username || 'User', discordId: state.user?.id || null, avatar: state.user?.avatar || null, role: state.role, text: text.trim(), time: 'Just now' };
  (ticket.messages ||= []).push(message);
  if (isStaff() && ticket.status === 'Open') ticket.status = 'In progress';
  return message;
}
function buildTicketViewHtml(ticket) {
  const canReply = state.authenticated && (isStaff() || ticket.discordId === state.user?.id) && ticket.status !== 'Closed';
  const answers = ticket.answers && Object.keys(ticket.answers).length ? `<div class="ticket-answers">${Object.entries(ticket.answers).map(([label, value]) => `<div><b>${escape(label)}</b><span>${escape(value)}</span></div>`).join('')}</div>` : '';
  const replyArea = canReply
    ? '<form class="thread-compose" id="ticketThreadForm"><input id="ticketThreadInput" placeholder="Write a reply…" autocomplete="off"><button>Send</button></form>'
    : `<p class="ticket-closed-note">${ticket.status === 'Closed' ? 'This ticket is closed.' : 'Sign in with Discord to reply.'}</p>`;
  return `<div class="ticket-view-header role-border-${ticket.role || 'member'}">${avatarHtml(ticket.discordId, ticket.avatar, ticket.name, 'ticket-avatar lg')}<div><span class="kicker">#R-${ticket.id} · ${escape(ticket.category)}</span><h2>${escape(ticket.subject)}</h2><div class="ticket-author-meta"><b>${escape(ticket.name)}</b>${roleBadge(ticket.role || 'member')}<small>Opened ${escape(ticket.created)}</small></div></div><span class="status ticket-status ${ticketStatusClass(ticket.status)}">${escape(ticket.status || 'Open')}</span></div>${answers}<div class="ticket-thread" id="ticketThread">${renderTicketThread(ticket)}</div>${replyArea}`;
}
function openTicketView(ticket) {
  state.activeTicket = state.tickets.indexOf(ticket);
  $('#ticketViewContent').innerHTML = buildTicketViewHtml(ticket);
  $('#ticketViewModal').classList.add('open');
  $('#deleteTicket').textContent = ticket.status === 'Closed' ? 'Reopen ticket' : 'Close ticket';
}

function navigate(page) {
  if (page === 'staff' && !isStaff()) return toast('Staff access is required for the review center.');
  $$('.page').forEach(element => element.classList.toggle('active', element.id === page));
  $$('.nav button[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  $('#crumb').innerHTML = `MODERATION HUB / <b>${page.replace(/\b\w/g, letter => letter.toUpperCase())}</b>`;
  $('#sidebar').classList.remove('open'); window.scrollTo(0, 0);
  if (page === 'staff') renderQueue();
  if (page === 'notifications') { state.notifications.filter(note => !note.read && note.userId === state.user?.id).forEach(note => { note.read = true; }); save(); renderNotifications(); updateNotificationBadge(); }
}
function setRole(role) {
  state.role = role; document.body.classList.toggle('staff-enabled', isStaff());
  $('#roleName').textContent = roleLabel(role); $('#staffNav').style.display = state.authenticated && isStaff() ? 'block' : 'none';
  const staffReview = $('#viewStaffApplications');
  if (staffReview) staffReview.hidden = !(state.authenticated && canViewApplicationsQueue());
  const applicationsTab = $('#applicationsQueueTab');
  if (applicationsTab) applicationsTab.hidden = !(state.authenticated && canViewApplicationsQueue());
  const appealsTab = $('#appealsQueueTab');
  if (appealsTab) appealsTab.hidden = !(state.authenticated && canReviewAppeals());
  if (!canViewApplicationsQueue() && state.queue === 'applications') { state.queue = 'tickets'; state.selected = 0; $$('[data-queue]').forEach(item => item.classList.toggle('active', item.dataset.queue === 'tickets')); }
  if (!canReviewAppeals() && state.queue === 'appeals') { state.queue = 'tickets'; state.selected = 0; $$('[data-queue]').forEach(item => item.classList.toggle('active', item.dataset.queue === 'tickets')); }
  renderRoleMenu();
}
function renderRoleMenu() {
  const menu = $('#roleMenu');
  menu.innerHTML = state.authenticated ? '<small>DISCORD ACCOUNT</small><div class="signed-in">Signed in securely with Discord</div><button id="roleLogout"><span>Sign out</span> &rarr;</button>' : '<small>DISCORD ACCOUNT</small><button id="discordLogin"><span>Sign in with Discord</span> &rarr;</button>';
  $('#roleLogout')?.addEventListener('click', logout); $('#discordLogin')?.addEventListener('click', login);
}
function loginUrl() { return apiUrl('/auth/discord'); }

async function login() {
  const target = loginUrl();
  try {
    const response = await fetch(apiUrl('/health'), { credentials: 'include' });
    if (!response.ok) throw new Error('Bot API unavailable');
  } catch {
    toast(`Cannot reach the bot API at ${apiBase()}. Check that the bot is running and api.beaconbot.site DNS points to your bot host.`);
    return;
  }
  window.location.assign(target);
}
async function logout() { await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' }); state.authenticated = false; state.user = null; $('#accountButton b').textContent = 'Sign in with Discord'; $('#accountButton .avatar').textContent = '->'; setRole('member'); $('#roleMenu').classList.remove('open'); renderTickets(); renderNotifications(); updateNotificationBadge(); toast('Signed out successfully.'); }
async function syncAuth() { try { const response = await fetch(apiUrl('/auth/me'), { credentials: 'include' }); if (!response.ok) return; const { user } = await response.json(); state.authenticated = true; state.user = user; $('#accountButton b').textContent = user.username; $('#accountButton .avatar').innerHTML = `<img src="${avatarUrl(user.id, user.avatar)}" alt="">`; setRole(user.role); renderTickets(); renderNotifications(); updateNotificationBadge(); } catch {} }

function renderTickets() {
  const tickets = visibleTickets();
  const open = tickets.filter(ticket => ticket.status !== 'Closed').length;
  const inProgress = tickets.filter(ticket => ticket.status === 'In progress').length;
  const resolved = tickets.filter(ticket => ticket.status === 'Closed').length;
  $('#ticketMetric').textContent = `${open} open`;
  $('#openTickets').textContent = open;
  $('#inProgressTickets').textContent = inProgress;
  $('#resolvedTickets').textContent = resolved;
  $('#ticketBadge').textContent = open;
  if (!state.authenticated) {
    $('#ticketRows').innerHTML = '<tr class="empty-row"><td colspan="6">Sign in with Discord to view and create tickets.</td></tr>';
    return;
  }
  $('#ticketRows').innerHTML = tickets.length
    ? tickets.map(ticket => `<tr data-ticket="${ticket.id}" class="ticket-row role-border-${ticket.role || 'member'}"><td><div class="ticket-member-cell">${avatarHtml(ticket.discordId, ticket.avatar, ticket.name)}<span><b>${escape(ticket.name)}</b>${roleBadge(ticket.role || 'member')}</span></div></td><td><b>${escape(ticket.subject)}</b><small>#R-${ticket.id}</small></td><td>${escape(ticket.category)}</td><td>${ticket.created}</td><td><span class="status ticket-status ${ticketStatusClass(ticket.status)}">${escape(ticket.status || 'Open')}</span></td><td>→</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="6">No tickets yet. Create one and staff will get back to you.</td></tr>';
}
function renderApplications() { $('#applicationEmpty').textContent = state.applications.length ? state.applications.map(application => `${application.title} - ${application.status || 'Under review'}`).join(' | ') : 'You have not submitted an application yet.'; }
function renderNotifications() {
  const list = $('#notificationList');
  if (!list) return;
  const notes = state.authenticated ? state.notifications.filter(note => note.userId === state.user?.id) : [];
  list.innerHTML = notes.length ? notes.map(note => `<article class="notification-item ${note.read ? '' : 'unread'} ${note.decision || ''}"><div class="notification-head"><b>${escape(note.title)}</b><small>${note.created}</small></div><p>${escape(note.message)}</p></article>`).join('') : `<div class="empty-block">${state.authenticated ? 'No notifications yet.' : 'Sign in with Discord to view your notifications.'}</div>`;
}
function renderAppeals() {
  const root = $('#appealHistory');
  if (!root) return;
  const appeals = state.authenticated ? state.appeals.filter(appeal => appeal.discordId === state.user?.id) : [];
  root.innerHTML = appeals.length
    ? `<table><thead><tr><th>REFERENCE</th><th>SUBJECT</th><th>SUBMITTED</th><th>STATUS</th></tr></thead><tbody>${appeals.map(appeal => `<tr><td><b>#A-${appeal.id}</b></td><td>${escape(appeal.subject)}</td><td>${appeal.created}</td><td><span class="status ${appeal.status === 'Accepted' ? '' : appeal.status === 'Denied' ? 'denied' : 'pending'}">${escape(appeal.status || 'Under review')}</span></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty-block">${state.authenticated ? 'No ban appeals submitted.' : 'Sign in with Discord to view your appeal history.'}</div>`;
}
function renderQuestions() {
  const type = $('#modal').dataset.type;
  const key = type === 'ticket' ? $('#formCategory').value : type === 'appeal' ? 'Ban appeal' : $('#modal').dataset.application;
  const configKey = type === 'ticket' ? 'tickets' : type === 'appeal' ? 'appeals' : 'applications';
  const questions = window.PORTAL_FORM_CONFIG?.[configKey]?.[key] || [];
  $('#customQuestions').innerHTML = questions.map(question => `<label>${escape(question.label)}<input class="configured-question" data-label="${escape(question.label)}" ${question.required ? 'required' : ''} placeholder="${escape(question.placeholder || '')}"></label>`).join('');
}
function openModal(type, application = '') {
  if ((type === 'application' || type === 'appeal' || type === 'ticket') && !state.authenticated) {
    const message = type === 'appeal' ? 'Sign in with Discord before submitting a ban appeal.' : type === 'ticket' ? 'Sign in with Discord before creating a ticket.' : 'Sign in with Discord before submitting an application.';
    toast(message); return login();
  }
  const modal = $('#modal'); modal.dataset.type = type; modal.dataset.application = application; $('#modalForm').reset();
  const content = type === 'ticket'
    ? ['SUPPORT CENTER', 'Create a ticket', 'Your Discord profile and role will be attached so staff know who you are.', 'Submit request']
    : type === 'appeal'
      ? ['BAN APPEAL', 'Submit a ban appeal', 'Appeals are for server bans only. Explain what happened clearly and respectfully.', 'Submit ban appeal']
      : ['APPLICATIONS', application, 'Your signed-in Discord profile will be attached to this application.', 'Submit application'];
  $('#modalKicker').textContent = content[0]; $('#modalTitle').textContent = content[1]; $('#modalDescription').textContent = content[2]; $('.full').textContent = content[3];
  $('#formCategory').parentElement.style.display = type === 'ticket' ? 'block' : 'none';
  $('#formSubject').placeholder = type === 'appeal' ? 'Short summary of your ban appeal' : application ? 'Your proposal name' : 'A short, clear summary';
  renderQuestions(); modal.classList.add('open');
}
function submitModal(event) {
  event.preventDefault();
  const type = $('#modal').dataset.type, record = { id: Math.floor(1000 + Math.random() * 8999), subject: $('#formSubject').value.trim(), details: $('#formDetails').value.trim(), answers: Object.fromEntries($$('.configured-question').map(input => [input.dataset.label, input.value.trim()])), messages: [], name: state.user?.username || 'User', discordId: state.user?.id || null, avatar: state.user?.avatar || null, role: state.role || 'member', created: 'Just now' };
  if (type === 'ticket') {
    if (!state.authenticated) return login();
    record.category = $('#formCategory').value;
    record.status = 'Open';
    state.tickets.unshift(record);
    renderTickets();
    toast('Ticket created — staff have been notified.');
    navigate('tickets');
  }
  else if (type === 'application') { if (!state.authenticated) return login(); record.title = record.subject; record.kind = $('#modal').dataset.application; record.status = 'Under review'; state.applications.unshift(record); renderApplications(); toast('Application submitted from your Discord account.'); navigate('applications'); }
  else { if (!state.authenticated) return login(); record.kind = 'Ban appeal'; record.status = 'Under review'; state.appeals.unshift(record); renderAppeals(); toast('Your ban appeal has been submitted for review.'); navigate('appeals'); }
  save(); $('#modal').classList.remove('open');
}

function renderChat() { const chat = state.chats[state.conversation], list = $('#conversationList'); const entries = Object.entries(state.chats); list.innerHTML = entries.length ? entries.map(([id, item]) => `<button class="conversation ${id === state.conversation ? 'active' : ''}" data-conversation="${id}"><div class="staff-avatar blue">#</div><span><b>${escape(item.title)}</b><small>${escape(item.messages.at(-1)?.text || 'No messages yet')}</small></span></button>`).join('') : '<div class="empty-block">No conversations yet.<br>Create one to get started.</div>'; $('#chatBadge').textContent = entries.length; if (!chat) { $('#conversationTitle').textContent = 'No conversation selected'; $('#conversationStatus').textContent = 'Create a conversation to begin'; $('#messages').innerHTML = '<div class="empty-block">Your conversations will appear here.</div>'; $('#chatInput').disabled = true; return; } $('#chatInput').disabled = false; $('#conversationTitle').textContent = chat.title; $('#conversationStatus').textContent = 'Private conversation'; $('#messages').innerHTML = chat.messages.length ? chat.messages.map(message => `<div class="message ${message.from === 'You' ? 'mine' : ''}"><div class="staff-avatar blue">${message.from === 'You' ? 'YO' : 'ST'}</div><div><b>${message.from}</b><p>${escape(message.text)}</p><small>${message.time}</small></div></div>`).join('') : '<div class="empty-block">No messages in this conversation yet.</div>'; }
function renderQueue() {
  if (state.queue === 'appeals' && !canReviewAppeals()) { state.queue = 'tickets'; state.selected = 0; }
  if (state.queue === 'applications' && !canViewApplicationsQueue()) { state.queue = 'tickets'; state.selected = 0; }
  const records = state.queue === 'tickets'
    ? state.tickets.map(record => ({ ...record, label: record.subject, type: record.category }))
    : state.queue === 'applications'
      ? pendingApplications().map(record => ({ ...record, label: record.title, type: record.kind }))
      : pendingAppeals().map(record => ({ ...record, label: record.subject, type: record.kind || 'Ban appeal' }));
  const pendingApps = pendingApplications().length;
  const pendingBanAppeals = pendingAppeals().length;
  $('#staffTicketCount').textContent = state.tickets.length;
  $('#staffAppCount').textContent = pendingApps;
  $('#staffAppealCount').textContent = pendingBanAppeals;
  $('#reviewTickets').textContent = state.tickets.length;
  $('#reviewApplications').textContent = pendingApps;
  $('#reviewAppeals').textContent = pendingBanAppeals;
  $('#queueBadge').textContent = state.tickets.length + pendingApps + pendingBanAppeals;
  if (!records.length) {
    $('#queueList').innerHTML = '<div class="empty-block">No items are waiting for review.</div>';
    $('#reviewDetail').innerHTML = '<div class="empty-block">New member submissions will appear here.</div>';
    return;
  }
  state.selected = Math.min(state.selected, records.length - 1);
  const item = records[state.selected];
  const answers = item.answers && Object.keys(item.answers).length
    ? `<div class="review-answers">${Object.entries(item.answers).map(([label, value]) => `<p><b>${escape(label)}</b><span>${escape(value)}</span></p>`).join('')}</div>`
    : '';
  const decisionActions = state.queue === 'applications'
    ? `<div class="review-decision"><button type="button" class="secondary deny-btn" data-deny-application="${item.id}">Deny</button><button type="button" class="primary" data-accept-application="${item.id}">Accept</button></div>`
    : state.queue === 'appeals'
      ? `<div class="review-decision"><button type="button" class="secondary deny-btn" data-deny-appeal="${item.id}">Deny</button><button type="button" class="primary" data-accept-appeal="${item.id}">Accept</button></div>`
      : '';
  $('#queueList').innerHTML = records.map((record, index) => `<div class="queue-item ${index === state.selected ? 'selected' : ''} role-border-${record.role || 'member'}"><button class="queue-select" data-item="${index}">${state.queue === 'tickets' ? avatarHtml(record.discordId, record.avatar, record.name, 'ticket-avatar sm') : '<span class="priority"></span>'}<div><b>${escape(record.label)}</b><small>${escape(record.type)} · ${record.created}</small>${state.queue === 'tickets' ? roleBadge(record.role || 'member') : ''}</div><em>${escape(record.status || 'New')}</em></button>${state.queue === 'tickets' ? `<div class="review-actions"><button class="dots" data-ticket-menu="${record.id}" title="Ticket actions">...</button><div class="ticket-menu" id="ticket-menu-${record.id}"><button data-delete-ticket="${record.id}">Send transcript &amp; delete</button></div></div>` : ''}</div>`).join('');
  const ticketDetail = state.queue === 'tickets'
    ? `<div class="ticket-review"><div class="ticket-view-header role-border-${item.role || 'member'}">${avatarHtml(item.discordId, item.avatar, item.name, 'ticket-avatar lg')}<div><span class="kicker">${escape(item.type)}</span><h2>${escape(item.label)}</h2><div class="ticket-author-meta"><b>${escape(item.name)}</b>${roleBadge(item.role || 'member')}<small>Opened ${escape(item.created)}</small></div></div><span class="status ticket-status ${ticketStatusClass(item.status)}">${escape(item.status || 'Open')}</span></div>${answers}<div class="ticket-thread">${renderTicketThread(item)}</div><form class="thread-compose" id="applicationThreadForm"><input id="applicationThreadInput" placeholder="Reply as ${escape(state.user?.username || 'staff')}" autocomplete="off"><button>Send</button></form></div>`
    : `<span class="kicker">${escape(item.type)}</span><h2>${escape(item.label)}</h2><div class="reviewer">${avatarHtml(item.discordId, item.avatar, item.name, 'ticket-avatar')}<span><b>${escape(item.name)}</b>${roleBadge(item.role || 'member')}<small>Submitted ${item.created}</small></span></div><p>${escape(item.details)}</p>${answers}<div class="thread">${(item.messages || []).map(message => `<p><b>${escape(message.from)}</b><span>${escape(message.text)}</span></p>`).join('') || '<p class="thread-empty">No replies yet.</p>'}</div>`;
  $('#reviewDetail').innerHTML = `${ticketDetail}${decisionActions}`;
  $$('[data-item]').forEach(button => button.addEventListener('click', () => { state.selected = Number(button.dataset.item); renderQueue(); }));
  $$('[data-ticket-menu]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); $(`#ticket-menu-${button.dataset.ticketMenu}`).classList.toggle('open'); }));
  $$('[data-delete-ticket]').forEach(button => button.addEventListener('click', async () => {
    const ticket = state.tickets.find(record => String(record.id) === button.dataset.deleteTicket);
    if (!ticket) return;
    if (!ticket.discordId) return toast('This ticket has no Discord account, so no transcript can be delivered.');
    button.disabled = true; button.textContent = 'Sending transcript...';
    try {
      const response = await fetch(apiUrl('/tickets/transcript'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ticket }) });
      const result = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(result.error || 'Transcript delivery failed.');
      state.tickets = state.tickets.filter(record => record !== ticket); save(); state.selected = 0; renderTickets(); renderQueue();
      toast('Transcript sent to the member and ticket deleted.');
    } catch (error) { button.disabled = false; button.textContent = 'Send transcript & delete'; toast(error.message); }
  }));
  $$('[data-accept-application]').forEach(button => button.addEventListener('click', async () => reviewApplication(Number(button.dataset.acceptApplication), 'accepted')));
  $$('[data-deny-application]').forEach(button => button.addEventListener('click', async () => reviewApplication(Number(button.dataset.denyApplication), 'denied')));
  $$('[data-accept-appeal]').forEach(button => button.addEventListener('click', () => reviewAppeal(Number(button.dataset.acceptAppeal), 'accepted')));
  $$('[data-deny-appeal]').forEach(button => button.addEventListener('click', () => reviewAppeal(Number(button.dataset.denyAppeal), 'denied')));
  $('#applicationThreadForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = $('#applicationThreadInput');
    if (!input?.value.trim()) return;
    if (state.queue === 'tickets') {
      pushTicketMessage(item, input.value);
      input.value = '';
      save(); renderTickets(); renderQueue();
      return;
    }
    (item.messages ||= []).push({ from: state.user?.username || 'Staff', text: input.value.trim(), time: 'Just now', discordId: state.user?.id || null, avatar: state.user?.avatar || null, role: state.role });
    input.value = '';
    save(); renderQueue();
  });
}

async function loadPortalConfig() {
  try {
    const response = await fetch(apiUrl('/portal/config'), { credentials: 'include' });
    if (!response.ok) throw new Error('Portal config unavailable');
    const config = await response.json();
    window.DISCORD_PORTAL_CONFIG = { ...window.DISCORD_PORTAL_CONFIG, ...config };
  } catch {
    console.warn('Could not load roles from bot API. Check apiBaseUrl in discord-config.js and that the bot is running.');
  }
}

async function loadOnlineStaff() {
  try {
    const response = await fetch(apiUrl('/staff/online'), { credentials: 'include' });
    if (!response.ok) throw new Error('Staff status unavailable');
    const { staff } = await response.json();
    const count = staff.length;
    $('#onlineCount').textContent = `• ${count} online`;
    $('#sidebarStatus').textContent = count ? `${count} staff online` : 'No staff online';
    $('#heroStaffCount').textContent = count;
    $('#serverHealth').textContent = count ? `● ${count} team member${count === 1 ? '' : 's'} active` : '● No staff online';
    $('#onlineStaff').innerHTML = staff.length
      ? staff.map(person => `<div><div class="staff-avatar blue">${person.avatar ? `<img src="${avatarUrl(person.id, person.avatar)}" alt="">` : escape(person.name[0])}</div><span><b>${escape(person.name)}</b><small>${escape(roleLabel(person.role))}</small></span><i title="${escape(person.status || 'online')}">•</i></div>`).join('')
      : '<div class="empty-block">No staff are online in Discord right now.</div>';
  } catch {
    $('#onlineCount').textContent = '• Unavailable';
    $('#sidebarStatus').textContent = 'Staff status unavailable';
    $('#heroStaffCount').textContent = '—';
    $('#serverHealth').textContent = '● Staff status unavailable';
    $('#onlineStaff').innerHTML = '<div class="empty-block">Could not load staff presence. Try again shortly.</div>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setRole('member');
  await loadPortalConfig();
  renderTickets(); renderApplications(); renderAppeals(); renderNotifications(); renderChat(); renderQueue();
  await syncAuth();
  loadOnlineStaff();
  updateNotificationBadge();
  setInterval(loadOnlineStaff, 60000); $$('[data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page))); $$('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go))); $('#notificationButton')?.addEventListener('click', () => navigate('notifications')); $('#viewStaffApplications')?.addEventListener('click', () => { state.queue = 'applications'; state.selected = 0; $$('[data-queue]').forEach(item => item.classList.toggle('active', item.dataset.queue === 'applications')); navigate('staff'); }); $('#accountButton').addEventListener('click', () => state.authenticated ? $('#roleMenu').classList.toggle('open') : login()); $('#openTicket').addEventListener('click', () => openModal('ticket')); $('#openAppeal').addEventListener('click', () => openModal('appeal')); $$('[data-application]').forEach(button => button.addEventListener('click', () => openModal('application', button.dataset.application))); $('#modalClose').addEventListener('click', () => $('#modal').classList.remove('open')); $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) $('#modal').classList.remove('open'); }); $('#modalForm').addEventListener('submit', submitModal); $('#formCategory').addEventListener('change', renderQuestions); $('#newChat').addEventListener('click', () => { const title = window.prompt('Name this conversation'); if (!title?.trim()) return; const id = `chat-${Date.now()}`; state.chats[id] = { title: title.trim(), messages: [] }; state.conversation = id; save(); renderChat(); }); $('#conversationList').addEventListener('click', event => { const button = event.target.closest('[data-conversation]'); if (button) { state.conversation = button.dataset.conversation; renderChat(); } }); $('#chatForm').addEventListener('submit', event => { event.preventDefault(); const input = $('#chatInput'); if (!input.value.trim() || !state.chats[state.conversation]) return; state.chats[state.conversation].messages.push({ from: 'You', text: input.value.trim(), time: 'Just now' }); input.value = ''; save(); renderChat(); }); $$('[data-queue]').forEach(button => button.addEventListener('click', () => { if (button.dataset.queue === 'appeals' && !canReviewAppeals()) return toast('Only Management and Core Team can review ban appeals.'); if (button.dataset.queue === 'applications' && !canViewApplicationsQueue()) return toast('You do not have permission to review applications.'); state.queue = button.dataset.queue; state.selected = 0; $$('[data-queue]').forEach(item => item.classList.toggle('active', item === button)); renderQueue(); })); $('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open')); $('#themeToggle').addEventListener('click', () => document.body.classList.toggle('high-contrast')); $('#ackRules').addEventListener('click', () => toast('Rules acknowledged - thank you.')); $('#refreshQueue')?.addEventListener('click', () => { renderQueue(); toast('Review queue refreshed.'); }); });

document.addEventListener('DOMContentLoaded', () => {
  $('#ticketRows').addEventListener('click', event => {
    const row = event.target.closest('[data-ticket]');
    if (!row) return;
    const ticket = state.tickets.find(item => String(item.id) === row.dataset.ticket);
    if (!ticket) return;
    openTicketView(ticket);
  });
  $('#ticketViewClose').addEventListener('click', () => $('#ticketViewModal').classList.remove('open'));
  $('#ticketViewModal').addEventListener('click', event => {
    if (event.target === $('#ticketViewModal')) $('#ticketViewModal').classList.remove('open');
  });
  $('#ticketViewModal').addEventListener('submit', event => {
    if (event.target.id !== 'ticketThreadForm') return;
    event.preventDefault();
    const ticket = state.tickets[state.activeTicket];
    const input = $('#ticketThreadInput');
    if (!ticket || !input?.value.trim()) return;
    pushTicketMessage(ticket, input.value);
    input.value = '';
    save();
    openTicketView(ticket);
    renderTickets();
    renderQueue();
  });
  $('#ticketMore').addEventListener('click', () => {
    const ticket = state.tickets[state.activeTicket];
    $('#deleteTicket').textContent = ticket?.status === 'Closed' ? 'Reopen ticket' : 'Close ticket';
    $('#ticketMenu').classList.toggle('open');
  });
  $('#deleteTicket').addEventListener('click', () => {
    const ticket = state.tickets[state.activeTicket];
    if (!ticket) return;
    ticket.status = ticket.status === 'Closed' ? 'Open' : 'Closed';
    save();
    renderTickets();
    openTicketView(ticket);
    $('#ticketMenu').classList.remove('open');
    toast(ticket.status === 'Closed' ? 'Ticket closed.' : 'Ticket reopened.');
  });
});
