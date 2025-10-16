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

// Core Imports
// These handle HTTP server, environment variables, request parsing, CORS, file uploads, database connections, password hashing (for dev), and system commands.
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import multer from "multer";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";   // used for dev password hashing
import { exec } from "child_process"; // if you want to run server commands, e.g., logs count
import os from "os";  

// Local Modules
// These are custom handlers for Perplexity AI and rule engine for recommendations.
import { ruleEngine } from "./ruleEngine.js";
import { askPerplexityRecommend } from "./perplexity-recommend-handler.js";
import { askPerplexityChat } from "./perplexity-chat-handler.js";

// Load Environment Variables
// Configures the app with sensitive data like DB credentials and AI provider from .env file.
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;  // Server port, defaults to 3000 if not set in .env
const AI_PROVIDER = process.env.AI_PROVIDER || "openai";  // Default AI provider, can be overridden per request

// -------------------------
// Middleware Setup
// -------------------------
// Enables Cross-Origin Resource Sharing (CORS) for frontend-backend communication.
app.use(cors());

// Parses incoming JSON requests into JavaScript objects.
app.use(bodyParser.json());

// Multer setup for profile image uploads (memory storage)
// Configures file upload middleware to store images in memory (as buffers) for database storage.
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------
// Database Connection Pool
// -------------------------
// Creates a connection pool to MySQL database using credentials from .env.
// This allows efficient handling of multiple concurrent queries.
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// -------------------------
// Health Check and Test Endpoints
// -------------------------
// Basic root endpoint to confirm server is running and show active AI provider.
app.get("/", (req, res) => {
  res.send(`🌱 AgroScan AI Server Running (Provider: ${AI_PROVIDER})`);
});

// Test endpoint for deployment verification.
app.get("/test", (req, res) => {
  res.json({ status: "Server is running!" });
});

// -------------------------
// Server Stats Endpoint
// -------------------------
// Provides system-level stats like memory, CPU, uptime for monitoring (developer use).
app.get("/api/server/stats", (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg(); // [1min, 5min, 15min]
    const uptime = process.uptime(); // in seconds
    const cpuInfo = os.cpus();
    const nodeVersion = process.version;
    const platform = os.platform();
    const arch = os.arch();

    res.json({
      success: true,
      stats: {
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
          totalMem,
          freeMem
        },
        cpu: {
          cores: cpuInfo.length,
          model: cpuInfo[0].model,
          speed: cpuInfo[0].speed,
          loadAvg
        },
        uptimeSeconds: uptime,
        platform,
        arch,
        nodeVersion
      }
    });
  } catch (err) {
    console.error("❌ /api/server/stats error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch server stats" });
  }
});

// =====================================================
// USER MANAGEMENT ENDPOINTS
// =====================================================
// These handle user profiles, login, signup, password changes, and deletion.
// Note: Passwords are stored in plain text (insecure; consider hashing in production).

