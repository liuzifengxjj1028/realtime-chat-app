// WebSocket 连接
let ws = null;
let currentUser = null;
let currentChatWith = null;
let contacts = new Map();
let messages = new Map(); // 存储每个对话的消息

// DOM 元素
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const nicknameInput = document.getElementById('nickname-input');
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');
const currentUserName = document.getElementById('current-user-name');
const contactsList = document.getElementById('contacts-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const imageInput = document.getElementById('image-input');
const chatWithName = document.getElementById('chat-with-name');

// 连接 WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket 连接已建立');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        errorMsg.textContent = '连接失败，请刷新页面重试';
    };

    ws.onclose = () => {
        console.log('WebSocket 连接已关闭');
        setTimeout(connectWebSocket, 3000); // 3秒后重连
    };
}

// 处理接收到的消息
function handleMessage(data) {
    console.log('收到消息:', data);

    switch(data.type) {
        case 'register_success':
            onRegisterSuccess(data);
            break;
        case 'register_error':
            errorMsg.textContent = data.message;
            loginBtn.disabled = false;
            break;
        case 'users_list':
            updateContactsList(data.users);
            break;
        case 'new_message':
            receiveMessage(data);
            break;
        case 'message_read':
            markMessageAsRead(data);
            break;
        case 'user_online':
            addContact(data.username);
            break;
        case 'user_offline':
            removeContact(data.username);
            break;
    }
}

// 注册成功
function onRegisterSuccess(data) {
    currentUser = data.username;
    currentUserName.textContent = currentUser;
    loginScreen.style.display = 'none';
    chatScreen.style.display = 'block';

    // 更新用户列表
    updateContactsList(data.users);
}

// 更新通讯录
function updateContactsList(users) {
    contacts.clear();
    contactsList.innerHTML = '';

    users.forEach(user => {
        if (user !== currentUser) {
            contacts.set(user, true);
            addContactToList(user);
        }
    });
}

// 添加联系人到列表
function addContactToList(username) {
    const contactItem = document.createElement('div');
    contactItem.className = 'contact-item';
    contactItem.dataset.username = username;
    contactItem.innerHTML = `
        <div class="name">
            <span class="online-indicator"></span>
            ${username}
        </div>
        <div class="status">在线</div>
    `;

    contactItem.addEventListener('click', () => {
        selectContact(username);
    });

    contactsList.appendChild(contactItem);
}

// 添加新上线的联系人
function addContact(username) {
    if (username !== currentUser && !contacts.has(username)) {
        contacts.set(username, true);
        addContactToList(username);
    }
}

// 移除下线的联系人
function removeContact(username) {
    contacts.delete(username);
    const contactItem = contactsList.querySelector(`[data-username="${username}"]`);
    if (contactItem) {
        contactItem.remove();
    }

    // 如果正在和这个人聊天，清空聊天窗口
    if (currentChatWith === username) {
        currentChatWith = null;
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3>用户已离线</h3>
                <p>选择其他联系人继续聊天</p>
            </div>
        `;
        messageInput.disabled = true;
        sendBtn.disabled = true;
        chatWithName.textContent = '选择一个联系人开始聊天';
    }
}

// 选择联系人
function selectContact(username) {
    currentChatWith = username;
    chatWithName.textContent = username;

    // 更新联系人列表样式
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.remove('active');
    });
    const selectedContact = contactsList.querySelector(`[data-username="${username}"]`);
    if (selectedContact) {
        selectedContact.classList.add('active');
    }

    // 启用输入
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    // 加载聊天记录
    loadChatHistory(username);

    // 发送已读回执
    sendReadReceipt(username);
}

// 加载聊天记录
function loadChatHistory(username) {
    messagesContainer.innerHTML = '';

    const chatKey = getChatKey(currentUser, username);
    const chatMessages = messages.get(chatKey) || [];

    if (chatMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3>开始对话</h3>
                <p>发送第一条消息吧</p>
            </div>
        `;
    } else {
        chatMessages.forEach(msg => {
            displayMessage(msg);
        });
    }
}

