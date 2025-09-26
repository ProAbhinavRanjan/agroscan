// backend/userController.js
const express = require('express');
const router = express.Router();
const db = require('./db'); // Make sure this exports your MySQL connection

///////////////////////////////////////////////////////////
// ✅ GET USER INFO
///////////////////////////////////////////////////////////

/**
 * GET /api/users/:userId
 * Fetch user info by ID (returns profileUrl)
 */
router.get('/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT user_id, username, name, email, phone
        FROM users
        WHERE user_id = ?
        LIMIT 1
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = results[0];
        res.json({
            userId: user.user_id,
            username: user.username,
            name: user.name,
            email: user.email,
            phone: user.phone,
            profileUrl: `/api/users/${user.user_id}/profile`
        });
    });
});

///////////////////////////////////////////////////////////
// ✅ GET PROFILE IMAGE
///////////////////////////////////////////////////////////

/**
 * GET /api/users/:userId/profile
 * Serve profile image BLOB
 */
router.get('/:userId/profile', async (req, res) => {
    const userId = req.params.userId;

    try {
        const [rows] = await db.promise().query(
            "SELECT profile FROM users WHERE user_id = ?",
            [userId]
        );

        if (rows.length === 0 || !rows[0].profile) {
            return res.status(404).send("Profile image not found");
        }

        res.writeHead(200, { 'Content-Type': 'image/jpeg' }); // Change to image/png if needed
        res.end(rows[0].profile);
    } catch (err) {
        console.error("❌ Error fetching profile image:", err);
        res.status(500).send("Server error");
    }
});

///////////////////////////////////////////////////////////
// ✅ LOGIN
///////////////////////////////////////////////////////////

/**
 * POST /api/login
 * Login with username/email/phone + password
 */
router.post('/login', (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: "Identifier and password are required" });
    }

    const query = `
        SELECT user_id, username, name, email, phone, password
        FROM users
        WHERE username = ? OR email = ? OR phone = ?
        LIMIT 1
    `;

    db.query(query, [identifier, identifier, identifier], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = results[0];

        if (user.password !== password) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        res.json({
            userId: user.user_id,
            username: user.username,
            name: user.name,
            email: user.email,
            phone: user.phone,
            profileUrl: `/api/users/${user.user_id}/profile`
        });
    });
});

///////////////////////////////////////////////////////////
// ✅ SIGNUP
///////////////////////////////////////////////////////////

/**
 * POST /api/signup
 * Create a new user
 */
router.post('/signup', (req, res) => {
    const { name, username, email, phone, password } = req.body;

    if (!name || !username || !email || !phone || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    const query = `
        INSERT INTO users (name, username, email, phone, password)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(query, [name, username, email, phone, password], (err, result) => {
        if (err) {
            console.error("❌ Database error:", err);
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ error: "Username, email, or phone already exists" });
            }
            return res.status(500).json({ error: "Database error" });
        }

        res.status(201).json({
            message: "User created successfully",
            userId: result.insertId
        });
    });
});

module.exports = router;
