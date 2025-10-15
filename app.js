// WebSocket 连接
let ws = null;
let currentUser = null;
let currentUserId = null; // 用户唯一ID
let currentChatWith = null;
let currentChatType = null; // 'user' or 'group'
let contacts = new Map();
let groups = new Map(); // 存储群组信息 {groupId: {name, members}}
let messages = new Map(); // 存储每个对话的消息
let quotedMessage = null; // 当前被引用的消息
let currentReadDetailMessage = null; // 当前正在显示阅读详情的消息

// 用户ID管理
function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getUserCredentials() {
    const stored = localStorage.getItem('chat_user_credentials');
    return stored ? JSON.parse(stored) : null;
}

function saveUserCredentials(userId, username) {
    localStorage.setItem('chat_user_credentials', JSON.stringify({ userId, username }));
}

function clearUserCredentials() {
    localStorage.removeItem('chat_user_credentials');
}

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
const createGroupBtn = document.getElementById('create-group-btn');
const createGroupModal = document.getElementById('create-group-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelGroupBtn = document.getElementById('cancel-group-btn');
const confirmGroupBtn = document.getElementById('confirm-group-btn');
const groupNameInput = document.getElementById('group-name-input');
const memberList = document.getElementById('member-list');
const logoutBtn = document.getElementById('logout-btn');
const quotePreview = document.getElementById('quote-preview');
const quoteUser = document.getElementById('quote-user');
const quoteContent = document.getElementById('quote-content');
const cancelQuoteBtn = document.getElementById('cancel-quote');
const readDetailModal = document.getElementById('read-detail-modal');
const closeReadDetailBtn = document.getElementById('close-read-detail-btn');
const readList = document.getElementById('read-list');
const unreadList = document.getElementById('unread-list');
const readCount = document.getElementById('read-count');
const unreadCount = document.getElementById('unread-count');

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
        case 'message_recalled':
            handleMessageRecalled(data);
            break;
        case 'user_online':
            addContact(data.username);
            break;
        case 'user_offline':
            removeContact(data.username);
            break;
        case 'group_created':
            onGroupCreated(data);
            break;
        case 'group_list':
            updateGroupsList(data.groups);
            break;
        case 'new_group_message':
            receiveGroupMessage(data);
            break;
        case 'group_message_read_update':
            handleGroupMessageReadUpdate(data);
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
    // 不清空contacts，只更新在线状态
    // 先将所有现有联系人标记为离线
    contacts.forEach((value, username) => {
        contacts.set(username, {online: false});
    });

    // 更新在线用户状态
    users.forEach(user => {
        if (user !== currentUser) {
            contacts.set(user, {online: true});
        }
    });

    // 重新渲染列表
    contactsList.innerHTML = '';
    contacts.forEach((value, username) => {
        addContactToList(username, value.online);
    });
}

// 添加联系人到列表
function addContactToList(username, isOnline = true) {
    const contactItem = document.createElement('div');
    contactItem.className = 'contact-item';
    contactItem.dataset.username = username;

    const statusText = isOnline ? '在线' : '离线';
    const indicatorColor = isOnline ? '#07c160' : '#ccc';
    const opacity = isOnline ? '1' : '0.6';

    contactItem.innerHTML = `
        <div class="name">
            <span class="online-indicator" style="background-color: ${indicatorColor};"></span>
            ${username}
        </div>
        <div class="status">${statusText}</div>
    `;

    contactItem.style.opacity = opacity;

    contactItem.addEventListener('click', () => {
        selectContact(username);
    });

    contactsList.appendChild(contactItem);
}

// 添加新上线的联系人或更新在线状态
function addContact(username) {
    if (username === currentUser) return;

    if (!contacts.has(username)) {
        // 新联系人，添加到列表
        contacts.set(username, {online: true});
        addContactToList(username);
    } else {
        // 已存在的联系人上线，更新状态
        contacts.set(username, {online: true});
        setContactOnlineStatus(username, true);
    }
}

// 标记联系人为离线（不删除）
function removeContact(username) {
    if (contacts.has(username)) {
        contacts.set(username, {online: false});
        setContactOnlineStatus(username, false);
    }
}

