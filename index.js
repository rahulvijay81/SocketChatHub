const express = require('express');
const path = require('path');
const os = require('os');
require('dotenv').config();
const { initializeWebSocketServer } = require('./src/websocket/server');
const { initializeDatabase, getDatabase } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await initializeDatabase();

        const app = express();
        app.use(express.static(path.join(__dirname, '/public')));

        const address = Object.values(os.networkInterfaces()).flat()
            .find((iface) => iface.family === 'IPv4' && !iface.internal);
        const ip = address ? address.address : 'localhost';

        const server = app.listen(PORT, '0.0.0.0', () =>
            console.log(`HTTP server running on http://${ip}:${PORT}`)
        );

        const { getConnectedUsers } = initializeWebSocketServer(server);
        console.log('WebSocket server running');

        /* -------- Admin middleware -------- */
        const requireAdmin = (req, res, next) => {
            const adminKey = process.env.ADMIN_KEY;
            if (!adminKey || req.query.key !== adminKey) {
                return res.status(401).send('Unauthorized');
            }
            next();
        };

        /* -------- GET /admin — dashboard page -------- */
        app.get('/admin', requireAdmin, (req, res) => {
            res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin — SocketChatHub</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#0b0d15;color:#eef0f7;padding:32px}
  h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .sub{color:#8b8fa3;font-size:13px;margin-bottom:24px}
  .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;background:rgba(52,211,153,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3);margin-left:10px}
  table{width:100%;border-collapse:collapse;background:rgba(255,255,255,0.04);border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)}
  th{text-align:left;padding:12px 18px;font-size:12px;font-weight:600;color:#8b8fa3;text-transform:uppercase;letter-spacing:.5px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.08)}
  td{padding:13px 18px;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05)}
  tr:last-child td{border-bottom:none}
  .ip{font-family:monospace;color:#9b5cff;font-size:13px}
  .time{color:#8b8fa3;font-size:12px}
  .avatar{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;font-size:11px;font-weight:700;color:#fff;margin-right:8px;vertical-align:middle}
  .empty{text-align:center;padding:40px;color:#6b6f83}
  .actions{display:flex;gap:12px;margin-top:24px}
  .btn{padding:10px 20px;border-radius:10px;border:none;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s}
  .btn-danger{background:#f87171;color:#fff}.btn-danger:hover{opacity:.85}
  .btn-refresh{background:rgba(255,255,255,0.08);color:#eef0f7;border:1px solid rgba(255,255,255,0.1)}.btn-refresh:hover{opacity:.85}
  .toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;background:#34d399;color:#0b0d15;border-radius:10px;font-weight:600;font-size:14px;opacity:0;transition:opacity .3s}
  .toast.show{opacity:1}
  .colors{--c0:linear-gradient(135deg,#3b82f6,#6366f1);--c1:linear-gradient(135deg,#ec4899,#8b5cf6);--c2:linear-gradient(135deg,#14b8a6,#3b82f6);--c3:linear-gradient(135deg,#f59e0b,#ec4899);--c4:linear-gradient(135deg,#10b981,#14b8a6);--c5:linear-gradient(135deg,#f97316,#ef4444);--c6:linear-gradient(135deg,#06b6d4,#3b82f6)}
</style>
</head>
<body class="colors">
<h1>Admin Dashboard <span class="badge" id="countBadge">0 online</span></h1>
<p class="sub">Connected users — auto-refreshes every 10s &nbsp;|&nbsp; Key: ${req.query.key}</p>

<table>
  <thead><tr><th>User</th><th>IP Address</th><th>Connected At</th></tr></thead>
  <tbody id="tbody"><tr><td colspan="3" class="empty">Loading…</td></tr></tbody>
</table>

<div class="actions">
  <button class="btn btn-refresh" onclick="load()">↻ Refresh Now</button>
  <button class="btn btn-danger" onclick="clearChat()">🗑 Clear Chat</button>
</div>

<div class="toast" id="toast"></div>

<script>
const KEY = new URLSearchParams(location.search).get('key');
const COLORS = ['--c0','--c1','--c2','--c3','--c4','--c5','--c6'];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % 7;
  return COLORS[h];
}

function showToast(msg, ok = true) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = ok ? '#34d399' : '#f87171';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

async function load() {
  try {
    const res = await fetch('/admin/users?key=' + KEY);
    if (!res.ok) { showToast('Unauthorized', false); return; }
    const { users } = await res.json();
    const tbody = document.getElementById('tbody');
    document.getElementById('countBadge').textContent = users.length + ' online';
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No users connected</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => {
      const color = hashColor(u.username);
      const initial = u.username.charAt(0).toUpperCase();
      const joined = new Date(u.joinedAt).toLocaleString();
      return \`<tr>
        <td><span class="avatar" style="background:var(\${color})">\${initial}</span>\${u.username}</td>
        <td class="ip">\${u.ip}</td>
        <td class="time">\${joined}</td>
      </tr>\`;
    }).join('');
  } catch (e) { showToast('Failed to load', false); }
}

async function clearChat() {
  if (!confirm('Clear all messages?')) return;
  const res = await fetch('/admin/clear-chat?key=' + KEY);
  const data = await res.json();
  showToast(res.ok ? '✓ Chat cleared' : data.error, res.ok);
}

load();
setInterval(load, 10000);
</script>
</body>
</html>`);
        });

        /* -------- GET /admin/users — JSON API -------- */
        app.get('/admin/users', requireAdmin, (req, res) => {
            res.json({ users: getConnectedUsers() });
        });

        /* -------- GET /admin/clear-chat -------- */
        app.get('/admin/clear-chat', requireAdmin, async (req, res) => {
            try {
                await getDatabase().query('TRUNCATE TABLE messages');
                console.log('Messages table cleared by admin');
                return res.json({ success: true, message: 'All messages cleared.' });
            } catch (err) {
                console.error('Error clearing messages:', err);
                return res.status(500).json({ error: 'Failed to clear messages' });
            }
        });

    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();
