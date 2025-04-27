// server.js
// Backend for live-only dApp job chat
// *** TEMPORARY TEST VERSION - Allows all origins ***

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors'); // Keep import for methods definition

const app = express();
const server = http.createServer(app);

// --- Environment Variables ---
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = process.env.PORT || 3001;

// --- CORS Configuration (Original - Not used directly by Socket.IO below) ---
// We keep this structure just to define methods, but origin is overridden below
const allowedOrigins = [FRONTEND_URL];
const corsOptions = {
  origin: function (origin, callback) {
    // This logic is bypassed by origin: "*" below for testing
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`CORS Error: Origin ${origin} not allowed.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"]
};

// --- Socket.IO Server Initialization ---
const io = new Server(server, {
  // =============================================
  // === TEMPORARY CHANGE FOR TESTING ONLY ===
  // =============================================
  cors: {
    origin: "*", // Allow any origin - INSECURE, FOR LOCAL TEST ONLY
    methods: ["GET", "POST"]
  }
  // =============================================
  // === END TEMPORARY CHANGE ===
  // =============================================
});

console.log(`*** WARNING: Socket.IO server started with CORS origin '*' - ALLOWING ALL ORIGINS FOR TESTING! ***`);
console.log("Starting server...");

// --- Socket.IO Connection Logic ---
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  const jobId = socket.handshake.query.jobId;
  const socketId = socket.id;
  console.log(`[Connect] User trying to connect: ${shortenAddress(userId) || 'Anon'} | Job ID: ${jobId || 'None'} | Socket ID: ${socketId}`);

  if (jobId) {
      const roomName = `job-${jobId}`;
      try {
          socket.join(roomName);
          console.log(`[Join Room] User ${shortenAddress(userId) || 'Anon'} (${socketId}) successfully joined room: ${roomName}`);
      } catch (error) {
           console.error(`[Join Room Error] Failed to join room ${roomName} for socket ${socketId}:`, error);
      }
  } else {
      console.warn(`[Connect Warning] User ${socketId} connected without a jobId.`);
  }

  socket.on('sendMessage', (message) => {
    if (!message || typeof message !== 'object' || !message.jobId || !message.text || !message.senderDisplay) {
        console.warn(`[Message Error] Received invalid message format from ${socketId}:`, message);
        return;
    }
    const targetRoom = `job-${message.jobId}`;
    console.log(`[Message Received] Room: ${targetRoom} | From: ${message.senderDisplay} (${socketId}) | Text: ${message.text}`);
    console.log(`[Broadcasting] Attempting to broadcast to room: ${targetRoom}`);
    io.in(targetRoom).emit('receiveMessage', message); // Broadcast to all in room
    console.log(`[Broadcasting] Broadcast finished for room: ${targetRoom}`);
  });

  socket.on('leaveRoom', (roomJobId) => { /* ... Omitted for brevity ... */ });
  socket.on('disconnect', (reason) => { /* ... Omitted for brevity ... */ });
});

// --- Basic HTTP Route for Health Check ---
app.get('/', (req, res) => { /* ... Omitted for brevity ... */ });

// --- Start the Server ---
server.listen(PORT, () => {
  console.log(`✅ Job Chat Server listening on port ${PORT}`);
  // Note: The allowedOrigins array is not strictly enforced by Socket.IO with origin: "*"
  // console.log(`   Frontend connections expected from: ${allowedOrigins.join(', ')}`);
});

// Helper function
function shortenAddress(address) { /* ... Omitted for brevity ... */ }