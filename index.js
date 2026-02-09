import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
app.post('/search-foods', async (req, res) => {
  try {
    const searchParams = req.body;
    const result = await searchFoods(searchParams);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route to check if foods exist in database
app.post('/giveas-items', async (req, res) => {
  try {
    const { foods } = req.body;

    if (!foods || !Array.isArray(foods) || foods.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'foods array is required' });
    }

    const foodNames = foods.map((f) => f.name);

    // Query to find which foods exist in the database
    const [rows] = await pool.query(
      'SELECT name FROM foods WHERE name IN (?)',
      [foodNames]
    );

    const foundFoods = rows.map((row) => row.name.toLowerCase());
    const missingFoods = foodNames.filter(
      (name) => !foundFoods.includes(name.toLowerCase())
    );
    const availableFoods = foods.filter((food) =>
      foundFoods.includes(food.name.toLowerCase())
    );

    if (missingFoods.length === 0) {
      return res.json({
        success: true,
        message: 'All foods are available',
        'available-foods': availableFoods,
      });
    } else {
      return res.json({
        'missing-foods': missingFoods,
        'available-foods': availableFoods,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { searchFoods };

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
