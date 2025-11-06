import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = http.createServer(app);

// Dynamic CORS for production
const ALLOWED_ORIGINS = [
  'https://your-vercel-app.vercel.app', // Your Vercel frontend URL
  'https://msrvps.site',
  'https://www.msrvps.site',
  'http://localhost:3000',
  'http://localhost:8080'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.json());

// In-memory storage (for demo - use database in production)
const users = new Map();
const onlineUsers = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'video-call-app-secret-key';

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    console.log('Registration attempt from:', req.headers.origin);
    
    if (users.has(email)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.set(email, user);
    console.log('User registered:', user.email);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt from:', req.headers.origin);
    const user = users.get(email);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('User logged in:', user.email);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', authenticateToken, (req, res) => {
  const onlineUsersList = Array.from(onlineUsers.values())
    .filter(user => user.id !== req.user.id)
    .map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isOnline: true
    }));

  res.json(onlineUsersList);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user-online', (userData) => {
    onlineUsers.set(userData.id, { ...userData, socketId: socket.id });
    console.log('User online:', userData.name);
    io.emit('users-updated', Array.from(onlineUsers.values()));
  });

  socket.on('call-user', (data) => {
    const { to, offer, caller } = data;
    const targetUser = Array.from(onlineUsers.values()).find(u => u.id === to);
    
    if (targetUser) {
      console.log(`Call from ${caller.name} to ${targetUser.name}`);
      io.to(targetUser.socketId).emit('incoming-call', {
        from: caller,
        offer,
        callerSocketId: socket.id
      });
    } else {
      console.log('Target user not found or offline:', to);
    }
  });

  socket.on('call-accepted', (data) => {
    const { to, answer } = data;
    console.log('Call accepted by:', to);
    io.to(to).emit('call-accepted', { answer });
  });

  socket.on('call-rejected', (data) => {
    const { to } = data;
    console.log('Call rejected by:', to);
    io.to(to).emit('call-rejected');
  });

  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    io.to(to).emit('ice-candidate', { candidate });
  });

  socket.on('end-call', (data) => {
    const { to } = data;
    console.log('Call ended to:', to);
    if (to) {
      io.to(to).emit('call-ended');
    }
  });

  socket.on('disconnect', () => {
    for (let [id, user] of onlineUsers.entries()) {
      if (user.socketId === socket.id) {
        console.log('User offline:', user.name);
        onlineUsers.delete(id);
        break;
      }
    }
    io.emit('users-updated', Array.from(onlineUsers.values()));
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`?? Server running on port ${PORT}`);
  console.log(`?? Allowed origins:`, ALLOWED_ORIGINS);
});