// 设置联系人在线/离线状态
function setContactOnlineStatus(username, isOnline) {
    const contactItem = contactsList.querySelector(`[data-username="${username}"]`);
    if (contactItem) {
        const statusDiv = contactItem.querySelector('.status');
        const indicator = contactItem.querySelector('.online-indicator');

        if (isOnline) {
            statusDiv.textContent = '在线';
            indicator.style.backgroundColor = '#07c160';
            contactItem.style.opacity = '1';
        } else {
            statusDiv.textContent = '离线';
            indicator.style.backgroundColor = '#ccc';
            contactItem.style.opacity = '0.6';
        }
    }
}

// 选择联系人
function selectContact(username) {
    currentChatWith = username;
    currentChatType = 'user';
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
function loadChatHistory(chatWith) {
    messagesContainer.innerHTML = '';

    // 对于群聊直接使用group_id，对于私聊使用getChatKey
    const chatKey = currentChatType === 'group' ? chatWith : getChatKey(currentUser, chatWith);
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

            // 如果是群聊，为所有不是自己发送的消息发送已读回执
            if (currentChatType === 'group' && msg.from !== currentUser) {
                sendGroupMessageReadReceipt(chatWith, msg.timestamp);
            }
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

    // 如果有引用消息，添加引用信息
    if (quotedMessage) {
        message.quoted_message = {
            from: quotedMessage.from,
            content: quotedMessage.content_type === 'image' ? '[图片]' : quotedMessage.content,
            timestamp: quotedMessage.timestamp
        };
    }

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
    cancelQuote(); // 清除引用
}

// 发送图片
function sendImage(file) {
    if (!currentChatWith) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        let message, chatKey;

        if (currentChatType === 'group') {
            // 群聊图片
            message = {
                type: 'send_group_message',
                group_id: currentChatWith,
                content: e.target.result,
                content_type: 'image',
                timestamp: Date.now()
            };
            chatKey = currentChatWith;
        } else {
            // 私聊图片
            message = {
                type: 'send_message',
                to: currentChatWith,
                content: e.target.result,
                content_type: 'image',
                timestamp: Date.now()
            };
            chatKey = getChatKey(currentUser, currentChatWith);
        }

        ws.send(JSON.stringify(message));

        // 添加到本地消息列表
        if (!messages.has(chatKey)) {
            messages.set(chatKey, []);
        }

        // 如果是群聊，添加阅读状态字段
        let messageWithStatus = {
            ...message,
            from: currentUser,
            read: false
        };

        if (currentChatType === 'group') {
            const group = groups.get(currentChatWith);
            const groupMembers = group ? group.members : [];
            messageWithStatus.read_by = [currentUser];
            messageWithStatus.unread_members = groupMembers.filter(m => m !== currentUser);
        }

        messages.get(chatKey).push(messageWithStatus);

        // 显示消息
        displayMessage(messageWithStatus);
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

    // 如果不是自己发的消息，显示发送者名字
    if (msg.from !== currentUser) {
        const senderName = document.createElement('div');
        senderName.className = 'message-sender';
        senderName.textContent = msg.from;
        senderName.style.fontSize = '24px';
        senderName.style.color = '#666';
        senderName.style.marginBottom = '4px';
        messageDiv.appendChild(senderName);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = `message-content ${msg.read ? 'read' : ''}`;

    // 如果消息包含引用，在内容区域内部先显示引用（微信风格）
    if (msg.quoted_message) {
        const quotedDiv = document.createElement('div');
        const isSentMessage = msg.from === currentUser;

        if (isSentMessage) {
            // 自己发送的消息（蓝色气泡）
            quotedDiv.style.cssText = 'background: rgba(0,0,0,0.15); border-left: 2px solid rgba(255,255,255,0.5); padding: 4px 8px; margin-bottom: 6px; border-radius: 2px; cursor: pointer; font-size: 12px; line-height: 1.4;';
            quotedDiv.innerHTML = `<div style="color: rgba(255,255,255,0.95); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${msg.quoted_message.from}: ${msg.quoted_message.content || '[图片]'}</div>`;
        } else {
            // 接收的消息（灰色气泡）
            quotedDiv.style.cssText = 'background: rgba(0,0,0,0.06); border-left: 2px solid #b0b0b0; padding: 4px 8px; margin-bottom: 6px; border-radius: 2px; cursor: pointer; font-size: 12px; line-height: 1.4;';
            quotedDiv.innerHTML = `<div style="color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${msg.quoted_message.from}: ${msg.quoted_message.content || '[图片]'}</div>`;
        }

        // 点击引用跳转到原消息
        quotedDiv.onclick = (e) => {
            e.stopPropagation();
            scrollToQuotedMessage(msg.quoted_message.timestamp);
        };

        contentDiv.appendChild(quotedDiv);
    }

    // 添加实际的消息内容
    if (msg.content_type === 'image') {
        const img = document.createElement('img');
        img.src = msg.content;
        contentDiv.appendChild(img);
    } else {
        const textDiv = document.createElement('div');
        textDiv.textContent = msg.content;
        contentDiv.appendChild(textDiv);
    }

    messageDiv.appendChild(contentDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(msg.timestamp);
    messageDiv.appendChild(timeDiv);

    // 如果是自己发送的消息，添加撤回按钮
    if (msg.from === currentUser) {
        const recallBtn = document.createElement('button');
        recallBtn.className = 'recall-btn';
        recallBtn.textContent = '撤回';
        recallBtn.style.cssText = 'font-size: 11px; padding: 3px 8px; margin-left: 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; color: #fff; cursor: pointer; font-weight: 500;';
        recallBtn.onclick = () => recallMessage(msg.timestamp);
        timeDiv.appendChild(recallBtn);

        // 如果是群聊消息，显示阅读状态
        if (currentChatType === 'group' && msg.read_by && msg.unread_members) {
            const readStatusDiv = document.createElement('span');
            readStatusDiv.className = 'read-status';
            readStatusDiv.style.cssText = 'margin-left: 8px; font-size: 13px; color: #ffffff; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 10px; cursor: pointer; font-weight: 500;';

            const readByCount = msg.read_by.length;
            const unreadCount = msg.unread_members.length;

            if (unreadCount === 0) {
                readStatusDiv.innerHTML = '✓ 全部已读';
            } else {
                readStatusDiv.innerHTML = `${unreadCount}人未读，${readByCount}人已读`;
            }

            readStatusDiv.onclick = (e) => {
                e.stopPropagation();
                // 通过timestamp从messages中查找最新的消息对象
                const chatKey = currentChatWith;
                const chatMessages = messages.get(chatKey);
                if (chatMessages) {
                    const latestMsg = chatMessages.find(m => m.timestamp === msg.timestamp);
                    if (latestMsg) {
                        showReadDetail(latestMsg);
                    } else {
                        showReadDetail(msg); // 降级处理
                    }
                } else {
                    showReadDetail(msg); // 降级处理
                }
            };

            timeDiv.appendChild(readStatusDiv);
        }
    }

    // 添加长按/双击引用功能
    let pressTimer;
    messageDiv.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            quoteThisMessage(msg);
        }, 500);
    });
    messageDiv.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    });
    messageDiv.addEventListener('dblclick', () => {
        quoteThisMessage(msg);
    });

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

