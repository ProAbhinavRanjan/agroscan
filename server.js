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
const AI_PROVIDER = process.env.AI_PROVIDER || "openai"; // "openai" or "huggingface"

// -------------------------
// Middleware
// -------------------------
app.use(cors());
app.use(bodyParser.json());

// Multer setup for profile image uploads (in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// -------------------------
// MySQL Connection Pool
// -------------------------
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "agroscan_ai",
});

// -------------------------
// Health Check
// -------------------------
app.get("/", (req, res) => {
  res.send(`🌱 AgroScan AI Server Running... (Active Provider: ${AI_PROVIDER})`);
});

// =====================================================
// RECOMMENDATION ENDPOINT
// =====================================================
app.post("/recommend", async (req, res) => {
  try {
    const { ph, moisture, temperature, location, desiredCrop } = req.body;
    if (!ph || !moisture)
      return res.status(400).json({ error: "Soil pH and moisture are required" });

    // Local Rule Engine
    const ruleResponse = ruleEngine(ph, moisture, temperature);

    // AI Recommendation
    let aiResponse;
    if (AI_PROVIDER === "openai") {
      aiResponse = await askAI({ ph, moisture, temperature, location, desiredCrop });
    } else {
      aiResponse = await askHFRecommend({ ph, moisture, temperature, location, desiredCrop });
    }

    res.json({ ruleEngine: ruleResponse, aiResponse });
  } catch (err) {
    console.error("❌ Server error (recommend):", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// CHAT ENDPOINT
// =====================================================
app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message || !userId)
      return res.status(400).json({ error: "Message and userId are required" });

    // Ensure session exists
    const [rows] = await db.query(
      "SELECT session_id FROM chat_sessions WHERE user_id = ? AND ended_at IS NULL LIMIT 1",
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

    // Fetch last 20 messages
    const [historyRows] = await db.query(
      "SELECT sender, message FROM ai_chats WHERE user_id = ? ORDER BY timestamp ASC LIMIT 20",
      [userId]
    );

    // Save user message
    await db.query(
      "INSERT INTO ai_chats (session_id, user_id, message, sender) VALUES (?, ?, ?, 'user')",
      [sessionId, userId, message]
    );

    // Prepare messages for AI
    const messagesForAI = historyRows.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.message,
    }));
    messagesForAI.push({ role: "user", content: message });

    // Call AI
    let aiResponse;
    if (AI_PROVIDER === "openai") {
      aiResponse = await askAIChat(messagesForAI);
    } else {
      aiResponse = await askHFChat(messagesForAI);
    }

    // Save AI response
    await db.query(
      "INSERT INTO ai_chats (session_id, user_id, message, sender) VALUES (?, ?, ?, 'ai')",
      [sessionId, userId, aiResponse]
    );

    res.json({ aiResponse });
  } catch (err) {
    console.error("❌ Server error (/chat):", err);
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
      "SELECT chat_id AS id, sender, message, timestamp FROM ai_chats WHERE user_id = ? ORDER BY chat_id ASC LIMIT ? OFFSET ?",
      [userId, limit, offset]
    );

    const [totalRows] = await db.query(
      "SELECT COUNT(*) AS total FROM ai_chats WHERE user_id = ?",
      [userId]
    );

    const total = totalRows[0].total;

    res.json({
      history: rows,
      hasMore: offset + rows.length < total,
    });
  } catch (err) {
    console.error("❌ Error fetching chat history:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// Clear chat
app.delete("/api/chat/clear/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const [result] = await db.query(
      "DELETE FROM ai_chats WHERE user_id = ?",
      [userId]
    );

    res.json({ success: true, deletedCount: result.affectedRows });
  } catch (err) {
    console.error("❌ Error clearing chats:", err);
    res.status(500).json({ success: false, error: "Failed to clear chats" });
  }
});

// =====================================================
// USER MANAGEMENT
// =====================================================

// Get user info
app.get("/api/users/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const [results] = await db.query(
      "SELECT user_id, username, name, email, phone FROM users WHERE user_id = ?",
      [userId]
    );

    if (results.length === 0)
      return res.status(404).json({ message: "User not found" });

    const user = results[0];
    res.json({
      userId: user.user_id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profileUrl: `/api/users/${user.user_id}/profile`,
    });
  } catch (err) {
    console.error("❌ Server error (get user):", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Get user info with address
app.get("/api/users/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const [results] = await db.query(
      `SELECT street, city, state, zip, country
       FROM users WHERE user_id = ?`,
      [userId]
    );

    if (results.length === 0)
      return res.status(404).json({ message: "User not found" });

    const user = results[0];
    res.json({
      userId: user.user_id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: {
        street: user.street,
        city: user.city,
        state: user.state,
        zip: user.zip,
        country: user.country
      },
      profileUrl: `/api/users/${user.user_id}/profile`
    });
  } catch (err) {
    console.error("❌ Server error (get user):", err);
    res.status(500).json({ error: "Database error" });
  }
});


// Login
app.post("/api/login", async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const [results] = await db.query(
      "SELECT user_id, username, name, email, phone, password FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1",
      [identifier, identifier, identifier]
    );

    if (results.length === 0)
      return res.status(401).json({ error: "User not found" });

    const user = results[0];
    if (user.password !== password)
      return res.status(401).json({ error: "Incorrect password" });

    res.json({
      userId: user.user_id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profileUrl: `/api/users/${user.user_id}/profile`,
    });
  } catch (err) {
    console.error("❌ Server error (login):", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Signup
app.post("/api/signup", async (req, res) => {
  const { name, username, email, phone, password } = req.body;
  if (!name || !username || !email || !phone || !password)
    return res.status(400).json({ error: "All fields are required" });

  try {
    const [result] = await db.query(
      "INSERT INTO users (name, username, email, phone, password) VALUES (?, ?, ?, ?, ?)",
      [name, username, email, phone, password]
    );

    res.status(201).json({ message: "User created successfully", userId: result.insertId });
  } catch (err) {
    console.error("❌ Database error (signup):", err);
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Username, email, or phone already exists" });
    res.status(500).json({ error: "Database error" });
  }
});

// =====================================================
// PROFILE IMAGE
// =====================================================

// GET profile image
app.get("/api/users/:userId/profile", async (req, res) => {
  const userId = req.params.userId;
  try {
    const [rows] = await db.query("SELECT profile FROM users WHERE user_id = ?", [userId]);
    if (rows.length === 0 || !rows[0].profile)
      return res.status(404).send("Profile image not found");

    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(rows[0].profile);
  } catch (err) {
    console.error("❌ Error fetching profile image:", err);
    res.status(500).send("Server error");
  }
});

// UPLOAD profile image
app.post("/api/users/:userId/profile", upload.single("profile"), async (req, res) => {
  const userId = req.params.userId;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const [result] = await db.query(
      "UPDATE users SET profile = ? WHERE user_id = ?",
      [req.file.buffer, userId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile image updated successfully", profileUrl: `/api/users/${userId}/profile` });
  } catch (err) {
    console.error("❌ Error updating profile image:", err);
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
  console.log(`👉 Active AI-Chat Provider: ${AI_PROVIDER}`);
});



