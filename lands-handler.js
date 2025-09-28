const express = require('express');
const router = express.Router();
const pool = require('./db'); // your MySQL connection pool

// ---------------------------
// GET all lands for a user
// ---------------------------
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
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

// ---------------------------
// POST: Add a new land
// ---------------------------
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
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

module.exports = router;
