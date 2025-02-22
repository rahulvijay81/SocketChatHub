
const ws = new WebSocket('ws://11.0.244.63:3000');
const messagesList = document.getElementById('messages');
const usernameInput = document.getElementById('username');
const setUsernameButton = document.getElementById('setUsername');
const messageInput = document.getElementById('message');
const sendButton = document.getElementById('send');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = typingIndicator.querySelector('.typing-text');

let username = '';
let typingTimeout = null;

setUsernameButton.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        ws.send(JSON.stringify({ username }));
        usernameInput.disabled = true;
        setUsernameButton.disabled = true;
        messageInput.disabled = false;
        sendButton.disabled = false;
        setUsernameButton.textContent = 'Connected';
        setUsernameButton.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
    } else {
        alert('Please enter a valid username');
    }
});

ws.onopen = () => {
    console.log('Connected to WebSocket server');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.error) {
        alert(data.error);
        return;
    }

    switch (data.type) {
        case 'sentMessage':
            appendMessage(username, data.message, true);
            break;

        case 'receivedMessage':
            appendMessage(data.username, data.message, false);
            break;

        case 'typing':
        case 'typing':
            if (data.username !== username) {
                showTypingIndicator(data.username);
            }
            break;

        case 'stopTyping':
            if (data.username !== username) {
                hideTypingIndicator();
            }
        case 'userCount':
            updateOnlineUsers(data.count);
            break;
    }
};

const onlineCountElement = document.getElementById('onlineCount');

function updateOnlineUsers(count) {
    console.log("updated online user count to", count);
    
    onlineCountElement.textContent = count;
}

ws.onclose = () => {
    alert('Connection lost. Please refresh to reconnect.');
    disableChat();
};

ws.onerror = () => {
    alert('Connection error occurred. Please refresh the page.');
    disableChat();
};

let typingTimer;
messageInput.addEventListener('input', () => {
    if (!username) return;

    // Send typing indicator
    ws.send(JSON.stringify({
        type: 'typing',
        username
    }));

    // Clear any existing timer
    clearTimeout(typingTimer);

    // Set new timer to send stop typing
    typingTimer = setTimeout(() => {
        ws.send(JSON.stringify({
            type: 'stopTyping',
            username
        }));
    }, 2000);
});

messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

sendButton.addEventListener('click', sendMessage);

function showTypingIndicator(typingUsername) {
    const typingText = document.querySelector('.typing-text');
    typingText.textContent = `${typingUsername} is typing`;
    typingIndicator.classList.add('active');

    // Clear any existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }

    // Set new timeout
    typingTimeout = setTimeout(hideTypingIndicator, 3000);
}

function hideTypingIndicator() {
    typingIndicator.classList.remove('active');
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && username) {
        ws.send(JSON.stringify({ message }));
        messageInput.value = '';
        messageInput.focus();
    }
}

function appendMessage(sender, message, isSent) {
    const container = document.createElement('div');
    container.className = `message-container ${isSent ? 'sent' : 'received'}`;

    if (!isSent) {
        const usernameDiv = document.createElement('div');
        usernameDiv.className = 'username';
        usernameDiv.textContent = sender;
        container.appendChild(usernameDiv);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message;

    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    container.appendChild(bubble);
    container.appendChild(timestamp);
    messagesList.appendChild(container);

    messagesList.scrollTop = messagesList.scrollHeight;
}

function disableChat() {
    messageInput.disabled = true;
    sendButton.disabled = true;
    setUsernameButton.disabled = true;
    usernameInput.disabled = true;
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && username) {
        ws.send(JSON.stringify({ type: 'active', username }));
    }
});