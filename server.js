// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const logFile = 'server.log';
const adminPassword = 'supersecretpw'; // Admin password

let clients = {}; // Store clients as { socket.id: { username, socket } }

app.use(express.static('public'));

// Utility function to log messages to file
const logMessage = (message) => {
  fs.appendFile(logFile, message + '\n', (err) => {
    if (err) console.error('Failed to log message:', err);
  });
};

// Broadcast a message to all clients
const broadcast = (message, excludeSocketId = null) => {
  Object.values(clients).forEach(({ socket }) => {
    if (socket.id !== excludeSocketId) socket.emit('message', message);
  });
};

// Handle incoming connections
io.on('connection', (socket) => {
  const defaultUsername = `Guest${socket.id.slice(-4)}`;
  clients[socket.id] = { username: defaultUsername, socket };
  console.log(`${defaultUsername} connected.`);
  logMessage(`${defaultUsername} connected.`);

  // Welcome the new user
  socket.emit('message', `Welcome, ${defaultUsername}!`);
  broadcast(`${defaultUsername} has joined the chat.`, socket.id);

  // Handle incoming messages
  socket.on('message', (msg) => {
    const { username } = clients[socket.id];
    if (msg.startsWith('/')) {
      handleCommand(socket, msg);
    } else {
      const formattedMsg = `${username}: ${msg}`;
      console.log(formattedMsg);
      logMessage(formattedMsg);
      broadcast(formattedMsg, socket.id);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const { username } = clients[socket.id];
    console.log(`${username} disconnected.`);
    logMessage(`${username} disconnected.`);

    delete clients[socket.id];
    broadcast(`${username} has left the chat.`);
  });
});

// Handle commands
const handleCommand = (socket, msg) => {
  const [command, ...args] = msg.split(' ');
  const { username } = clients[socket.id];

  switch (command) {
    case '/w': // Whisper command
      handleWhisper(socket, username, args);
      break;

    case '/username': // Change username
      handleUsernameChange(socket, args);
      break;

    case '/kick': // Kick a user
      handleKick(socket, args);
      break;

    case '/clientlist': // List all connected clients
      handleClientList(socket);
      break;

    case '/commands': // List all connected clients
        sendCommandsList(socket);
      break;

    default:
      socket.emit('message', `Unknown command: ${command}`);
  }
};

// Function to send a list of available commands
const sendCommandsList = (socket) => {
    socket.emit("message", "Available commands:");
    const commands = [
      "/w <username> <message> - Sends a private message to a specific user.",
      "/username <new_username> - Changes your username.",
      "/kick <username> <admin_password> - Kicks a user (requires admin password).",
      "/clientlist - Displays a list of all connected users.",
      "/commands - Displays this list of available commands.",
    ];
  
    commands.forEach((cmd) => {
      socket.emit("message", cmd); // Send each command as a separate message
    });
  };  

// Whisper command
const handleWhisper = (socket, senderUsername, args) => {
  if (args.length < 2) {
    socket.emit('message', 'Error: Invalid command format. Use /w <username> <message>.');
    return;
  }

  const [targetUsername, ...messageParts] = args;
  const message = messageParts.join(' ');

  if (targetUsername === senderUsername) {
    socket.emit('message', 'Error: You cannot whisper to yourself.');
    return;
  }

  const targetClient = Object.values(clients).find((client) => client.username === targetUsername);
  if (!targetClient) {
    socket.emit('message', `Error: User "${targetUsername}" not found.`);
    return;
  }

  targetClient.socket.emit('message', `Whisper from ${senderUsername}: ${message}`);
  logMessage(`Whisper from ${senderUsername} to ${targetUsername}: ${message}`);
};

// Username change command
const handleUsernameChange = (socket, args) => {
  if (args.length !== 1) {
    socket.emit('message', 'Error: Invalid command format. Use /username <new_username>.');
    return;
  }

  const newUsername = args[0];
  const { username: oldUsername } = clients[socket.id];

  if (newUsername === oldUsername) {
    socket.emit('message', 'Error: New username cannot be the same as the old username.');
    return;
  }

  if (Object.values(clients).some((client) => client.username === newUsername)) {
    socket.emit('message', `Error: Username "${newUsername}" is already in use.`);
    return;
  }

  clients[socket.id].username = newUsername;
  socket.emit('message', `Username successfully updated to "${newUsername}".`);
  broadcast(`${oldUsername} has changed their username to ${newUsername}.`);
  logMessage(`${oldUsername} changed their username to ${newUsername}`);
};

// Kick command
const handleKick = (socket, args) => {
  if (args.length !== 2) {
    socket.emit('message', 'Error: Invalid command format. Use /kick <username> <admin_password>.');
    return;
  }

  const [targetUsername, password] = args;
  const { username: requesterUsername } = clients[socket.id];

  if (password !== adminPassword) {
    socket.emit('message', 'Error: Incorrect admin password.');
    return;
  }

  if (targetUsername === requesterUsername) {
    socket.emit('message', 'Error: You cannot kick yourself.');
    return;
  }

  const targetClient = Object.values(clients).find((client) => client.username === targetUsername);
  if (!targetClient) {
    socket.emit('message', `Error: User "${targetUsername}" not found.`);
    return;
  }

  targetClient.socket.emit('message', 'You have been kicked from the chat.');
  targetClient.socket.disconnect();

  delete clients[targetClient.socket.id];
  broadcast(`${targetUsername} has been kicked from the chat.`);
  logMessage(`${targetUsername} was kicked by ${requesterUsername}`);
};

// Client list command
const handleClientList = (socket) => {
  const clientList = Object.values(clients).map((client) => client.username).join(', ');
  socket.emit('message', `Connected clients: ${clientList}`);
  logMessage(`Client list requested: ${clientList}`);
};

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  logMessage('Server started.');
});
