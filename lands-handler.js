import express from 'express';
import pool from './db.js'; // your MySQL pool

const router = express.Router();

// GET all lands for a user
router.get('/', async (req, res) => {
  const userId = req.params.userId; // from mounted route
  try {
    const [rows] = await pool.query(
      'SELECT * FROM lands WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch lands' });
  }
});

// POST: Add a new land
router.post('/', async (req, res) => {
  const userId = req.params.userId; // from mounted route
  const { land_name, size, crop } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO lands (user_id, land_name, size, crop) VALUES (?, ?, ?, ?)',
      [userId, land_name, size, crop || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Land added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add land' });
  }
});

export default router;
