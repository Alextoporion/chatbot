const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path'); 
require('dotenv').config();
require('./config/db');
const handleSockets = require('./sockets/socketHandler');
const chatRoutes = require('./routes/ChatRoutes');
const authRoutes = require('./routes/AuthRoutes');
const app = express();
const port = process.env.PORT || 8080;

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});
handleSockets(io);

// ⚡️ FIXED: 'true' dynamically allows any client website to use your widget
app.use(cors({
    origin: true, 
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// 1. API ROUTES FIRST
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// 2. STATIC FOLDERS SECOND
app.use(express.static('public')); // Serves widget.js
app.use(express.static(path.join(__dirname, 'build'))); // Serves React files

// 3. REACT WILDCARD ROUTE LAST (Very Important)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// 4. ERROR HANDLER
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    if (statusCode === 500) {
        console.error(`[Server Error] ${message}`, err.stack);
    }

    res.status(statusCode).json({
        success: false,
        message: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

server.listen(port, () => {
    console.log(`Server & WebSockets listening on port ${port}`);
});