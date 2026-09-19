const messageList = document.querySelector('#message-list');
const memberList = document.querySelector('#member-list');
const memberCount = document.querySelector('#member-count');
const roomCount = document.querySelector('#room-count');
const composer = document.querySelector('#composer');
const input = document.querySelector('#message-input');
const nameDialog = document.querySelector('#name-dialog');
const nameForm = document.querySelector('#name-form');
const nameInput = document.querySelector('#name-input');
const nameButton = document.querySelector('#name-button');
const connectionLabel = document.querySelector('#connection-label');
const typingIndicator = document.querySelector('#typing-indicator');
const selfAvatar = document.querySelector('#self-avatar');
const activeRoomName = document.querySelector('#active-room-name');
const roomSubtitle = document.querySelector('#room-subtitle');
const roomLabel = document.querySelector('#room-label');
const fileInput = document.querySelector('#file-input');
const fileButton = document.querySelector('#file-button');

let socket;
let selfId;
let displayName = localStorage.getItem('gather-name') || '';
let typingTimer;
let activeRoom = 'lobby';
let currentTargetId = null;
const typingNames = new Set();
const roomMessages = new Map();

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function setActiveRoom(roomId, label, subtitle) {
  activeRoom = roomId || 'lobby';
  activeRoomName.textContent = label || '# lobby';
  roomSubtitle.textContent = subtitle || 'One room, everyone welcome.';
  roomLabel.textContent = roomId && roomId.startsWith('dm:') ? 'DIRECT MESSAGE' : 'PUBLIC ROOM';
  renderHistory();
}

function renderHistory() {
  const messages = roomMessages.get(activeRoom) || [];
  messageList.innerHTML = '';
  messages.forEach((message) => {
    if (message.type === 'system') {
      addSystemMessage(message.text);
      return;
    }
    addMessage(message, false);
  });
  messageList.scrollTop = messageList.scrollHeight;
}

function renderMembers(users) {
  memberCount.textContent = users.length;
  roomCount.textContent = users.length;
  memberList.innerHTML = users.map((user) => `
    <button class="member member-button" data-user-id="${user.id}" title="Open direct chat">
      <span class="member-avatar" style="background:${user.color}22;color:${user.color}">${initials(user.name)}</span>
      <span>${escapeHtml(user.name)}${user.id === selfId ? ' (you)' : ''}${user.isAdmin ? ' • admin' : ''}</span>
      <span class="online"></span>
    </button>
  `).join('');

  memberList.querySelectorAll('.member-button').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.userId;
      if (!targetId || targetId === selfId) return;
      currentTargetId = targetId;
      const target = users.find((user) => user.id === targetId);
      const roomId = [selfId, targetId].sort().join(':');
      setActiveRoom(`dm:${roomId}`, `# ${target.name}`, `Private message with ${target.name}`);
      send({ type: 'switch-room', roomId: `dm:${roomId}` });
    });
  });
}

function addReactionButtons(element, message) {
  const reactions = Object.entries(message.reactions || {});
  if (!reactions.length) return;

  const row = document.createElement('div');
  row.className = 'message-reactions';

  reactions.forEach(([emoji, count]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reaction-btn';
    button.textContent = `${emoji} ${count}`;
    button.addEventListener('click', () => {
      send({ type: 'reaction', roomId: activeRoom, messageId: message.id, emoji });
    });
    row.append(button);
  });

  element.querySelector('.message-body').append(row);
}

function addMessage(message, append = true) {
  const element = document.createElement('article');
  element.className = `message${message.senderId === selfId ? ' mine' : ''}`;

  const bodyHtml = message.type === 'file'
    ? `
      <div class="message-body">
        <div class="message-meta">
          <span class="message-name">${escapeHtml(message.name)}</span>
          <time class="message-time">${formatTime(message.timestamp)}</time>
        </div>
        <div class="file-message">
          ${message.mimeType && message.mimeType.startsWith('image/') ? `<img class="file-preview" src="${message.dataUrl}" alt="${escapeHtml(message.fileName || 'Shared file')}" />` : ''}
          <a class="file-attachment" href="${message.dataUrl}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(message.fileName || 'shared-file')}">${escapeHtml(message.fileName || 'Shared file')}</a>
        </div>
      </div>
    `
    : `
      <div class="message-body">
        <div class="message-meta">
          <span class="message-name">${escapeHtml(message.name)}</span>
          <time class="message-time">${formatTime(message.timestamp)}</time>
        </div>
        <p class="message-text">${escapeHtml(message.text)}</p>
      </div>
    `;

  element.innerHTML = `
    <div class="message-avatar" style="background:${message.color}22;color:${message.color}">${initials(message.name)}</div>
    ${bodyHtml}
  `;

  addReactionButtons(element, message);

  if (append) {
    messageList.append(element);
    messageList.scrollTop = messageList.scrollHeight;
  } else {
    messageList.append(element);
  }
}

