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
let unreadCounts = new Map(); // 存储每个联系人的未读消息数量 {username: count}

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
const botSettingsBtn = document.getElementById('bot-settings-btn');
const botSettingsModal = document.getElementById('bot-settings-modal');
const closeBotSettingsBtn = document.getElementById('close-bot-settings-btn');
const cancelBotSettingsBtn = document.getElementById('cancel-bot-settings-btn');
const saveBotSettingsBtn = document.getElementById('save-bot-settings-btn');
const botPromptInput = document.getElementById('bot-prompt-input');

// 普通输入区域
const inputArea = document.getElementById('input-area');

// 机器人输入区域相关元素
const botInputArea = document.getElementById('bot-input-area');
const botTextInput = document.getElementById('bot-text-input');
const botPdfInput = document.getElementById('bot-pdf-input');
const botPdfDropZone = document.getElementById('bot-pdf-drop-zone');
const botPdfFileInfo = document.getElementById('bot-pdf-file-info');
const botPdfFileName = document.getElementById('bot-pdf-file-name');
const botPdfFileSize = document.getElementById('bot-pdf-file-size');
const botRemovePdfBtn = document.getElementById('bot-remove-pdf-btn');
const botSubmitBtn = document.getElementById('bot-submit-btn');
const botResultArea = document.getElementById('bot-result-area');
const botResultContent = document.getElementById('bot-result-content');

// AI聊天总结相关元素
const aiSummaryBtn = document.getElementById('ai-summary-btn');
const aiSummaryModal = document.getElementById('ai-summary-modal');
const closeAiSummaryBtn = document.getElementById('close-ai-summary-btn');
const cancelAiSummaryBtn = document.getElementById('cancel-ai-summary-btn');
const submitAiSummaryBtn = document.getElementById('submit-ai-summary-btn');
const userSelectContainer = document.getElementById('user-select-container');
const summaryStartDate = document.getElementById('summary-start-date');
const summaryEndDate = document.getElementById('summary-end-date');
const aiSummaryDrawer = document.getElementById('ai-summary-drawer');
const drawerOverlay = document.getElementById('drawer-overlay');
const closeDrawerBtn = document.getElementById('close-drawer-btn');
const summaryUsersInfo = document.getElementById('summary-users-info');
const summaryTimeInfo = document.getElementById('summary-time-info');
const summaryCountInfo = document.getElementById('summary-count-info');
const summaryLoading = document.getElementById('summary-loading');
const summaryResultContent = document.getElementById('summary-result-content');
const configSummaryPromptBtn = document.getElementById('config-summary-prompt-btn');
const summaryPromptConfig = document.getElementById('summary-prompt-config');
const summaryPromptInput = document.getElementById('summary-prompt-input');

console.log('botSubmitBtn元素:', botSubmitBtn);

let selectedBotPdfFile = null;

// 通知权限状态
let notificationEnabled = false;

// 请求通知权限
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('此浏览器不支持桌面通知');
        return;
    }

    if (Notification.permission === 'granted') {
        notificationEnabled = true;
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                notificationEnabled = true;
                console.log('通知权限已授予');
            }
        });
    }
}

// 显示桌面通知
function showNotification(title, body, icon = null) {
    if (!notificationEnabled || Notification.permission !== 'granted') {
        return;
    }

    // 如果当前标签页是激活状态，不显示通知
    if (document.hasFocus()) {
        return;
    }

    const notification = new Notification(title, {
        body: body,
        icon: icon || '/icon.png', // 可以添加应用图标
        badge: '/badge.png',
        tag: 'chat-message', // 相同tag的通知会替换而不是堆叠
        requireInteraction: false,
        silent: false
    });

    // 点击通知时聚焦到窗口
    notification.onclick = function() {
        window.focus();
        notification.close();
    };

    // 5秒后自动关闭
    setTimeout(() => {
        notification.close();
    }, 5000);
}

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
        case 'history_message':
            // 接收历史消息（不显示通知）
            receiveHistoryMessage(data);
            break;
        case 'history_group_message':
            // 接收群组历史消息
            receiveHistoryGroupMessage(data);
            break;
        case 'new_message':
            // 如果是机器人回复，显示在结果区域
            if (data.from === '怡总' && currentChatWith === '怡总') {
                botResultContent.textContent = data.content;
                botResultArea.style.display = 'block';
            } else {
                receiveMessage(data);
            }
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

    // 请求通知权限
    requestNotificationPermission();

    // 更新用户列表（包含机器人标记）
    updateContactsList(data.users, data.bots || []);
}