// 撤回消息
function recallMessage(timestamp) {
    if (!currentChatWith) return;

    const message = {
        type: 'recall_message',
        timestamp: timestamp
    };

    if (currentChatType === 'group') {
        message.group_id = currentChatWith;
    } else {
        message.to = currentChatWith;
    }

    ws.send(JSON.stringify(message));

    // 本地删除消息
    removeMessageFromUI(timestamp);
    removeMessageFromStore(timestamp);
}

// 从UI中删除消息
function removeMessageFromUI(timestamp) {
    const messageEl = messagesContainer.querySelector(`[data-timestamp="${timestamp}"]`);
    if (messageEl) {
        messageEl.remove();
    }
}

// 从本地存储中删除消息
function removeMessageFromStore(timestamp) {
    const chatKey = currentChatType === 'group' ? currentChatWith : getChatKey(currentUser, currentChatWith);
    const chatMessages = messages.get(chatKey);
    if (chatMessages) {
        const index = chatMessages.findIndex(msg => msg.timestamp === timestamp);
        if (index !== -1) {
            chatMessages.splice(index, 1);
        }
    }
}

// 接收撤回消息通知
function handleMessageRecalled(data) {
    removeMessageFromUI(data.timestamp);

    // 从相应的消息存储中删除
    if (data.group_id) {
        // 群聊消息
        const chatMessages = messages.get(data.group_id);
        if (chatMessages) {
            const index = chatMessages.findIndex(msg => msg.timestamp === data.timestamp);
            if (index !== -1) {
                chatMessages.splice(index, 1);
            }
        }
    } else {
        // 私聊消息
        const chatKey = getChatKey(currentUser, data.from);
        const chatMessages = messages.get(chatKey);
        if (chatMessages) {
            const index = chatMessages.findIndex(msg => msg.timestamp === data.timestamp);
            if (index !== -1) {
                chatMessages.splice(index, 1);
            }
        }
    }
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

// 引用消息相关函数
function quoteThisMessage(msg) {
    quotedMessage = msg;
    quotePreview.style.display = 'block';
    quoteUser.textContent = msg.from;
    quoteContent.textContent = msg.content_type === 'image' ? '[图片]' : msg.content;
    messageInput.focus();
}

function cancelQuote() {
    quotedMessage = null;
    quotePreview.style.display = 'none';
    quoteUser.textContent = '';
    quoteContent.textContent = '';
}

// 跳转到被引用的消息
function scrollToQuotedMessage(timestamp) {
    const targetMessage = messagesContainer.querySelector(`[data-timestamp="${timestamp}"]`);

    if (!targetMessage) {
        // 消息不在当前视图中（可能已被撤回或在其他对话中）
        return;
    }

    // 滚动到目标消息
    targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 添加高亮效果
    const originalTransition = targetMessage.style.transition;
    const originalBackground = window.getComputedStyle(targetMessage).backgroundColor;

    // 高亮动画
    targetMessage.style.transition = 'background-color 0.3s ease';
    targetMessage.style.backgroundColor = 'rgba(108, 92, 231, 0.3)'; // 紫色高亮

    setTimeout(() => {
        targetMessage.style.backgroundColor = originalBackground;
        setTimeout(() => {
            targetMessage.style.transition = originalTransition;
        }, 300);
    }, 1000);
}

// 显示阅读详情弹窗
function showReadDetail(msg) {
    console.log('📊 显示阅读详情 - timestamp:', msg.timestamp);
    console.log('📊 read_by:', msg.read_by);
    console.log('📊 unread_members:', msg.unread_members);

    currentReadDetailMessage = msg; // 保存当前显示的消息
    readList.innerHTML = '';
    unreadList.innerHTML = '';

    // 显示已读成员
    const readBy = msg.read_by || [];
    readCount.textContent = readBy.length;
    readBy.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; display: flex; align-items: center;';
        memberDiv.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #6c5ce7; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 14px;">
                ${member.substring(0, 1)}
            </div>
            <div style="font-size: 14px; color: #333;">${member}</div>
            <div style="margin-left: auto; color: #07c160; font-size: 18px;">✓</div>
        `;
        readList.appendChild(memberDiv);
    });

    // 显示未读成员
    const unreadMembers = msg.unread_members || [];
    unreadCount.textContent = unreadMembers.length;
    unreadMembers.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; display: flex; align-items: center;';
        memberDiv.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #ccc; color: white; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 14px;">
                ${member.substring(0, 1)}
            </div>
            <div style="font-size: 14px; color: #999;">${member}</div>
        `;
        unreadList.appendChild(memberDiv);
    });

    readDetailModal.style.display = 'flex';
}