// GET User Profile by ID
// Fetches user details excluding password.
app.get("/api/users/:userId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT user_id, username, name, email, phone, street, city, state, zip, country FROM users WHERE user_id=?",
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User  not found" });

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

// PUT Update User Primary Info (name, username, email, phone)
app.put("/api/users/:userId", async (req, res) => {
  try {
    const { name, username, email, phone } = req.body;
    const [result] = await db.query(
      "UPDATE users SET name=?, username=?, email=?, phone=? WHERE user_id=?",
      [name, username, email, phone, req.params.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "User  not found" });
    res.json({ success: true, message: "Primary info updated successfully" });
  } catch (err) {
    console.error("❌ update primary error:", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username or email exists" });
    res.status(500).json({ error: "Server error" });
  }
});

// PUT Update User Address
app.put("/api/users/:userId/address", async (req, res) => {
  try {
    const { street, city, state, zip, country } = req.body;
    const [result] = await db.query(
      "UPDATE users SET street=?, city=?, state=?, zip=?, country=? WHERE user_id=?",
      [street, city, state, zip, country, req.params.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: "User  not found" });
    res.json({ success: true, message: "Address updated successfully" });
  } catch (err) {
    console.error("❌ update address error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT Change User Password (Plain Text Version)
// Verifies old password against plain-text stored password and updates to new one.
app.put('/api/users/:userId/change-password', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const { oldPassword, newPassword } = req.body;

  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Old and new passwords are required' });

  try {
    // Fetch current password
    const [rows] = await db.query(
      "SELECT password FROM users WHERE user_id=? LIMIT 1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User  not found' });

    const currentPassword = rows[0].password;

    // Verify old password (plain text comparison)
    if (oldPassword !== currentPassword) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    // Update to new password (plain text)
    const [result] = await db.query(
      "UPDATE users SET password=? WHERE user_id=?",
      [newPassword, userId]
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'User  not found' });

    res.json({ message: 'Password changed successfully!' });

  } catch (err) {
    console.error('❌ Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE User by ID
// Deletes user and related data (e.g., lands) in a transaction for data integrity.
app.delete('/api/users/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  const connection = await db.getConnection(); // get DB connection
  try {
    await connection.beginTransaction();

    // 1️⃣ Check if user exists
    const [users] = await connection.query("SELECT * FROM users WHERE user_id=?", [userId]);
    if (!users.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'User  not found' });
    }

    // 2️⃣ Optional: Delete related data (e.g., lands, orders, etc.)
    await connection.query("DELETE FROM lands WHERE user_id=?", [userId]);
    // Add more deletes here if you have other tables with user data

    // 3️⃣ Delete the user
    await connection.query("DELETE FROM users WHERE user_id=?", [userId]);

    await connection.commit();
    res.json({ message: "User  deleted successfully" });

  } catch (err) {
    await connection.rollback();
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Server error while deleting user" });
  } finally {
    connection.release();
  }
});

// POST User Login
// Authenticates user by username/email/phone and plain-text password.
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const [rows] = await db.query(
      "SELECT * FROM users WHERE username=? OR email=? OR phone=? LIMIT 1",
      [identifier, identifier, identifier]
    );
    if (!rows.length) return res.status(401).json({ error: "User  not found" });

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

// POST User Signup
// Creates a new user with provided details (plain-text password).
app.post("/api/signup", async (req, res) => {
  try {
    const { name, username, email, phone, password } = req.body;
    if (!name || !username || !email || !phone || !password)
      return res.status(400).json({ error: "All fields required" });

    const [result] = await db.query(
      "INSERT INTO users (name, username, email, phone, password) VALUES (?,?,?,?,?)",
      [name, username, email, phone, password]
    );

    res.status(201).json({ message: "User  created", userId: result.insertId });
  } catch (err) {
    console.error("❌ signup error:", err);
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username/email/phone exists" });
    res.status(500).json({ error: "Database error" });
  }
});

////////////////////////////////////////////////////////
// USER DESK
////////////////////////////////////////////////////////

// =====================================================
// LANDS MANAGEMENT ENDPOINTS
// =====================================================
// CRUD operations for user lands (farms/plots) tied to user ID.
// These endpoints allow users to manage their agricultural lands, including soil and environmental data for AI recommendations.

app.get('/api/users/:userId/lands', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id, land_name, size, crop, soil_type, ph, moisture, temperature, light,
              other_info, street, city, state, zip, country, created_at
       FROM lands 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Fetch lands error:', err);
    res.status(500).json({ error: 'Failed to fetch lands' });
  }
});

// GET Single Land by ID
// Fetches details of a specific land for the user; checks ownership via user_id to prevent unauthorized access.
app.get('/api/users/:userId/lands/:landId', async (req, res) => {
  const { userId, landId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id, land_name, size, crop, soil_type, ph, moisture, temperature, light,
              other_info, street, city, state, zip, country, created_at
       FROM lands 
       WHERE user_id = ? AND id = ?`,
      [userId, landId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Land not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Fetch single land error:', err);
    res.status(500).json({ error: 'Failed to fetch land details' });
  }
});

// POST Add New Land
// Creates a new land entry for the user; requires land_name and size; other fields (e.g., soil data, location) are optional and default to null if missing.
// Timestamp (created_at) is auto-set to NOW().
app.post('/api/users/:userId/lands', async (req, res) => {
  const { userId } = req.params;
  const { land_name, size, crop, soil_type, ph, moisture, temperature, light, other_info, street, city, state, zip, country } = req.body;

  // Validation: Ensure core fields are provided.
  if (!land_name || !size) {
    return res.status(400).json({ error: 'land_name and size are required' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO lands
        (user_id, land_name, size, crop, soil_type, ph, moisture, temperature, light, other_info,
         street, city, state, zip, country, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, land_name, size, crop || null, soil_type || null, ph || null, moisture || null,
       temperature || null, light || null, other_info || null, street || null, city || null, state || null, zip || null, country || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Land added successfully' });
  } catch (err) {
    console.error('❌ Add land error:', err);
    res.status(500).json({ error: 'Failed to add land' });
  }
});

// PUT Update Land
// Updates an existing land entry for the user; checks ownership via user_id and id.
// Optional fields default to null if not provided in the request body.
app.put('/api/users/:userId/lands/:landId', async (req, res) => {
  const { userId, landId } = req.params;
  const { land_name, size, crop, soil_type, ph, moisture, temperature, light, other_info, street, city, state, zip, country } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE lands SET
         land_name = ?, size = ?, crop = ?, soil_type = ?, ph = ?, moisture = ?, temperature = ?, light = ?, other_info = ?,
         street = ?, city = ?, state = ?, zip = ?, country = ?
       WHERE user_id = ? AND id = ?`,
      [land_name, size, crop || null, soil_type || null, ph || null, moisture || null, temperature || null, light || null, other_info || null,
       street || null, city || null, state || null, zip || null, country || null, userId, landId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Land not found' });
    res.json({ message: 'Land updated successfully' });
  } catch (err) {
    console.error('❌ Update land error:', err);
    res.status(500).json({ error: 'Failed to update land' });
  }
});

// DELETE Land by ID
// Removes a specific land for the user; checks ownership via user_id and id.
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
// ORDERS ENDPOINTS (UNDER USER DESK)
// =====================================================
// These handle order management for users (e.g., purchasing recommendations like seeds/fertilizers).
// Orders are tied to user_id and support multiple items per order.

// GET All Orders for a User
// Retrieves all orders for the user, ordered by creation date (newest first).
// Used for order history in the user dashboard.
app.get("/api/users/:userId/orders", async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Fetch orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// POST New Order
// Creates one or more order entries for the user (accepts array of items).
// Uses a transaction to ensure all items are inserted atomically; calculates item_total as qty * price.
// Optional fields like address, payment_method, coupon_code default to null.
app.post("/api/users/:userId/orders", async (req, res) => {
  const { userId } = req.params;
  const { items, address, payment_method, coupon_code, name, phone } = req.body;

  // Validation: Ensure at least one item is provided.
  if (!items || !items.length) {
    return res.status(400).json({ error: "Order items required" });
  }

  try {
    // Use a connection for transaction to handle multiple inserts reliably.
    const connection = await db.getConnection();
    await connection.beginTransaction();

    // Loop through each item and insert as a separate order row (one row per item).
    for (const item of items) {
      const { name: productName, qty, price } = item;

      await connection.query(
        `INSERT INTO orders 
         (user_id, customer_name, customer_phone, product_name, quantity, unit_price, item_total, address, payment_method, coupon_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, phone, productName, qty, price, qty * price, address || null, payment_method || null, coupon_code || null]
      );
    }

    // Commit the transaction if all inserts succeed.
    await connection.commit();
    connection.release();

    res.status(201).json({ message: "Order placed successfully!" });
  } catch (err) {
    // Rollback on error to prevent partial inserts.
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error("❌ Place order error:", err);
    res.status(500).json({ error: "Failed to place order" });
  }
});

// =====================================================
// RECOMMENDATION ENDPOINT
// =====================================================
// Provides AI-driven recommendations for crops/soil based on environmental data (pH, moisture, etc.).
// Always runs the ruleEngine first, then queries Perplexity AI.
app.post("/recommend", async (req, res) => {
  try {
    const { ph, moisture, temperature, location, desiredCrop } = req.body;

    // Validation: Core soil data required for meaningful recommendations.
    if (ph == null || moisture == null)
      return res.status(400).json({ error: "Soil pH and moisture required" });

    // Rule Engine always runs (local logic-based checks, e.g., basic suitability rules).
    const ruleResponse = ruleEngine(ph, moisture, temperature);

    // Call Perplexity AI handler for recommendation
    const aiResponse = await askPerplexityRecommend({ ph, moisture, temperature, location, desiredCrop });

    // Combine rule-based and AI responses for comprehensive output.
    res.json({ ruleEngine: ruleResponse, aiResponse });
  } catch (err) {
    console.error("❌ /recommend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// CHAT ENDPOINTS
// =====================================================
// Handles AI chat sessions for users (e.g., querying about agriculture advice).
// Manages sessions in DB (chat_sessions table) and message history (ai_chats table).

// POST Send Message to AI Chat
app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;
    if (!message || !userId)
      return res.status(400).json({ error: "Message and userId required" });

    // Fetch or create chat session (one active session per user).
    const [rows] = await db.query(
      "SELECT session_id FROM chat_sessions WHERE user_id=? AND ended_at IS NULL LIMIT 1",
      [userId]
    );

    let sessionId;
    if (rows.length === 0) {
      // Create new session if none active.
      const [result] = await db.query(
        "INSERT INTO chat_sessions (user_id) VALUES (?)",
        [userId]
      );
      sessionId = result.insertId;
    } else {
      sessionId = rows[0].session_id;
    }

    // Fetch recent chat history (last 5 messages, ordered by timestamp).
    const [historyRows] = await db.query(
      "SELECT sender, message FROM ai_chats WHERE user_id=? ORDER BY timestamp ASC LIMIT 5",
      [userId]
    );

    // Save user message to DB.
    await db.query(
      "INSERT INTO ai_chats (session_id,user_id,message,sender) VALUES (?,?,?, 'user')",
      [sessionId, userId, message]
    );

    // Prepare messages array for AI (format: role/content, with history + current message).
    const messagesForAI = historyRows.map(m => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.message
    }));
    messagesForAI.push({ role: "user", content: message });

    // Call Perplexity AI chat handler
    const aiResponse = await askPerplexityChat(messagesForAI);

    // Save AI response to DB.
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
// CHAT HISTORY ENDPOINTS
// =====================================================
// Allows users to view and manage their chat history.

// GET Chat History for User
// Fetches paginated chat messages (default limit 10, offset 0); includes total count for pagination.
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

    // Response includes history array and flag for more pages.
    res.json({
      history: rows,
      hasMore: offset + rows.length < totalRows[0].total
    });
  } catch (err) {
    console.error("❌ chat history error:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// DELETE Clear All Chats for User
// Permanently deletes all chat messages for the user (no session management here).
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
// PROFILE IMAGE ENDPOINTS
// =====================================================
// Handles user profile picture upload and retrieval (stored as binary buffer in users.profile column).
// Uses multer for file handling; supports JPEG (Content-Type set on GET).

// GET User Profile Image
// Retrieves and streams the profile image as binary data; 404 if not set.
app.get("/api/users/:userId/profile", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT profile FROM users WHERE user_id=?",
      [req.params.userId]
    );
    if (!rows.length || !rows[0].profile) return res.status(404).send("Profile image not found");

    // Set response headers for image streaming.
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(rows[0].profile);  // profile is a Buffer from DB.
  } catch (err) {
    console.error("❌ profile get error:", err);
    res.status(500).send("Server error");
  }
});

// POST Upload User Profile Image
// Uploads and stores image as binary in DB using multer (single file, memory storage).
// Expects multipart/form-data with 'profile' field.
app.post("/api/users/:userId/profile", upload.single("profile"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const [result] = await db.query(
      "UPDATE users SET profile=? WHERE user_id=?",
      [req.file.buffer, req.params.userId]
    );

    if (!result.affectedRows) return res.status(404).json({ error: "User  not found" });

    res.json({ message: "Profile image updated", profileUrl: `/api/users/${req.params.userId}/profile` });
  } catch (err) {
    console.error("❌ profile upload error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// CONTROLS MANAGEMENT ENDPOINTS
// =====================================================
// CRUD operations for system controls (stored in 'controls' table).
// These are feature flags or config values (e.g., function_name as key, value as setting).
// Full CRUD: GET all/single, POST add, PUT update, DELETE remove.
// Note: Original code had partial duplicates; consolidated here for clarity without changes.

// GET All Controls
// Fetches all control entries from DB.
app.get('/api/controls', async (req, res) => {
  try {
    const [rows] = await db.query("SELECT function_name, value FROM controls");
    res.json(rows);
  } catch (err) {
    console.error("❌ Fetch controls error:", err);
    res.status(500).json({ error: "Failed to fetch controls" });
  }
});

// GET Single Control by function_name
// Fetches a specific control; 404 if not found.
app.get('/api/controls/:function_name', async (req, res) => {
  const { function_name } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT function_name, value FROM controls WHERE function_name=?",
      [function_name]
    );
    if (!rows.length) return res.status(404).json({ error: "Control not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fetch control error:", err);
    res.status(500).json({ error: "Failed to fetch control" });
  }
});

// POST Add New Control
// Inserts a new control; 409 if function_name already exists (unique key assumed).
app.post("/api/controls", async (req, res) => {
  const { function_name, value } = req.body;
  if (!function_name || value === undefined) {
    return res.status(400).json({ error: "Function and Value are required" });
  }

  try {
    const [result] = await db.query(
      "INSERT INTO controls (function_name, value) VALUES (?, ?)",
      [function_name, value]
    );
    res.status(201).json({ message: "Control added", id: result.insertId });
  } catch (err) {
    console.error("❌ Add control error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Function already exists" });
    }
    res.status(500).json({ error: "Failed to add control" });
  }
});

// PUT Update Control
// Updates value for an existing control by function_name; 404 if not found.
app.put("/api/controls/:function_name", async (req, res) => {
  const { function_name } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: "Value is required" });
  }

  try {
    const [result] = await db.query(
      "UPDATE controls SET value=? WHERE function_name=?",
      [value, function_name]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Control not found" });
    }

    res.json({ message: "Control updated successfully" });
  } catch (err) {
    console.error("❌ Update control error:", err);
    res.status(500).json({ error: "Failed to update control" });
  }
});

// DELETE Control by function_name
// Removes a specific control; 404 if not found.
app.delete("/api/controls/:function_name", async (req, res) => {
  const { function_name } = req.params;

  try {
    const [result] = await db.query(
      "DELETE FROM controls WHERE function_name=?",
      [function_name]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Control not found" });
    }

    res.json({ message: "Control deleted successfully" });
  } catch (err) {
    console.error("❌ Delete control error:", err);
    res.status(500).json({ error: "Failed to delete control" });
  }
});

////////////////////////////////////////////////////////
// DEVELOPER DESK
////////////////////////////////////////////////////////
// Developer-specific endpoints for authentication, profile management, raw DB access, and debugging.
// These are for admin/dev users (separate 'devusers' table); no user-level auth required on most.
// Warning: High-risk features like /api/sql-run allow arbitrary SQL (use cautiously in production).

// POST Developer Login (Email/Password)
// Authenticates dev user by email and plain-text password (insecure; bcrypt recommended).
// Returns dev user details on success.
app.post("/api/dev-login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email & password required" });

    const [rows] = await db.query("SELECT * FROM devusers WHERE email=? LIMIT 1", [email]);
    if (!rows.length) return res.status(401).json({ success: false, message: "Developer not found" });

    const dev = rows[0];
    // Password verification (assuming plain text, bcrypt recommended)
    if (dev.password !== password) return res.status(401).json({ success: false, message: "Incorrect password" });

    res.json({ success: true, user: dev });
  } catch (err) {
    console.error("❌ dev-login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST Developer Login (UDC/QR Code)
// Authenticates dev user by UIC (Unique Identifier Code, e.g., QR scan); no password needed.
// Returns dev user details on success (bypasses password for quick access).
app.post("/api/dev-login-udc", async (req, res) => {
  try {
    const { uic } = req.body;
    if (!uic) return res.status(400).json({ success: false, message: "UDC required" });

    const [rows] = await db.query("SELECT * FROM devusers WHERE uic=? LIMIT 1", [uic]);
    if (!rows.length) return res.status(401).json({ success: false, message: "Invalid UDC" });

    const dev = rows[0];
    res.json({ success: true, user: dev });
  } catch (err) {
    console.error("❌ dev-login-udc error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST Execute Raw SQL (No Restrictions)
// Allows developers to run any SQL query directly on the DB (SELECT, INSERT, UPDATE, DELETE, etc.).
// High-risk: No sanitization or auth; use only in trusted environments. Returns query results or error.
app.post("/api/sql-run", async (req, res) => {
  try {
    const { sql } = req.body;

    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ success: false, error: "SQL query required" });
    }

    // Execute query without blocking anything (direct db.query).
    // Note: This can modify data; handle with care (e.g., no transaction wrapper).
    const [rows] = await db.query(sql);
    res.json({ success: true, result: rows });

  } catch (err) {
    console.error("❌ /api/sql-run error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// DEVUSERS MANAGEMENT ENDPOINTS
// =====================================================
// CRUD operations for developer users (separate from regular users).
// Assumes 'devusers' table with fields like id, name, email, phone, password, uic.
// Original code has duplicates/variants; preserved below with notes.

// GET DevUser  Profile by ID (First Variant)
// Fetches dev user details (excludes password).
app.get('/api/devusers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, phone FROM devusers WHERE id = ?",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "DevUser  not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT Update DevUser  Profile by ID (First Variant)
// Updates name, email, phone for dev user (no password change here).
app.put('/api/devusers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;
  try {
    await db.query(
      "UPDATE devusers SET name = ?, email = ?, phone = ? WHERE id = ?",
      [name, email, phone, id]
    );
    res.json({ message: "Profile updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

// PUT Change DevUser  Password by ID (Bcrypt Version)
// Verifies old password (hashed with bcrypt), hashes new one, and updates.
// Requires bcrypt import (already present); salt rounds=10.
app.put('/api/devusers/:id/change-password', async (req, res) => {
  const { id } = req.params;
  const { oldPassword, newPassword } = req.body;
  try {
    const [rows] = await db.query("SELECT password FROM devusers WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "DevUser  not found" });

    const match = await bcrypt.compare(oldPassword, rows[0].password);
    if (!match) return res.status(400).json({ error: "Old password incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE devusers SET password = ? WHERE id = ?", [hashed, id]);

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Password change failed" });
  }
});

// GET DevUser  Profile by ID (Second Variant - Duplicate with Minor Differences)
// Identical to first GET but with different error logging; preserved as-is.
app.get('/api/devusers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, phone FROM devusers WHERE id = ?",
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "DevUser  not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ GET devuser error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT Update DevUser  Profile by ID (Second Variant - Duplicate with Minor Differences)
// Identical to first PUT but with affectedRows check and success message; preserved as-is.
app.put('/api/devusers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;

  try {
    const [result] = await db.query(
      "UPDATE devusers SET name = ?, email = ?, phone = ? WHERE id = ?",
      [name, email, phone, id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "DevUser  not found" });

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("❌ UPDATE devuser profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT Change DevUser  Password by ID (Plain Text Version - Second Variant)
// Verifies and updates password in plain text (insecure; contrasts with bcrypt version above).
// Includes custom error message for old password mismatch.
app.put('/api/devusers/:id/change-password', async (req, res) => {
  const { id } = req.params;
  const { oldPassword, newPassword } = req.body;

  // ✅ Validate request body
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Both old and new passwords are required." });
  }

  try {
    // 1️⃣ Fetch current password from DB
    const [rows] = await db.query(
      "SELECT password FROM devusers WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "DevUser  not found." });
    }

    const currentPassword = rows[0].password;

    // 2️⃣ Compare old password (plain text)
    if (oldPassword !== currentPassword) {
      return res.status(401).json({ error: "Old password incorrect. Contact Dr.Abhinav for PassKey Query." });
    }

    // 3️⃣ Update to new password
    const [result] = await db.query(
      "UPDATE devusers SET password = ? WHERE id = ?",
      [newPassword, id]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ error: "Failed to update password." });
    }

    // 4️⃣ Success response
    res.json({ message: "Password changed successfully." });

  } catch (err) {
    console.error("❌ Error changing devuser password:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET All Database Tables (Developer Tool)
// Fetches all table names, then queries first 20 rows from each for inspection.
// Useful for debugging; returns structured object with tableName: [rows].
app.get("/api/dev/tables", async (req, res) => {
  try {
    // 1️⃣ Fetch all table names
    const [tables] = await db.query("SHOW TABLES;");
    const tableKey = Object.keys(tables[0])[0]; // e.g., "Tables_in_dbname"

    const result = {};

    // 2️⃣ Loop through each table and fetch first 20 rows
    for (const row of tables) {
      const tableName = row[tableKey];
      const [rows] = await db.query(`SELECT * FROM \`${tableName}\` LIMIT 20`);
      result[tableName] = rows;
    }

    res.json({ success: true, tables: result });
  } catch (err) {
    console.error("❌ /api/dev/tables error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch tables" });
  }
});

// Get all orders
app.get('/api/orders', (req, res) => {
  db.query('SELECT * FROM orders', (err, results) => {
    if(err) return res.status(500).json({error: err});
    res.json(results);
  });
});

// Update order by ID
app.put('/api/orders/:id', (req, res) => {
  const { customer, product, quantity, status } = req.body;
  const id = req.params.id;
  db.query(
    'UPDATE orders SET customer=?, product=?, quantity=?, status=? WHERE id=?',
    [customer, product, quantity, status, id],
    (err, result) => {
      if(err) return res.status(500).json({error: err});
      res.json({message: 'Order updated successfully!'});
    }
  );
});

// =====================================================
// DEPLOYMENT AND SERVER START
// =====================================================
// Starts the Express server on the specified port.
// Logs confirmation to console, including active AI provider.

app.listen(PORT, () => {
  console.log(`✅ AgroScan server running on http://localhost:${PORT}`);
  console.log(`👉 Active AI Provider: ${AI_PROVIDER}`);
});

