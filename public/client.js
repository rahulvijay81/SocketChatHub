const STORAGE_KEY = 'chatUsername';

const joinScreen = document.getElementById('joinScreen');
const chatScreen = document.getElementById('chatScreen');
const status = document.getElementById('status');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('joinBtn');
const messagesList = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPanel = document.getElementById('emojiPanel');
const typingEl = document.getElementById('typing');
const typingText = typingEl.querySelector('.typing-text');
const onlineCount = document.getElementById('onlineCount');
const mentionDropdown = document.getElementById('mentionDropdown');

const EMOJIS = ['😀','😂','😍','😊','😎','🥳','😢','😡','👍','👎','🙏','👏','❤️','🔥','🎉','✨','💯','😅','🤔','😴','🤯','😇','🤗','😘','🥰','😜','🤪','😭','😤','😱','💀','👀','💪','🫶','🤝','💔','🎂','⚽','🏆','🚀','🌙','☀️','🌈','🍕','☕'];

let ws;
let username = localStorage.getItem(STORAGE_KEY) || '';
let reconnectTimer = null;
let reconnectAttempts = 0;
let typingTimer = null;
let typingTimeout = null;
const MAX_RECONNECT_ATTEMPTS = 10;

/* ---------- Online users (for mention dropdown) ---------- */
let onlineUsers = [];
let mentionIndex = -1;

/* ---------- Helpers ---------- */
function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function updateStatus(text, state) {
  status.className = `status status-${state}`;
  status.querySelector('span').textContent = text;
}

function avatarClass(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % 7;
  return `a-${hash}`;
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  messagesList.scrollTop = messagesList.scrollHeight;
}

/* ---------- Render message content with @mention highlights ---------- */
function renderContent(content) {
  const span = document.createElement('span');
  const parts = content.split(/(@\w+)/g);
  parts.forEach((part) => {
    if (/^@\w+$/.test(part)) {
      const chip = document.createElement('span');
      chip.className = 'mention-chip';
      chip.textContent = part;
      span.appendChild(chip);
    } else {
      span.appendChild(document.createTextNode(part));
    }
  });
  return span;
}

/* ---------- Render a message ---------- */
function appendMessage(sender, content, isSelf, timestamp) {
  const isMentioned = false; // highlight removed
  const row = document.createElement('div');
  row.className = 'msg' + (isSelf ? ' msg-self' : '');
  const initial = sender.charAt(0).toUpperCase();
  const name = isSelf ? 'You' : sender;
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : timeNow();
  row.innerHTML = `
    <div class="avatar ${avatarClass(sender)}">${initial}${isSelf ? '' : '<span class="status"></span>'}</div>
    <div class="msg-body">
      <div class="msg-head"><span class="name">${name}</span><span class="time">${time}</span></div>
      <div class="bubble"></div>
      <div class="reactions"></div>
    </div>
    <div class="hover-actions">
      <button data-action="react" title="React">😊</button>
      <button data-action="reply" title="Reply"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg></button>
      <button data-action="more" title="More"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>
    </div>`;
  row.querySelector('.bubble').appendChild(renderContent(content));
  messagesList.appendChild(row);
  scrollToBottom();
}

/* ---------- Reactions (client-side visual) ---------- */
function addReaction(row, emoji) {
  const reactions = row.querySelector('.reactions');
  const existing = Array.from(reactions.children).find((r) => r.dataset.emoji === emoji);
  if (existing) {
    existing.classList.remove('bounce');
    void existing.offsetWidth;
    existing.classList.add('bounce');
    return;
  }
  const btn = document.createElement('button');
  btn.className = 'reaction active';
  btn.dataset.emoji = emoji;
  btn.innerHTML = `${emoji} <span class="count">1</span>`;
  btn.classList.add('bounce');
  reactions.appendChild(btn);
}

function toggleReaction(btn) {
  btn.classList.remove('bounce');
  void btn.offsetWidth;
  btn.classList.add('bounce');
  const active = btn.classList.toggle('active');
  const count = parseInt(btn.querySelector('.count').textContent, 10);
  btn.querySelector('.count').textContent = active ? count + 1 : count - 1;
}

/* ---------- Mention dropdown ---------- */
function getMentionQuery() {
  const val = input.value;
  const cursor = input.selectionStart;
  // Walk back from cursor to find an @ that starts a word
  const before = val.slice(0, cursor);
  const match = before.match(/@(\w*)$/);
  return match ? match[1] : null;
}

function showMentionDropdown(query) {
  const filtered = onlineUsers.filter(
    (u) => u.toLowerCase() !== username.toLowerCase() &&
           u.toLowerCase().startsWith(query.toLowerCase())
  );
  if (!filtered.length) { hideMentionDropdown(); return; }

  mentionDropdown.innerHTML = '';
  mentionIndex = -1;
  filtered.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'mention-item';
    item.dataset.index = i;
    item.innerHTML = `<span class="mention-avatar ${avatarClass(u)}">${u.charAt(0).toUpperCase()}</span><span class="mention-name">@${u}</span>`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep input focus
      insertMention(u);
    });
    mentionDropdown.appendChild(item);
  });
  mentionDropdown.classList.remove('hidden');
}

function hideMentionDropdown() {
  mentionDropdown.classList.add('hidden');
  mentionIndex = -1;
}