// 关闭阅读详情弹窗
function closeReadDetail() {
    console.log('❎ 关闭阅读详情模态框');
    readDetailModal.style.display = 'none';
    currentReadDetailMessage = null; // 清除引用
}

// 发送群消息已读回执
function sendGroupMessageReadReceipt(groupId, timestamp) {
    ws.send(JSON.stringify({
        type: 'mark_group_message_read',
        group_id: groupId,
        timestamp: timestamp
    }));
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

    // 获取或生成用户ID
    let credentials = getUserCredentials();
    if (!credentials || credentials.username !== nickname) {
        // 新用户或更换昵称，生成新ID
        currentUserId = generateUserId();
        saveUserCredentials(currentUserId, nickname);
    } else {
        // 老用户，使用已有ID
        currentUserId = credentials.userId;
    }

    // 连接 WebSocket 并注册
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        // 等待连接建立
        const checkConnection = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                ws.send(JSON.stringify({
                    type: 'register',
                    username: nickname,
                    userId: currentUserId
                }));
            }
        }, 100);
    } else {
        ws.send(JSON.stringify({
            type: 'register',
            username: nickname,
            userId: currentUserId
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

// 登出/切换用户
// 取消引用按钮
cancelQuoteBtn.addEventListener('click', cancelQuote);

// 关闭阅读详情弹窗
closeReadDetailBtn.addEventListener('click', closeReadDetail);
readDetailModal.addEventListener('click', (e) => {
    if (e.target === readDetailModal) {
        closeReadDetail();
    }
});

logoutBtn.addEventListener('click', () => {
    if (confirm('确定要切换用户吗？')) {
        // 关闭 WebSocket 连接
        if (ws) {
            ws.close();
        }

        // 清空本地状态（但保留用户ID和昵称）
        currentUser = null;
        currentChatWith = null;
        currentChatType = null;
        contacts.clear();
        groups.clear();
        messages.clear();

        // 返回登录界面
        chatScreen.style.display = 'none';
        loginScreen.style.display = 'flex';

        // 清空输入框
        messageInput.value = '';

        // 重新连接 WebSocket
        setTimeout(() => {
            connectWebSocket();
        }, 500);
    }
});

// 群聊相关功能

// 打开创建群聊弹窗
createGroupBtn.addEventListener('click', () => {
    openCreateGroupModal();
});

// 关闭弹窗
closeModalBtn.addEventListener('click', closeCreateGroupModal);
cancelGroupBtn.addEventListener('click', closeCreateGroupModal);

// 创建群聊
confirmGroupBtn.addEventListener('click', () => {
    createGroup();
});

function openCreateGroupModal() {
    // 清空之前的输入
    groupNameInput.value = '';
    memberList.innerHTML = '';

    // 加载联系人列表
    contacts.forEach((_, username) => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        memberItem.innerHTML = `
            <input type="checkbox" id="member-${username}" value="${username}">
            <label for="member-${username}">${username}</label>
        `;
        memberList.appendChild(memberItem);
    });

    createGroupModal.classList.add('show');
}

function closeCreateGroupModal() {
    createGroupModal.classList.remove('show');
}

function createGroup() {
    const groupName = groupNameInput.value.trim();

    if (!groupName) {
        alert('请输入群名称');
        return;
    }

    // 获取选中的成员
    const selectedMembers = [];
    memberList.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
        selectedMembers.push(checkbox.value);
    });

    if (selectedMembers.length < 2) {
        alert('请至少选择2个成员');
        return;
    }

    // 发送创建群组请求
    ws.send(JSON.stringify({
        type: 'create_group',
        name: groupName,
        members: selectedMembers
    }));

    closeCreateGroupModal();
}

// 群组消息处理函数
function onGroupCreated(data) {
    const group = {
        id: data.group_id,
        name: data.name,
        members: data.members
    };
    groups.set(data.group_id, group);
    addGroupToList(data.group_id, data.name, data.members);
}

function updateGroupsList(groupsList) {
    groupsList.forEach(group => {
        groups.set(group.id, group);
        addGroupToList(group.id, group.name, group.members);
    });
}

function addGroupToList(groupId, groupName, members) {
    // 检查是否已存在
    const existing = contactsList.querySelector(`[data-group-id="${groupId}"]`);
    if (existing) return;

    const groupItem = document.createElement('div');
    groupItem.className = 'contact-item';
    groupItem.dataset.groupId = groupId;
    groupItem.innerHTML = `
        <div class="name">
            <span class="group-indicator">群</span>
            ${groupName}
        </div>
        <div class="status">${members.length} 人</div>
    `;

    groupItem.addEventListener('click', () => {
        selectGroup(groupId, groupName);
    });

    contactsList.appendChild(groupItem);
}

function selectGroup(groupId, groupName) {
    currentChatWith = groupId;
    currentChatType = 'group';
    chatWithName.textContent = groupName + ' (群聊)';

    // 更新样式
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.remove('active');
    });
    const selectedGroup = contactsList.querySelector(`[data-group-id="${groupId}"]`);
    if (selectedGroup) {
        selectedGroup.classList.add('active');
    }

    // 启用输入
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    // 加载群聊记录
    loadChatHistory(groupId);
}

