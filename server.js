// -------------------------
// AgroScan AI - Server.js
// -------------------------
// Author: ABHINAV RANJAN & Team
// Company: AgroScan AI Solutions
// Description:
//  Main server file for AgroScan AI.
//  Provides endpoints for Chat, Recommendation, User Management, and Profile handling.
//  Supports both OpenAI and Hugging Face as AI providers.
// -------------------------

import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import multer from "multer";
import mysql from "mysql2/promise";

// Local modules
import { ruleEngine } from "./ruleEngine.js";
import { askAI } from "./openai-recommend-handler.js";
import { askAIChat } from "./openai-chat-handler.js";
import { askHFRecommend } from "./huggingface-recommend-handler.js";
import { askHFChat } from "./huggingface-chat-handler.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const AI_PROVIDER = process.env.AI_PROVIDER || "openai";

// -------------------------
// Middleware
// -------------------------
app.use(cors());
app.use(bodyParser.json());

// Multer setup for profile image uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------
// MySQL Pool
// -------------------------
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// -------------------------
// Health Check
// -------------------------
app.get("/", (req, res) => {
  res.send(`🌱 AgroScan AI Server Running (Provider: ${AI_PROVIDER})`);
});

// =====================================================
// RECOMMENDATION
// =====================================================
app.post("/recommend", async (req, res) => {
  try {
    const { ph, moisture, temperature, location, desiredCrop } = req.body;
    if (ph == null || moisture == null)
      return res.status(400).json({ error: "Soil pH and moisture required" });

    const ruleResponse = ruleEngine(ph, moisture, temperature);

    const aiResponse = AI_PROVIDER === "openai"
      ? await askAI({ ph, moisture, temperature, location, desiredCrop })
      : await askHFRecommend({ ph, moisture, temperature, location, desiredCrop });

    res.json({ ruleEngine: ruleResponse, aiResponse });
  } catch (err) {
    console.error("❌ /recommend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// CHAT
// =====================================================
app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message || !userId)
      return res.status(400).json({ error: "Message and userId required" });

    const [rows] = await db.query(
      "SELECT session_id FROM chat_sessions WHERE user_id=? AND ended_at IS NULL LIMIT 1",
      [userId]
    );

    let sessionId;
    if (rows.length === 0) {
      const [result] = await db.query(
        "INSERT INTO chat_sessions (user_id) VALUES (?)",
        [userId]
      );
      sessionId = result.insertId;
    } else {
      sessionId = rows[0].session_id;
    }

    const [historyRows] = await db.query(
      "SELECT sender, message FROM ai_chats WHERE user_id=? ORDER BY timestamp ASC LIMIT 20",
      [userId]
    );

    await db.query(
      "INSERT INTO ai_chats (session_id,user_id,message,sender) VALUES (?,?,?, 'user')",
      [sessionId, userId, message]
    );

    const messagesForAI = historyRows.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.message
    }));
    messagesForAI.push({ role: "user", content: message });

    const aiResponse = AI_PROVIDER === "openai"
      ? await askAIChat(messagesForAI)
      : await askHFChat(messagesForAI);

    await db.query(
      "INSERT INTO ai_chats (session_id,user_id,message,sender) VALUES (?,?,?, 'ai')",
      [sessionId, userId, aiResponse]
    );

    res.json({ aiResponse });
  } catch (err) {
    console.error("❌ /chat error:", err);
    res.status(500).json({ aiResponse: "AI failed to respond" });
  }
});

// =====================================================
// CHAT HISTORY
// =====================================================
app.get("/api/chat/history/:userId", async (req, res) => {
  const userId = req.params.userId;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const [rows] = await db.query(
      "SELECT chat_id AS id, sender, message, timestamp FROM ai_chats WHERE user_id=? ORDER BY chat_id ASC LIMIT ? OFFSET ?",
      [userId, limit, offset]
    );

    const [totalRows] = await db.query(
      "SELECT COUNT(*) AS total FROM ai_chats WHERE user_id=?",
      [userId]
    );

    res.json({
      history: rows,
      hasMore: offset + rows.length < totalRows[0].total
    });
  } catch (err) {
    console.error("❌ chat history error:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// Clear chat
app.delete("/api/chat/clear/:userId", async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM ai_chats WHERE user_id=?",
      [req.params.userId]
    );
    res.json({ success: true, deletedCount: result.affectedRows });
  } catch (err) {
    console.error("❌ clear chat error:", err);
    res.status(500).json({ success: false, error: "Failed to clear chats" });
  }
});

