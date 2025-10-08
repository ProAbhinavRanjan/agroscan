// ==========================
// perplexity-chat-handler.js
// ==========================

import dotenv from "dotenv";
dotenv.config();

import axios from "axios"; // more modern than fetch
import { getPreassignedCommand } from "./preassignedCommands.js";
import { getAIPersonality } from "./aiPersonality.js";

// Constants
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Utility: call Perplexity AI API
async function queryPerplexityAI(prompt, maxTokens = 100) {
  try {
    const response = await axios.post(
      "https://api.perplexity.ai/search",
      { prompt, max_tokens: maxTokens },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        },
      }
    );

    return response.data.answer || "AI failed to respond";
  } catch (err) {
    console.error("❌ Perplexity API error:", err.response?.data || err.message);
    return "AI failed to respond";
  }
}

// Main chat handler
export async function askPerplexityChat(messages) {
  try {
    if (!messages || messages.length === 0) return "No messages provided";

    const userMessage = messages[messages.length - 1].content;

    // Step 1: Check preassigned commands
    const commandResponse = getPreassignedCommand(userMessage);
    if (commandResponse) return commandResponse;

    // Step 2: Build AI prompt with personality + last 5 messages
    const personalityDesc = getAIPersonality(); // professional AI description
    const last5Messages = messages.slice(-5)
      .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");

    const aiPrompt = `${personalityDesc}\nChat History:\n${last5Messages}\nAI (reply max 100 tokens, aim ~30 tokens):`;

    // Step 3: Query Perplexity AI
    const aiReply = await queryPerplexityAI(aiPrompt, 100);

    return aiReply.trim();
  } catch (err) {
    console.error("❌ askPerplexityChat error:", err.message);
    return "AI failed to respond";
  }
}

