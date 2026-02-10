import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ✅ MySQL Database Connection (FIXED)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    rejectUnauthorized: false,
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connected to MySQL database successfully!');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to MySQL:', error.message);
  }
}

testConnection();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Example route to test database
app.get('/db-test', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ success: true, result: rows[0].result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { pool };

// Function to search foods using USDA Food Data Central API
async function searchFoods(searchParams) {
  const apiKey = process.env.USDA_API_KEY;
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`;

  try {
    const response = await axios.post(url, searchParams, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error searching foods:', error.message);
    throw error;
  }
}

// Route to search foods
app.post('/giveas-items', async (req, res) => {
  try {
    let rawBody = req.body;

    // 1️⃣ If body is a string (n8n streaming mode)
    if (typeof rawBody === 'string') {
      try {
        rawBody = JSON.parse(rawBody);
        console.log('Parsed raw body from string:', rawBody);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Request body is not valid JSON',
        });
      }
    }

    // 2️⃣ n8n wraps payload inside "body"
    const payload = rawBody.body ?? rawBody;

    const resumeUrlReceived = payload['resume-url'];
    if (resumeUrlReceived) {
      resumeUrl = resumeUrlReceived;
      console.log('Stored resume URL:');
    }

    // 3️⃣ Parse data field
    let foods;

    if (typeof payload.data === 'string') {
      try {
        const parsedData = JSON.parse(payload.data.trim());
        foods = parsedData.foods;
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON inside data field',
        });
      }
    } else if (payload.data?.foods) {
      foods = payload.data.foods;
    }

    console.log('FINAL foods value:', foods);

    // 4️⃣ Validate
    if (!Array.isArray(foods) || foods.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'foods array is required',
      });
    }

    // 5️⃣ DB logic
    const foodNames = foods.map((f) => f.name);

    const [rows] = await pool.query(
      'SELECT name FROM foods WHERE name IN (?)',
      [foodNames]
    );

    const foundFoods = rows.map((r) => r.name.toLowerCase());

    const availableFoods = foods.filter((f) =>
      foundFoods.includes(f.name.toLowerCase())
    );

    const missingFoods = foodNames.filter(
      (name) => !foundFoods.includes(name.toLowerCase())
    );

    return res.status(200).json({
      success: true,
      message: 'Foods processed',
      data: {
        availableFoods,
        missingFoods,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Store resume URL for later use
let resumeUrl = null;

export { searchFoods };

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