function updateMentionActive() {
  Array.from(mentionDropdown.children).forEach((el, i) => {
    el.classList.toggle('mention-active', i === mentionIndex);
  });
}

function insertMention(user) {
  const val = input.value;
  const cursor = input.selectionStart;
  const before = val.slice(0, cursor);
  const after = val.slice(cursor);
  const replaced = before.replace(/@(\w*)$/, `@${user} `);
  input.value = replaced + after;
  input.selectionStart = input.selectionEnd = replaced.length;
  hideMentionDropdown();
  input.focus();
}

/* ---------- WebSocket ---------- */
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${location.host}`);

  ws.onopen = () => {
    reconnectAttempts = 0;
    updateStatus('Connected', 'online');
    if (username) sendJoin();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.error) { alert(data.error); return; }

    switch (data.type) {
      case 'sentMessage':
        appendMessage(username, data.content, true, data.timestamp);
        break;
      case 'receivedMessage':
        appendMessage(data.username, data.content, false, data.timestamp);
        break;
      case 'typing':
        if (data.username !== username) showTyping(data.username);
        break;
      case 'stopTyping':
        if (data.username !== username) hideTyping();
        break;
      case 'userCount':
        onlineCount.textContent = data.count;
        break;
      case 'userList':
        onlineUsers = data.users;
        break;
    }
  };

  ws.onclose = () => {
    if (username) {
      updateStatus('Disconnected — reconnecting…', 'offline');
      scheduleReconnect();
    } else {
      updateStatus('Disconnected', 'offline');
    }
  };

  ws.onerror = () => updateStatus('Connection error', 'offline');
}

function sendJoin() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ username }));
  }
}

function scheduleReconnect() {
  if (reconnectTimer || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
}

function showChat() {
  joinScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  input.focus();
}

function join(name) {
  const trimmed = name.trim();
  if (!trimmed) { alert('Please enter a valid username'); return; }
  username = trimmed;
  localStorage.setItem(STORAGE_KEY, username);
  showChat();
  sendJoin();
}

/* ---------- Typing ---------- */
function showTyping(name) {
  typingText.textContent = `${name} is typing...`;
  typingEl.classList.add('active');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(hideTyping, 3000);
}
function hideTyping() {
  typingEl.classList.remove('active');
}

/* ---------- Send ---------- */
function sendMessage() {
  const content = input.value.trim();
  if (!content || !username) return;
  safeSend({ messageType: 'text', content });
  input.value = '';
  hideMentionDropdown();
  input.focus();
}

/* ---------- Emoji picker ---------- */
function populateEmojis() {
  EMOJIS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      input.value += emoji;
      input.focus();
      emojiPanel.classList.add('hidden');
    });
    emojiPanel.appendChild(btn);
  });
}
populateEmojis();

emojiBtn.addEventListener('click', () => emojiPanel.classList.toggle('hidden'));
document.addEventListener('click', (e) => {
  if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) emojiPanel.classList.add('hidden');
  if (!mentionDropdown.contains(e.target) && e.target !== input) hideMentionDropdown();
});

/* ---------- Events ---------- */
joinBtn.addEventListener('click', () => join(usernameInput.value));
usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(usernameInput.value); });

input.addEventListener('input', () => {
  if (!username) return;
  safeSend({ type: 'typing' });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => safeSend({ type: 'stopTyping' }), 2000);

  // Mention autocomplete
  const query = getMentionQuery();
  if (query !== null) {
    showMentionDropdown(query);
  } else {
    hideMentionDropdown();
  }
});

input.addEventListener('keydown', (e) => {
  // Navigate mention dropdown
  if (!mentionDropdown.classList.contains('hidden')) {
    const items = mentionDropdown.children;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionIndex = (mentionIndex + 1) % items.length;
      updateMentionActive();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionIndex = (mentionIndex - 1 + items.length) % items.length;
      updateMentionActive();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const selectIndex = mentionIndex >= 0 ? mentionIndex : 0;
      if (items.length > 0) {
        e.preventDefault();
        const name = items[selectIndex].querySelector('.mention-name').textContent.slice(1);
        insertMention(name);
        return;
      }
    }
    if (e.key === 'Escape') { hideMentionDropdown(); return; }
  }
  if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});

sendBtn.addEventListener('click', (e) => {
  const circle = document.createElement('span');
  const d = Math.max(sendBtn.clientWidth, sendBtn.clientHeight);
  circle.className = 'ripple';
  circle.style.width = circle.style.height = d + 'px';
  circle.style.left = (e.clientX - sendBtn.getBoundingClientRect().left - d / 2) + 'px';
  circle.style.top = (e.clientY - sendBtn.getBoundingClientRect().top - d / 2) + 'px';
  sendBtn.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
  sendMessage();
});

/* ---------- Message interactions ---------- */
messagesList.addEventListener('click', (e) => {
  const reaction = e.target.closest('.reaction');
  if (reaction) { toggleReaction(reaction); return; }

  const action = e.target.closest('[data-action]');
  if (!action) return;
  const row = action.closest('.msg');
  if (action.dataset.action === 'react') addReaction(row, '👍');
  if (action.dataset.action === 'reply') input.focus();
});

/* ---------- Boot ---------- */
if (username) showChat();
connect();