// 更新通讯录
function updateContactsList(users, bots = []) {
    // 不清空contacts，只更新在线状态
    // 先将所有现有联系人标记为离线
    contacts.forEach((value, username) => {
        contacts.set(username, {online: false, isBot: value.isBot});
    });

    // 更新在线用户状态
    users.forEach(user => {
        if (user !== currentUser) {
            const isBot = bots.includes(user);
            contacts.set(user, {online: true, isBot: isBot});
        }
    });

    // 重新渲染列表
    contactsList.innerHTML = '';
    contacts.forEach((value, username) => {
        addContactToList(username, value.online, value.isBot);
    });
}

// 添加联系人到列表
function addContactToList(username, isOnline = true, isBot = false) {
    const contactItem = document.createElement('div');
    contactItem.className = 'contact-item';
    contactItem.dataset.username = username;

    let statusText;
    let indicatorColor;
    let opacity;

    if (isBot) {
        // 机器人用户始终在线，显示特殊标识
        statusText = '🤖 机器人';
        indicatorColor = '#6c5ce7';  // 紫色
        opacity = '1';
    } else {
        statusText = isOnline ? '在线' : '离线';
        indicatorColor = isOnline ? '#07c160' : '#ccc';
        opacity = isOnline ? '1' : '0.6';
    }

    // 获取未读消息数量
    const unreadCount = unreadCounts.get(username) || 0;
    const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : '';

    contactItem.innerHTML = `
        <div class="name">
            <span class="online-indicator" style="background-color: ${indicatorColor};"></span>
            ${username}
            ${unreadBadge}
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
        contacts.set(username, {online: true, isBot: false});
        addContactToList(username, true, false);
    } else {
        // 已存在的联系人上线，更新状态
        const contactInfo = contacts.get(username);
        contacts.set(username, {...contactInfo, online: true});
        setContactOnlineStatus(username, true);
    }
}

// 标记联系人为离线（不删除）
function removeContact(username) {
    if (username === currentUser) return;

    if (contacts.has(username)) {
        // 已存在的联系人，只更新状态为离线
        const contactInfo = contacts.get(username);
        contacts.set(username, {...contactInfo, online: false});
        setContactOnlineStatus(username, false);
    } else {
        // 首次遇到这个用户（从未见过），添加为离线状态
        contacts.set(username, {online: false, isBot: false});
        addContactToList(username, false, false);
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

    // 清除未读消息数量
    if (unreadCounts.has(username)) {
        unreadCounts.set(username, 0);
        updateContactUnreadBadge(username);
    }

    // 检查是否是机器人用户，显示/隐藏相关按钮和输入区域
    const contactInfo = contacts.get(username);
    if (contactInfo && contactInfo.isBot) {
        botSettingsBtn.style.display = 'block';
        botInputArea.style.display = 'block';
        inputArea.style.display = 'none'; // 隐藏普通输入区域
    } else {
        botSettingsBtn.style.display = 'none';
        botInputArea.style.display = 'none';
        inputArea.style.display = 'flex'; // 显示普通输入区域
    }

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

    let message, chatKey;

    if (currentChatType === 'group') {
        // 群聊消息
        message = {
            type: 'send_group_message',
            group_id: currentChatWith,
            content: text,
            content_type: 'text',
            timestamp: Date.now()
        };
        chatKey = currentChatWith;

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
        if (!messages.has(chatKey)) {
            messages.set(chatKey, []);
        }
        messages.get(chatKey).push({
            ...message,
            from: currentUser,
            group_id: currentChatWith,
            read_by: [currentUser],
            unread_members: groups.get(currentChatWith)?.members.filter(m => m !== currentUser) || []
        });

        // 显示消息
        displayMessage({
            ...message,
            from: currentUser,
            group_id: currentChatWith,
            read_by: [currentUser],
            unread_members: groups.get(currentChatWith)?.members.filter(m => m !== currentUser) || []
        });
    } else {
        // 私聊消息
        message = {
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
        chatKey = getChatKey(currentUser, currentChatWith);
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
    }

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

// 接收历史消息（登录时加载）
function receiveHistoryMessage(data) {
    // 确定聊天对象：如果消息是自己发的，对方是 to；如果是对方发的，对方是 from
    const chatPartner = data.from === currentUser ? data.to : data.from;
    const chatKey = getChatKey(currentUser, chatPartner);

    if (!messages.has(chatKey)) {
        messages.set(chatKey, []);
    }
    messages.get(chatKey).push(data);
    // 历史消息不显示，只存储到内存
}

// 接收群组历史消息
function receiveHistoryGroupMessage(data) {
    const chatKey = data.group_id;

    if (!messages.has(chatKey)) {
        messages.set(chatKey, []);
    }
    messages.get(chatKey).push(data);
    // 历史消息不显示，只存储到内存
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
    } else {
        // 如果不是当前聊天窗口，增加未读计数并显示桌面通知
        const currentCount = unreadCounts.get(data.from) || 0;
        unreadCounts.set(data.from, currentCount + 1);
        updateContactUnreadBadge(data.from);

        const messagePreview = data.content_type === 'image' ? '发送了一张图片' : data.content;
        showNotification(`${data.from} 发来新消息`, messagePreview);
    }
}

// 更新联系人或群组的未读标记
function updateContactUnreadBadge(identifier) {
    // 尝试查找联系人或群组
    let contactItem = contactsList.querySelector(`[data-username="${identifier}"]`);
    if (!contactItem) {
        contactItem = contactsList.querySelector(`[data-group-id="${identifier}"]`);
    }
    if (!contactItem) return;

    const nameDiv = contactItem.querySelector('.name');
    if (!nameDiv) return;

    // 移除旧的未读标记
    const oldBadge = nameDiv.querySelector('.unread-badge');
    if (oldBadge) {
        oldBadge.remove();
    }

    // 添加新的未读标记
    const unreadCount = unreadCounts.get(identifier) || 0;
    if (unreadCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        nameDiv.appendChild(badge);
    }
}

// 显示消息
function displayMessage(msg) {
    // 移除空状态
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    console.log('displayMessage 被调用:', {
        msgFrom: msg.from,
        currentUser: currentUser,
        isSent: msg.from === currentUser,
        contentType: msg.content_type
    });

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
    } else if (msg.content_type === 'voice') {
        // 语音消息
        const voiceDiv = document.createElement('div');
        voiceDiv.className = 'voice-message';

        const playBtn = document.createElement('button');
        playBtn.className = 'voice-play-btn';
        playBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="8 5 19 12 8 19 8 5"></polygon>
            </svg>
        `;

        const voiceInfo = document.createElement('div');
        voiceInfo.className = 'voice-info';

        const durationText = document.createElement('div');
        durationText.className = 'voice-duration-text';
        durationText.textContent = `${msg.duration || 0}"`;

        voiceInfo.appendChild(durationText);
        voiceDiv.appendChild(playBtn);
        voiceDiv.appendChild(voiceInfo);

        // 点击播放语音
        playBtn.onclick = () => {
            playVoiceMessage(msg.content, playBtn, voiceInfo);
        };

        contentDiv.appendChild(voiceDiv);
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

// 机器人设置按钮事件
botSettingsBtn.addEventListener('click', () => {
    // 从localStorage加载已保存的prompt
    const savedPrompt = localStorage.getItem('bot_prompt') || '请总结以下聊天记录的主要内容和关键信息。';
    botPromptInput.value = savedPrompt;
    botSettingsModal.style.display = 'flex';
});

closeBotSettingsBtn.addEventListener('click', () => {
    botSettingsModal.style.display = 'none';
});

cancelBotSettingsBtn.addEventListener('click', () => {
    botSettingsModal.style.display = 'none';
});

saveBotSettingsBtn.addEventListener('click', () => {
    const newPrompt = botPromptInput.value.trim();
    if (newPrompt) {
        // 保存到localStorage
        localStorage.setItem('bot_prompt', newPrompt);

        // 发送设置命令给机器人
        const message = {
            type: 'send_message',
            to: '怡总',
            content: `/setprompt ${newPrompt}`,
            content_type: 'text',
            timestamp: Date.now()
        };

        ws.send(JSON.stringify(message));

        // 关闭弹窗
        botSettingsModal.style.display = 'none';

        // 显示提示
        alert('✅ Prompt设置已保存！');
    } else {
        alert('❌ Prompt不能为空');
    }
});

botSettingsModal.addEventListener('click', (e) => {
    if (e.target === botSettingsModal) {
        botSettingsModal.style.display = 'none';
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
        const groupId = group.group_id || group.id; // 兼容两种字段名
        groups.set(groupId, {...group, id: groupId});
        addGroupToList(groupId, group.name, group.members);
    });
}

function addGroupToList(groupId, groupName, members) {
    // 检查是否已存在
    const existing = contactsList.querySelector(`[data-group-id="${groupId}"]`);
    if (existing) return;

    // 获取未读消息数量
    const unreadCount = unreadCounts.get(groupId) || 0;
    const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : '';

    const groupItem = document.createElement('div');
    groupItem.className = 'contact-item';
    groupItem.dataset.groupId = groupId;
    groupItem.innerHTML = `
        <div class="name">
            <span class="group-indicator">群</span>
            ${groupName}
            ${unreadBadge}
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

    // 清除未读消息数量
    if (unreadCounts.has(groupId)) {
        unreadCounts.set(groupId, 0);
        updateContactUnreadBadge(groupId);
    }

    // 群聊总是显示普通输入区域，隐藏机器人输入区域
    botSettingsBtn.style.display = 'none';
    botInputArea.style.display = 'none';
    inputArea.style.display = 'flex';

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
    } else {
        // 如果不是当前群聊窗口，增加未读数量并显示桌面通知
        const currentCount = unreadCounts.get(data.group_id) || 0;
        unreadCounts.set(data.group_id, currentCount + 1);
        updateContactUnreadBadge(data.group_id);

        const group = groups.get(data.group_id);
        const groupName = group ? group.name : data.group_id;
        const messagePreview = data.content_type === 'image' ? '发送了一张图片' : data.content;
        showNotification(`${data.from}@${groupName}`, messagePreview);
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

// ============ 机器人输入区域功能 ============

// PDF上传区域点击
botPdfDropZone.addEventListener('click', () => {
    botPdfInput.click();
});

// PDF文件选择
botPdfInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleBotPdfFile(file);
    }
});

// PDF拖拽功能
botPdfDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    botPdfDropZone.style.background = '#f0f0ff';
});

botPdfDropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    botPdfDropZone.style.background = 'white';
});

botPdfDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    botPdfDropZone.style.background = 'white';
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        handleBotPdfFile(file);
    } else {
        alert('请上传PDF文件！');
    }
});

// 处理PDF文件
function handleBotPdfFile(file) {
    if (file.size > 10 * 1024 * 1024) {
        alert('文件大小不能超过10MB！');
        return;
    }

    selectedBotPdfFile = file;
    botPdfFileName.textContent = file.name;
    botPdfFileSize.textContent = formatFileSize(file.size);
    botPdfFileInfo.style.display = 'flex';
    botPdfDropZone.style.display = 'none';
}

// 移除PDF文件
botRemovePdfBtn.addEventListener('click', () => {
    selectedBotPdfFile = null;
    botPdfInput.value = '';
    botPdfFileInfo.style.display = 'none';
    botPdfDropZone.style.display = 'flex';
});

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// 统一的总结按钮
if (botSubmitBtn) {
    console.log('正在绑定总结按钮事件...');
    botSubmitBtn.addEventListener('click', async () => {
        console.log('总结按钮被点击');
        let content = '';

        // 优先使用文本输入
        const textContent = botTextInput.value.trim();
        console.log('文本内容:', textContent);
        if (textContent) {
            content = textContent;
        } else if (selectedBotPdfFile) {
            // 如果没有文本，使用PDF
            try {
                botSubmitBtn.disabled = true;
                botSubmitBtn.textContent = '📤 处理中...';

                content = await extractPdfText(selectedBotPdfFile);
                if (!content) {
                    alert('PDF文件内容为空或无法读取！');
                    botSubmitBtn.disabled = false;
                    botSubmitBtn.textContent = '📊 开始总结';
                    return;
                }
            } catch (error) {
                alert('PDF文件读取失败：' + error.message);
                botSubmitBtn.disabled = false;
                botSubmitBtn.textContent = '📊 开始总结';
                return;
            }
        } else {
            alert('请输入聊天记录或上传PDF文件！');
            return;
        }

        // 显示加载状态
        botResultArea.style.display = 'block';
        botResultContent.innerHTML = '<div style="text-align: center; padding: 40px;"><div style="border: 4px solid #f3f3f3; border-top: 4px solid #6c5ce7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div><div style="color: #666;">AI正在分析中...</div></div>';

        // 发送给怡总
        console.log('准备发送消息给怡总，内容长度:', content.length);
        ws.send(JSON.stringify({
            type: 'send_message',
            to: '怡总',
            content: content,
            content_type: 'text',
            timestamp: Date.now()
        }));
        console.log('消息已发送');

        // 清空输入
        botTextInput.value = '';
        if (selectedBotPdfFile) {
            selectedBotPdfFile = null;
            botPdfInput.value = '';
            botPdfFileInfo.style.display = 'none';
            botPdfDropZone.style.display = 'flex';
        }

        botSubmitBtn.disabled = false;
        botSubmitBtn.textContent = '📊 开始总结';
    });
    console.log('总结按钮事件绑定完成');
} else {
    console.error('错误：找不到botSubmitBtn元素！');
}

// 提取PDF文本（使用pdf.js库）
async function extractPdfText(file) {
    return new Promise((resolve, reject) => {
        // 检查文件大小（限制10MB）
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            reject(new Error('PDF文件大小超过10MB限制'));
            return;
        }

        const reader = new FileReader();

        reader.onload = async function(e) {
            try {
                const arrayBuffer = e.target.result;

                // 配置 pdf.js worker
                if (typeof pdfjsLib !== 'undefined') {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                } else {
                    reject(new Error('PDF.js 库未加载'));
                    return;
                }

                // 加载PDF文档
                const loadingTask = pdfjsLib.getDocument({data: arrayBuffer});
                const pdf = await loadingTask.promise;

                console.log(`PDF加载成功，共 ${pdf.numPages} 页`);

                let fullText = '';

                // 逐页提取文本
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();

                    // 提取页面文本
                    const pageText = textContent.items
                        .map(item => item.str)
                        .join(' ');

                    fullText += pageText + '\n\n';
                }

                if (!fullText.trim()) {
                    reject(new Error('PDF文件中没有可提取的文本内容（可能是扫描版PDF）'));
                    return;
                }

                console.log(`成功提取 ${fullText.length} 个字符`);
                resolve(fullText.trim());

            } catch (error) {
                console.error('PDF解析错误:', error);
                reject(new Error('PDF文件解析失败：' + error.message));
            }
        };

        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

// ========== AI聊天总结功能 ==========

// 打开AI总结对话框
aiSummaryBtn.addEventListener('click', () => {
    // 生成用户选择列表
    userSelectContainer.innerHTML = '';

    // 先添加当前用户自己
    const selfCheckbox = document.createElement('label');
    selfCheckbox.style.cssText = 'display: block; padding: 8px; cursor: pointer; transition: background 0.2s; background: #f0f7ff;';
    selfCheckbox.innerHTML = `
        <input type="checkbox" value="${currentUser}" style="margin-right: 8px;">
        <span style="font-size: 14px; color: #333; font-weight: 600;">${currentUser}</span>
        <span style="font-size: 12px; color: #07c160; margin-left: 8px;">我自己</span>
    `;
    selfCheckbox.onmouseover = () => selfCheckbox.style.background = '#e6f3ff';
    selfCheckbox.onmouseout = () => selfCheckbox.style.background = '#f0f7ff';
    userSelectContainer.appendChild(selfCheckbox);

    // 添加所有联系人（排除机器人）
    contacts.forEach((contactInfo, username) => {
        if (!contactInfo.isBot) {
            const checkbox = document.createElement('label');
            checkbox.style.cssText = 'display: block; padding: 8px; cursor: pointer; transition: background 0.2s;';
            checkbox.innerHTML = `
                <input type="checkbox" value="${username}" style="margin-right: 8px;">
                <span style="font-size: 14px; color: #333;">${username}</span>
                <span style="font-size: 12px; color: #999; margin-left: 8px;">${contactInfo.online ? '在线' : '离线'}</span>
            `;
            checkbox.onmouseover = () => checkbox.style.background = '#f0f0f0';
            checkbox.onmouseout = () => checkbox.style.background = 'transparent';
            userSelectContainer.appendChild(checkbox);
        }
    });

    // 设置默认时间范围（最近7天）
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    summaryEndDate.value = today.toISOString().split('T')[0];
    summaryStartDate.value = weekAgo.toISOString().split('T')[0];

    aiSummaryModal.style.display = 'flex';
});

// 切换Prompt配置区域
configSummaryPromptBtn.addEventListener('click', () => {
    if (summaryPromptConfig.style.display === 'none') {
        summaryPromptConfig.style.display = 'block';
        configSummaryPromptBtn.textContent = '⚙️ 隐藏Prompt';
    } else {
        summaryPromptConfig.style.display = 'none';
        configSummaryPromptBtn.textContent = '⚙️ 配置Prompt';
    }
});

// 关闭对话框
closeAiSummaryBtn.addEventListener('click', () => {
    aiSummaryModal.style.display = 'none';
    summaryPromptConfig.style.display = 'none';
    configSummaryPromptBtn.textContent = '⚙️ 配置Prompt';
});

cancelAiSummaryBtn.addEventListener('click', () => {
    aiSummaryModal.style.display = 'none';
    summaryPromptConfig.style.display = 'none';
    configSummaryPromptBtn.textContent = '⚙️ 配置Prompt';
});

// 提交AI总结请求
submitAiSummaryBtn.addEventListener('click', async () => {
    // 获取选中的用户
    const selectedUsers = Array.from(userSelectContainer.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value);

    if (selectedUsers.length === 0) {
        alert('请至少选择一个用户');
        return;
    }

    if (!summaryStartDate.value || !summaryEndDate.value) {
        alert('请选择时间范围');
        return;
    }

    const startDate = new Date(summaryStartDate.value);
    const endDate = new Date(summaryEndDate.value);
    endDate.setHours(23, 59, 59, 999); // 设置为当天结束

    if (startDate > endDate) {
        alert('开始日期不能晚于结束日期');
        return;
    }

    // 收集符合条件的消息
    const filteredMessages = [];

    messages.forEach((msgList, chatKey) => {
        msgList.forEach(msg => {
            const msgDate = new Date(msg.timestamp);

            // 检查是否在时间范围内
            if (msgDate >= startDate && msgDate <= endDate) {
                // 检查发送者或接收者是否在选中用户列表中
                if (selectedUsers.includes(msg.from) || selectedUsers.includes(msg.to)) {
                    filteredMessages.push(msg);
                }
            }
        });
    });

    if (filteredMessages.length === 0) {
        alert('没有找到符合条件的聊天记录');
        return;
    }

    // 按时间排序
    filteredMessages.sort((a, b) => a.timestamp - b.timestamp);

    // 获取自定义prompt（如果有）
    const customPrompt = summaryPromptInput.value.trim();

    // 关闭对话框，打开抽屉
    aiSummaryModal.style.display = 'none';
    summaryPromptConfig.style.display = 'none';
    configSummaryPromptBtn.textContent = '⚙️ 配置Prompt';
    showSummaryDrawer(selectedUsers, startDate, endDate, filteredMessages, customPrompt);
});

// 显示总结抽屉并调用AI
async function showSummaryDrawer(users, startDate, endDate, messages, customPrompt = '') {
    // 显示抽屉和遮罩
    drawerOverlay.style.display = 'block';
    aiSummaryDrawer.style.display = 'block';

    // 显示总结信息
    summaryUsersInfo.textContent = users.join(', ');
    summaryTimeInfo.textContent = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    summaryCountInfo.textContent = `${messages.length} 条消息`;

    // 显示加载状态
    summaryLoading.style.display = 'block';
    summaryResultContent.textContent = '';

    // 准备消息内容
    const chatContent = messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        if (msg.content_type === 'image') {
            return `[${time}] ${msg.from}: [发送了一张图片]`;
        } else {
            return `[${time}] ${msg.from}: ${msg.content}`;
        }
    }).join('\n');

    // 调用后端API进行总结
    try {
        const response = await fetch('http://localhost:8080/api/summarize_chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                users: users,
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                chat_content: chatContent,
                custom_prompt: customPrompt
            })
        });

        if (!response.ok) {
            throw new Error('API请求失败');
        }

        const result = await response.json();

        // 隐藏加载状态，显示结果
        summaryLoading.style.display = 'none';
        summaryResultContent.textContent = result.summary;

    } catch (error) {
        console.error('AI总结失败:', error);
        summaryLoading.style.display = 'none';
        summaryResultContent.textContent = '总结失败：' + error.message;
    }
}

// 关闭抽屉
closeDrawerBtn.addEventListener('click', () => {
    aiSummaryDrawer.style.display = 'none';
    drawerOverlay.style.display = 'none';
});

drawerOverlay.addEventListener('click', () => {
    aiSummaryDrawer.style.display = 'none';
    drawerOverlay.style.display = 'none';
});

// ==================== 语音消息功能 ====================

// 语音相关DOM元素
const voiceBtn = document.getElementById('voice-btn');
const voiceRecorder = document.getElementById('voice-recorder');
const voicePreview = document.getElementById('voice-preview');
// inputArea already declared at line 71
const recordingTime = document.getElementById('recording-time');
const cancelRecordingBtn = document.getElementById('cancel-recording-btn');
const stopRecordingBtn = document.getElementById('stop-recording-btn');
const playPreviewBtn = document.getElementById('play-preview-btn');
const previewDuration = document.getElementById('preview-duration');
const rerecordBtn = document.getElementById('rerecord-btn');
const sendVoiceBtn = document.getElementById('send-voice-btn');

// 语音录制相关变量
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let recordedAudioBlob = null;
let recordedAudioUrl = null;
let previewAudio = null;

// 格式化时间显示 (秒数转 mm:ss)
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 点击语音按钮 - 开始录制
voiceBtn.addEventListener('click', async () => {
    if (!currentChatWith) {
        alert('请先选择一个联系人');
        return;
    }

    try {
        // 请求麦克风权限
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 初始化MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        // 监听数据
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        // 录制停止时的处理
        mediaRecorder.onstop = () => {
            // 停止所有音轨
            stream.getTracks().forEach(track => track.stop());

            // 创建音频Blob
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);

            // 计算录制时长
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            previewDuration.textContent = formatTime(duration);

            // 显示预览界面
            showVoicePreview();
        };

        // 开始录制
        mediaRecorder.start();
        recordingStartTime = Date.now();

        // 显示录制界面
        inputArea.style.display = 'none';
        voiceRecorder.classList.add('active');

        // 开始计时
        let seconds = 0;
        recordingTimer = setInterval(() => {
            seconds++;
            recordingTime.textContent = formatTime(seconds);

            // 最长录制60秒
            if (seconds >= 60) {
                stopRecording();
            }
        }, 1000);

    } catch (error) {
        console.error('无法访问麦克风:', error);
        alert('无法访问麦克风，请确保已授予麦克风权限');
    }
});

// 取消录制
cancelRecordingBtn.addEventListener('click', () => {
    cancelRecording();
});

function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    clearInterval(recordingTimer);
    recordingTime.textContent = '00:00';

    voiceRecorder.classList.remove('active');
    inputArea.style.display = 'flex';

    // 清理数据
    audioChunks = [];
    recordedAudioBlob = null;
    if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        recordedAudioUrl = null;
    }
}

// 停止录制
stopRecordingBtn.addEventListener('click', () => {
    stopRecording();
});

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    clearInterval(recordingTimer);
}

// 显示预览界面
function showVoicePreview() {
    voiceRecorder.classList.remove('active');
    voicePreview.classList.add('active');

    // 创建音频对象用于预览
    previewAudio = new Audio(recordedAudioUrl);
}

// 播放/暂停预览
playPreviewBtn.addEventListener('click', () => {
    if (!previewAudio) return;

    if (previewAudio.paused) {
        previewAudio.play();
        playPreviewBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
        `;
    } else {
        previewAudio.pause();
        playPreviewBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
    }

    // 播放结束后恢复按钮
    previewAudio.onended = () => {
        playPreviewBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
        `;
    };
});

// 重新录制
rerecordBtn.addEventListener('click', () => {
    // 清理预览
    if (previewAudio) {
        previewAudio.pause();
        previewAudio = null;
    }

    if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        recordedAudioUrl = null;
    }

    recordedAudioBlob = null;
    voicePreview.classList.remove('active');
    inputArea.style.display = 'flex';

    // 重新开始录制
    setTimeout(() => {
        voiceBtn.click();
    }, 100);
});

// 发送语音消息
sendVoiceBtn.addEventListener('click', async () => {
    console.log('发送语音按钮被点击');
    console.log('currentUser:', currentUser);
    console.log('recordedAudioBlob:', recordedAudioBlob);
    console.log('currentChatType:', currentChatType);
    console.log('currentChatWith:', currentChatWith);

    if (!recordedAudioBlob) {
        console.error('没有录制的音频数据');
        return;
    }

    try {
        // 转换为base64
        const reader = new FileReader();
        reader.onloadend = () => {
            console.log('音频已转换为base64');
            const base64Audio = reader.result.split(',')[1];
            const duration = parseInt(previewDuration.textContent.split(':')[0]) * 60 +
                           parseInt(previewDuration.textContent.split(':')[1]);

            // 发送语音消息
            let message, chatKey;

            if (currentChatType === 'group') {
                // 群聊语音消息
                message = {
                    type: 'send_group_message',
                    group_id: currentChatWith,
                    content: base64Audio,
                    content_type: 'voice',
                    duration: duration,
                    timestamp: Date.now(),
                    from: currentUser  // 添加from字段
                };
                chatKey = currentChatWith;

                // 确保messages Map中有这个群的数组
                if (!messages.has(chatKey)) {
                    messages.set(chatKey, []);
                }

                messages.get(chatKey).push({
                    ...message,
                    from: currentUser,
                    group_id: currentChatWith,
                    read_by: [currentUser],
                    unread_members: groups.get(currentChatWith)?.members.filter(m => m !== currentUser) || []
                });
            } else {
                // 私聊语音消息
                message = {
                    type: 'send_message',
                    to: currentChatWith,
                    content: base64Audio,
                    content_type: 'voice',
                    duration: duration,
                    timestamp: Date.now(),
                    from: currentUser  // 添加from字段
                };
                chatKey = getChatKey(currentUser, currentChatWith);
            }

            // 发送到服务器
            console.log('准备发送消息到服务器:', message);
            ws.send(JSON.stringify(message));
            console.log('消息已发送到服务器');

            // 显示语音消息
            console.log('准备显示语音消息');
            console.log('message对象:', message);
            console.log('合并后的对象:', {...message, from: currentUser});
            displayMessage({...message, from: currentUser});
            console.log('语音消息已显示');

            // 清理并恢复界面
            if (previewAudio) {
                previewAudio.pause();
                previewAudio = null;
            }

            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
                recordedAudioUrl = null;
            }

            recordedAudioBlob = null;
            voicePreview.classList.remove('active');
            inputArea.style.display = 'flex';
        };

        reader.readAsDataURL(recordedAudioBlob);

    } catch (error) {
        console.error('发送语音消息失败:', error);
        alert('发送语音消息失败');
    }
});

// 播放语音消息
let currentPlayingAudio = null;
let currentPlayingBtn = null;

function playVoiceMessage(base64Audio, playBtn, voiceInfo) {
    // 如果当前有正在播放的语音，先停止
    if (currentPlayingAudio && !currentPlayingAudio.paused) {
        currentPlayingAudio.pause();
        currentPlayingAudio.currentTime = 0;

        // 恢复之前的播放按钮
        if (currentPlayingBtn) {
            currentPlayingBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="8 5 19 12 8 19 8 5"></polygon>
                </svg>
            `;
            // 移除动画
            const prevAnimation = currentPlayingBtn.parentElement.querySelector('.voice-playing-animation');
            if (prevAnimation) {
                prevAnimation.remove();
            }
        }
    }

    // 如果点击的是同一个按钮，只是暂停
    if (currentPlayingBtn === playBtn && currentPlayingAudio && !currentPlayingAudio.paused) {
        currentPlayingAudio.pause();
        playBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="8 5 19 12 8 19 8 5"></polygon>
            </svg>
        `;
        return;
    }

    // 创建音频对象
    const audioUrl = `data:audio/webm;base64,${base64Audio}`;
    const audio = new Audio(audioUrl);

    currentPlayingAudio = audio;
    currentPlayingBtn = playBtn;

    // 更改按钮为暂停图标
    playBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
    `;

    // 添加播放动画
    const durationText = voiceInfo.querySelector('.voice-duration-text');
    const animationDiv = document.createElement('div');
    animationDiv.className = 'voice-playing-animation';
    animationDiv.innerHTML = `
        <div class="voice-bar"></div>
        <div class="voice-bar"></div>
        <div class="voice-bar"></div>
        <div class="voice-bar"></div>
        <div class="voice-bar"></div>
    `;
    voiceInfo.insertBefore(animationDiv, durationText);

    // 播放音频
    audio.play().catch(error => {
        console.error('播放语音失败:', error);
        alert('播放语音失败');
        playBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="8 5 19 12 8 19 8 5"></polygon>
            </svg>
        `;
        animationDiv.remove();
    });

    // 播放结束
    audio.onended = () => {
        playBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="8 5 19 12 8 19 8 5"></polygon>
            </svg>
        `;
        animationDiv.remove();
        currentPlayingAudio = null;
        currentPlayingBtn = null;
    };
}