// =====================================================
// USER MANAGEMENT
// =====================================================
app.get("/api/users/:userId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT user_id, username, name, email, phone, street, city, state, zip, country FROM users WHERE user_id=?",
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const u = rows[0];
    res.json({
      userId: u.user_id, username: u.username, name: u.name, email: u.email,
      phone: u.phone, street: u.street, city: u.city, state: u.state, zip: u.zip,
      country: u.country, profileUrl: `/api/users/${u.user_id}/profile`
    });
  } catch (err) {
    console.error("❌ get user error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.put("/api/users/:userId", async (req, res) => {
  try {
    const { name, username, email, phone } = req.body;
    const [result] = await db.query(
      "UPDATE users SET name=?, username=?, email=?, phone=? WHERE user_id=?",
      [name, username, email, phone, req.params.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: "Primary info updated successfully" });
  } catch (err) {
    console.error("❌ update primary error:", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username or email exists" });
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/users/:userId/address", async (req, res) => {
  try {
    const { street, city, state, zip, country } = req.body;
    const [result] = await db.query(
      "UPDATE users SET street=?, city=?, state=?, zip=?, country=? WHERE user_id=?",
      [street, city, state, zip, country, req.params.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: "Address updated successfully" });
  } catch (err) {
    console.error("❌ update address error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// LANDS MANAGEMENT
// =====================================================

// GET ALL LANDS FOR A USER
app.get('/api/users/:userId/lands', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM lands WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Fetch lands error:', err);
    res.status(500).json({ error: 'Failed to fetch lands' });
  }
});

// GET SINGLE LAND BY ID
app.get('/api/users/:userId/lands/:landId', async (req, res) => {
  const { userId, landId } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM lands WHERE user_id = ? AND id = ?',
      [userId, landId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Land not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Fetch single land error:', err);
    res.status(500).json({ error: 'Failed to fetch land details' });
  }
});

// ADD NEW LAND
app.post('/api/users/:userId/lands', async (req, res) => {
  const { userId } = req.params;
  const { land_name, size, crop, soil_type, ph, moisture, temperature, light, street, city, state, zip, country } = req.body;

  if (!land_name || !size) {
    return res.status(400).json({ error: 'land_name and size are required' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO lands 
      (user_id, land_name, size, crop, soil_type, ph, moisture, temperature, light, street, city, state, zip, country, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, land_name, size, crop || null, soil_type || null, ph || null, moisture || null, temperature || null, light || null, street || null, city || null, state || null, zip || null, country || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Land added successfully' });
  } catch (err) {
    console.error('❌ Add land error:', err);
    res.status(500).json({ error: 'Failed to add land' });
  }
});

// UPDATE LAND
app.put('/api/users/:userId/lands/:landId', async (req, res) => {
  const { userId, landId } = req.params;
  const { land_name, size, crop, soil_type, ph, moisture, temperature, light, street, city, state, zip, country } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE lands SET 
      land_name = ?, size = ?, crop = ?, soil_type = ?, ph = ?, moisture = ?, temperature = ?, light = ?, 
      street = ?, city = ?, state = ?, zip = ?, country = ? 
      WHERE user_id = ? AND id = ?`,
      [land_name, size, crop || null, soil_type || null, ph || null, moisture || null, temperature || null, light || null, street || null, city || null, state || null, zip || null, country || null, userId, landId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Land not found' });

    res.json({ message: 'Land updated successfully' });
  } catch (err) {
    console.error('❌ Update land error:', err);
    res.status(500).json({ error: 'Failed to update land' });
  }
});

// DELETE LAND
app.delete('/api/users/:userId/lands/:landId', async (req, res) => {
  const { userId, landId } = req.params;
  try {
    const [result] = await db.query(
      'DELETE FROM lands WHERE user_id = ? AND id = ?',
      [userId, landId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Land not found' });

    res.json({ message: 'Land deleted successfully' });
  } catch (err) {
    console.error('❌ Delete land error:', err);
    res.status(500).json({ error: 'Failed to delete land' });
  }
});


// =====================================================
// LOGIN / SIGNUP
// =====================================================
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username=? OR email=? OR phone=? LIMIT 1",
      [identifier, identifier, identifier]
    );
    if (!rows.length) return res.status(401).json({ error: "User not found" });

    const u = rows[0];
    if (u.password !== password) return res.status(401).json({ error: "Incorrect password" });

    res.json({
      userId: u.user_id, username: u.username, name: u.name,
      email: u.email, phone: u.phone, profileUrl: `/api/users/${u.user_id}/profile`
    });
  } catch (err) {
    console.error("❌ login error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { name, username, email, phone, password } = req.body;
    if (!name || !username || !email || !phone || !password)
      return res.status(400).json({ error: "All fields required" });

    const [result] = await db.query(
      "INSERT INTO users (name, username, email, phone, password) VALUES (?,?,?,?,?)",
      [name, username, email, phone, password]
    );

    res.status(201).json({ message: "User created", userId: result.insertId });
  } catch (err) {
    console.error("❌ signup error:", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username/email/phone exists" });
    res.status(500).json({ error: "Database error" });
  }
});

// =====================================================
// PROFILE IMAGE
// =====================================================
app.get("/api/users/:userId/profile", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT profile FROM users WHERE user_id=?",
      [req.params.userId]
    );
    if (!rows.length || !rows[0].profile) return res.status(404).send("Profile image not found");

    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(rows[0].profile);
  } catch (err) {
    console.error("❌ profile get error:", err);
    res.status(500).send("Server error");
  }
});

app.post("/api/users/:userId/profile", upload.single("profile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const [result] = await db.query(
      "UPDATE users SET profile=? WHERE user_id=?",
      [req.file.buffer, req.params.userId]
    );

    if (!result.affectedRows) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile image updated", profileUrl: `/api/users/${req.params.userId}/profile` });
  } catch (err) {
    console.error("❌ profile upload error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// TEST SERVER
// =====================================================
app.get("/test", (req, res) => {
  res.json({ status: "Server is running!" });
});

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, () => {
  console.log(`✅ AgroScan server running on http://localhost:${PORT}`);
  console.log(`👉 Active AI Provider: ${AI_PROVIDER}`);
});