function receiveGroupMessage(data) {
    const chatKey = data.group_id;

    if (!messages.has(chatKey)) {
        messages.set(chatKey, []);
    }
    messages.get(chatKey).push(data);

    // 如果正在查看这个群聊，显示消息并发送已读回执
    if (currentChatWith === data.group_id && currentChatType === 'group') {
        displayMessage(data);
        // 发送已读回执
        sendGroupMessageReadReceipt(data.group_id, data.timestamp);
    }
}

// 处理群消息阅读状态更新
function handleGroupMessageReadUpdate(data) {
    const chatKey = data.group_id;
    const chatMessages = messages.get(chatKey);

    if (!chatMessages) return;

    // 查找并更新消息的阅读状态
    for (let msg of chatMessages) {
        if (msg.timestamp === data.timestamp) {
            console.log('✅ 找到消息，更新前:', {read_by: msg.read_by, unread_members: msg.unread_members});
            msg.read_by = data.read_by;
            msg.unread_members = data.unread_members;
            console.log('✅ 更新后:', {read_by: msg.read_by, unread_members: msg.unread_members});

            // 如果正在查看这个群聊，更新UI显示
            if (currentChatWith === data.group_id && currentChatType === 'group') {
                // 重新渲染消息列表以更新阅读状态
                const messageEl = messagesContainer.querySelector(`[data-timestamp="${data.timestamp}"]`);
                if (messageEl) {
                    const readStatusEl = messageEl.querySelector('.read-status');
                    if (readStatusEl) {
                        const readByCount = data.read_by.length;
                        const unreadCount = data.unread_members.length;

                        if (unreadCount === 0) {
                            readStatusEl.innerHTML = '✓ 全部已读';
                        } else {
                            readStatusEl.innerHTML = `${unreadCount}人未读，${readByCount}人已读`;
                        }
                    }
                }
            }

            // 如果阅读详情模态框正在显示这条消息，刷新模态框
            console.log('🔍 检查模态框刷新条件:', {
                hasCurrentReadDetail: !!currentReadDetailMessage,
                currentTimestamp: currentReadDetailMessage?.timestamp,
                updateTimestamp: data.timestamp,
                match: currentReadDetailMessage?.timestamp === data.timestamp
            });

            if (currentReadDetailMessage && currentReadDetailMessage.timestamp === data.timestamp) {
                console.log('🔄 刷新阅读详情模态框, msg数据:', {read_by: msg.read_by, unread_members: msg.unread_members});
                showReadDetail(msg); // 重新渲染模态框
            } else if (currentReadDetailMessage) {
                console.log('❌ 时间戳不匹配', currentReadDetailMessage.timestamp, '!=', data.timestamp);
            }

            break;
        }
    }
}

