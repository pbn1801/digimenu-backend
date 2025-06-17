import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config(); // Load biến môi trường từ .env
const NGROK_API_KEY = process.env.NGROK_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hàm lấy public ngrok URL
async function getNgrokUrl() {
  try {
    const res = await fetch('https://api.ngrok.com/tunnels', {
      headers: {
        Authorization: `Bearer ${NGROK_API_KEY}`,
        'Ngrok-Version': '2',
      },
    });

    const data = await res.json();
    const tunnel = data.tunnels?.find(t => t.proto === 'https');
    return tunnel?.public_url || null;
  } catch (error) {
    console.error('Lỗi khi lấy ngrok URL:', error.message);
    return null;
  }
}

// Lấy URL ngrok nếu có
const ngrokUrl = await getNgrokUrl();

// Định nghĩa Swagger
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Restaurant Management API',
      version: '1.0.0',
      description: 'API for managing restaurant.',
    },
    servers: [
      {
        url: 'https://digimenu-backend-production.up.railway.app/api',
        description: 'Production on Railway',
      },
      ...(ngrokUrl
        ? [{
            url: `${ngrokUrl}/api`,
            description: 'Ngrok tunnel',
          }]
        : []),
      {
        url: 'http://localhost:5000/api',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [],
  },
  apis: [path.join(__dirname, 'controllers', '*.js')], // đường dẫn chứa các file swagger comment
};

const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