function addSystemMessage(text) {
  const element = document.createElement('div');
  element.className = 'system-message';
  element.textContent = text;
  messageList.append(element);
  messageList.scrollTop = messageList.scrollHeight;
}

function updateTyping() {
  typingIndicator.textContent = typingNames.size ? `${[...typingNames].join(', ')} ${typingNames.size > 1 ? 'are' : 'is'} typing...` : '';
}

function showNameDialog() {
  nameInput.value = displayName;
  nameDialog.classList.remove('hidden');
  nameInput.focus();
}

function connect() {
  socket = new WebSocket(`ws://${location.host}`);
  socket.addEventListener('open', () => {
    connectionLabel.textContent = 'Live now';
    if (displayName) send({ type: 'join', name: displayName }); else showNameDialog();
  });

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);

    if (payload.type === 'connected') {
      selfId = payload.id;
      selfAvatar.textContent = displayName ? initials(displayName) : 'G';
      selfAvatar.style.background = payload.color || '#f5c5b7';
      return;
    }

    if (payload.type === 'history') {
      roomMessages.set(payload.roomId, payload.messages || []);
      if (payload.roomId === activeRoom) renderHistory();
      return;
    }

    if (payload.type === 'presence') {
      renderMembers(payload.users || []);
      return;
    }

    if (payload.type === 'room-switched') {
      const targetName = payload.targetName || (payload.roomId && payload.roomId.startsWith('dm:') ? 'Private chat' : 'lobby');
      setActiveRoom(payload.roomId || 'lobby', payload.roomId && payload.roomId.startsWith('dm:') ? `# ${targetName}` : '# lobby', payload.roomId && payload.roomId.startsWith('dm:') ? `Private message with ${targetName}` : 'One room, everyone welcome.');
      return;
    }

    if (payload.type === 'message' || payload.type === 'file') {
      const roomMessagesForRoom = roomMessages.get(payload.roomId) || [];
      roomMessagesForRoom.push(payload);
      roomMessages.set(payload.roomId, roomMessagesForRoom);
      if (payload.roomId === activeRoom) renderHistory();
      return;
    }

    if (payload.type === 'reaction') {
      const roomMessagesForRoom = roomMessages.get(payload.roomId) || [];
      const match = roomMessagesForRoom.find((message) => message.id === payload.messageId);
      if (!match) return;
      match.reactions = payload.reactions || match.reactions || {};
      if (payload.roomId === activeRoom) renderHistory();
      return;
    }

    if (payload.type === 'system') {
      const roomMessagesForRoom = roomMessages.get(activeRoom) || [];
      roomMessagesForRoom.push({ type: 'system', text: payload.text, timestamp: new Date().toISOString() });
      roomMessages.set(activeRoom, roomMessagesForRoom);
      renderHistory();
      return;
    }

    if (payload.type === 'typing') {
      if (payload.roomId !== activeRoom) return;
      if (payload.active) typingNames.add(payload.name); else typingNames.delete(payload.name);
      updateTyping();
    }
  });

  socket.addEventListener('close', () => {
    connectionLabel.textContent = 'Reconnecting...';
    setTimeout(connect, 1500);
  });
}

nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  displayName = nameInput.value.trim().slice(0, 24);
  if (!displayName) return;
  localStorage.setItem('gather-name', displayName);
  selfAvatar.textContent = initials(displayName);
  nameDialog.classList.add('hidden');
  send({ type: 'join', name: displayName });
  input.focus();
});

nameButton.addEventListener('click', showNameDialog);

fileButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  send({
    type: 'file',
    roomId: activeRoom,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl
  });

  fileInput.value = '';
});

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  if (text.startsWith('/dm ')) {
    const targetName = text.slice(4).trim();
    send({ type: 'command', text: `/dm ${targetName}` });
    input.value = '';
    return;
  }

  if (text.startsWith('/ban ')) {
    send({ type: 'command', text });
    input.value = '';
    return;
  }

  send({ type: 'message', text, roomId: activeRoom, targetId: currentTargetId });
  input.value = '';
  send({ type: 'typing', active: false });
});

input.addEventListener('input', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  send({ type: 'typing', active: true, roomId: activeRoom });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => send({ type: 'typing', active: false, roomId: activeRoom }), 900);
});

roomMessages.set('lobby', []);
setActiveRoom('lobby', '# lobby', 'One room, everyone welcome.');
if (displayName) selfAvatar.textContent = initials(displayName);
connect();
