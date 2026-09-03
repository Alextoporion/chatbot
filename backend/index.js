const express = require('express');
const http = require('http'); // 1. IMPORT CORE HTTP MODULE
const { Server } = require('socket.io'); // 2. IMPORT SOCKET.IO
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();
require('./config/db');
const handleSockets = require('./sockets/socketHandler');
const chatRoutes = require('./routes/ChatRoutes');
const authRoutes = require('./routes/AuthRoutes');
const app = express();
const port = process.env.PORT || 8080;

// 3. CREATE HTTP SERVER WRAPPING EXPRESS
const server = http.createServer(app);

// 4. INITIALIZE SOCKET.IO WITH CORS
const io = new Server(server, {
    cors: {
        origin: "*", // You can lock this down to your specific frontend URLs later
        methods: ["GET", "POST"]
    }
});
handleSockets(io);

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Add your dummy client URL here!
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes)

app.get('/', (req, res) => {
    res.send('Support Chat Server Running!');
});
app.use('/api/chat', chatRoutes);
// Serve the widget file publicly
app.use(express.static('public'));

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

// 5. USE server.listen INSTEAD OF app.listen
server.listen(port, () => {
    console.log(`Server & WebSockets listening on port ${port}`);
});