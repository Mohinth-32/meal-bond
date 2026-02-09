import fs from 'fs';
import csv from 'csv-parser';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();
/* ================= DB POOL (UNCHANGED) ================= */

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/* ================= CATEGORY DATA ================= */

const minerals = [
  'Calcium',
  'Iron',
  'Magnesium',
  'Phosphorus',
  'Potassium',
  'Sodium',
  'Zinc',
  'Copper',
  'Manganese',
  'Selenium',
];

const aminoAcids = [
  'Tryptophan',
  'Threonine',
  'Isoleucine',
  'Leucine',
  'Lysine',
  'Methionine',
  'Phenylalanine',
  'Tyrosine',
  'Valine',
  'Histidine',
  'Alanine',
  'Arginine',
  'Aspartic acid',
  'Glutamic acid',
  'Glycine',
  'Proline',
  'Serine',
  'Cystine',
];

/* ================= CATEGORY LOGIC ================= */

function getCategory(name = '') {
  const n = name.toLowerCase();

  if (n.includes('energy')) return 'Energy';
  if (n.includes('vitamin')) return 'Vitamins';
  if (n.includes('fatty acid')) return 'Fatty Acids';
  if (n.includes('cholesterol')) return 'Lipids';

  if (
    name === 'Protein' ||
    name === 'Total lipid (fat)' ||
    name === 'Carbohydrate, by difference'
  )
    return 'Macronutrients';

  if (n.includes('sugar') || n.includes('fiber') || n.includes('starch'))
    return 'Carbohydrates';

  if (minerals.includes(name)) return 'Minerals';
  if (aminoAcids.includes(name)) return 'Amino Acids';

  return 'Other';
}

/* ================= SORT ORDER ================= */

function getSortOrder(name, rank) {
  if (name === 'Energy') return 1;
  if (name === 'Protein') return 2;
  if (name === 'Total lipid (fat)') return 3;
  if (name === 'Carbohydrate, by difference') return 4;

  if (rank && !isNaN(rank)) return Math.min(Number(rank), 9999);
  return 999;
}

/* ================= CSV READ ================= */

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/* ================= MAIN IMPORT ================= */

async function importNutrients() {
  const rows = await readCSV('nutrient.csv');

  const sql = `
    INSERT INTO nutrients
      (name, unit, category, usda_nutrient_number, is_visible, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      unit = VALUES(unit),
      category = VALUES(category),
      sort_order = VALUES(sort_order)
  `;

  let success = 0;

  for (const row of rows) {
    if (!row.name || !row.id) continue;

    try {
      const name = row.name.trim();
      const unit = row.unit_name?.toLowerCase() || '';
      const category = getCategory(name);

      await pool.query(sql, [
        name,
        unit,
        category,
        row.id,
        1,
        getSortOrder(name, row.rank),
      ]);

      success++;
    } catch (err) {
      console.error('❌ Insert failed:', row.name, err.message);
    }
  }

  console.log(`✅ Imported / updated ${success} nutrients`);
  await pool.end();
}

/* ================= RUN ================= */

importNutrients().catch((err) => {
  console.error('❌ Import crashed:', err);
  process.exit(1);
});