// 修改sendMessage支持群聊
const originalSendMessage = sendMessage;
function sendMessageWithGroup() {
    const text = messageInput.value.trim();

    if (!text || !currentChatWith) return;

    if (currentChatType === 'group') {
        // 发送群消息
        const message = {
            type: 'send_group_message',
            group_id: currentChatWith,
            content: text,
            content_type: 'text',
            timestamp: Date.now()
        };

        // 如果有引用消息，添加引用信息
        if (quotedMessage) {
            message.quoted_message = {
                from: quotedMessage.from,
                content: quotedMessage.content_type === 'image' ? '[图片]' : quotedMessage.content,
                timestamp: quotedMessage.timestamp
            };
        }

        ws.send(JSON.stringify(message));

        // 添加到本地消息列表
        const chatKey = currentChatWith;
        if (!messages.has(chatKey)) {
            messages.set(chatKey, []);
        }

        // 获取群组成员列表
        const group = groups.get(currentChatWith);
        const groupMembers = group ? group.members : [];

        // 初始化已读列表（发送者自动标记为已读）
        const read_by = [currentUser];
        const unread_members = groupMembers.filter(m => m !== currentUser);

        messages.get(chatKey).push({
            ...message,
            from: currentUser,
            read: false,
            read_by: read_by,
            unread_members: unread_members
        });

        // 显示消息
        displayMessage({
            ...message,
            from: currentUser,
            read: false,
            read_by: read_by,
            unread_members: unread_members
        });

        messageInput.value = '';
        cancelQuote(); // 清除引用
    } else {
        // 原来的用户消息逻辑
        originalSendMessage();
    }
}

// 替换sendMessage函数以支持群聊
sendMessage = sendMessageWithGroup;

// 页面加载时的初始化
window.addEventListener('load', () => {
    connectWebSocket();

    // 检查是否有保存的用户信息，如果有则自动登录
    const credentials = getUserCredentials();
    if (credentials && credentials.username && credentials.userId) {
        // 自动登录
        currentUserId = credentials.userId;
        nicknameInput.value = credentials.username;

        // 等待 WebSocket 连接建立后自动登录
        const autoLogin = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                clearInterval(autoLogin);
                ws.send(JSON.stringify({
                    type: 'register',
                    username: credentials.username,
                    userId: credentials.userId
                }));
            }
        }, 100);
    } else {
        // 没有保存的信息，显示登录界面
        nicknameInput.placeholder = '请输入你的昵称';
    }
});
