import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Load biến môi trường từ .env
dotenv.config();

console.log('JWT_SECRET loaded:', process.env.JWT_SECRET);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*', // Sử dụng * để test local, đổi về FRONTEND_URL khi deploy
    methods: ['GET', 'POST', 'PUT'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
});

// Kết nối MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`Received ${req.method} request at ${req.path}`);
  next();
});

// Lưu io vào app để sử dụng trong controllers
app.set('io', io);

// Lắng nghe sự kiện WebSocket
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`Client ${socket.id} joined room: ${room}`);
  });

  socket.on('join_all_rooms', (rooms) => {
    rooms.forEach(room => {
      socket.join(room);
      console.log(`Client ${socket.id} joined room: ${room}`);
    });
  });

  socket.on('disconnect', () => {
    console.log('A client disconnected:', socket.id);
  });
});

// Sử dụng router tổng hợp
app.use('/api', routes);

// Tích hợp Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Error middleware should be the last middleware
app.use(errorHandler);

// Khởi chạy server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});