// 获取聊天记录的 key
function getChatKey(user1, user2) {
    return [user1, user2].sort().join('_');
}

// 发送消息
function sendMessage() {
    const text = messageInput.value.trim();

    if (!text || !currentChatWith) return;

    const message = {
        type: 'send_message',
        to: currentChatWith,
        content: text,
        content_type: 'text',
        timestamp: Date.now()
    };

    ws.send(JSON.stringify(message));

    // 添加到本地消息列表
    const chatKey = getChatKey(currentUser, currentChatWith);
    if (!messages.has(chatKey)) {
        messages.set(chatKey, []);
    }
    messages.get(chatKey).push({
        ...message,
        from: currentUser,
        read: false
    });

    // 显示消息
    displayMessage({
        ...message,
        from: currentUser,
        read: false
    });

    messageInput.value = '';
}

// 发送图片
function sendImage(file) {
    if (!currentChatWith) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const message = {
            type: 'send_message',
            to: currentChatWith,
            content: e.target.result,
            content_type: 'image',
            timestamp: Date.now()
        };

        ws.send(JSON.stringify(message));

        // 添加到本地消息列表
        const chatKey = getChatKey(currentUser, currentChatWith);
        if (!messages.has(chatKey)) {
            messages.set(chatKey, []);
        }
        messages.get(chatKey).push({
            ...message,
            from: currentUser,
            read: false
        });

        // 显示消息
        displayMessage({
            ...message,
            from: currentUser,
            read: false
        });
    };
    reader.readAsDataURL(file);
}

// 接收消息
function receiveMessage(data) {
    const chatKey = getChatKey(currentUser, data.from);

    if (!messages.has(chatKey)) {
        messages.set(chatKey, []);
    }
    messages.get(chatKey).push(data);

    // 如果正在和发送者聊天，显示消息并发送已读回执
    if (currentChatWith === data.from) {
        displayMessage(data);
        sendReadReceipt(data.from);
    }
}

// 显示消息
function displayMessage(msg) {
    // 移除空状态
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.from === currentUser ? 'sent' : 'received'}`;
    messageDiv.dataset.timestamp = msg.timestamp;

    const contentDiv = document.createElement('div');
    contentDiv.className = `message-content ${msg.read ? 'read' : ''}`;

    if (msg.content_type === 'image') {
        const img = document.createElement('img');
        img.src = msg.content;
        contentDiv.appendChild(img);
    } else {
        contentDiv.textContent = msg.content;
    }

    messageDiv.appendChild(contentDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(msg.timestamp);
    messageDiv.appendChild(timeDiv);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 发送已读回执
function sendReadReceipt(username) {
    ws.send(JSON.stringify({
        type: 'mark_as_read',
        from: username
    }));
}

// 标记消息为已读
function markMessageAsRead(data) {
    const chatKey = getChatKey(currentUser, data.user);
    const chatMessages = messages.get(chatKey) || [];

    // 更新本地消息状态
    chatMessages.forEach(msg => {
        if (msg.from === currentUser && msg.to === data.user) {
            msg.read = true;
        }
    });

    // 如果正在查看这个对话，更新UI
    if (currentChatWith === data.user) {
        document.querySelectorAll('.message.sent .message-content').forEach(content => {
            content.classList.add('read');
        });
    }
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// 事件监听
loginBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();

    if (!nickname) {
        errorMsg.textContent = '请输入昵称';
        return;
    }

    if (nickname.length > 20) {
        errorMsg.textContent = '昵称不能超过20个字符';
        return;
    }

    loginBtn.disabled = true;
    errorMsg.textContent = '';

    // 连接 WebSocket 并注册
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        // 等待连接建立
        const checkConnection = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                ws.send(JSON.stringify({
                    type: 'register',
                    username: nickname
                }));
            }
        }, 100);
    } else {
        ws.send(JSON.stringify({
            type: 'register',
            username: nickname
        }));
    }
});

nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        sendImage(file);
    }
    e.target.value = ''; // 清空选择
});

// 页面加载时连接 WebSocket
window.addEventListener('load', () => {
    connectWebSocket();
});
