// ==========================
// perplexity-chat-handler.js
// ==========================

import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch"; // for API calls
import { getPreassignedCommand } from "./preassignedCommands.js";
import { getAIPersonality } from "./aiPersonality.js";

// Constants
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Utility: call Perplexity AI API
async function queryPerplexityAI(prompt, maxTokens = 100) {
  try {
    const response = await fetch("https://api.perplexity.ai/v1/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        max_tokens: maxTokens,
      }),
    });

    const data = await response.json();
    return data.answer || "AI failed to respond";
  } catch (err) {
    console.error("❌ Perplexity API error:", err);
    return "AI failed to respond";
  }
}

// Main chat handler
export async function askPerplexityChat(messages) {
  try {
    const userMessage = messages[messages.length - 1].content;

    // Step 1: Check preassigned commands
    const commandResponse = getPreassignedCommand(userMessage);
    if (commandResponse) {
      return commandResponse; // Return if matches a preassigned command
    }

    // Step 2: Build AI prompt
    const personalityDesc = getAIPersonality(); // Single personality description
    const last5Messages = messages.slice(-5)
      .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n");

    const aiPrompt = `${personalityDesc}\nChat History:\n${last5Messages}\nAI (reply max 100 tokens, avg ~30 tokens):`;

    // Step 3: Query Perplexity AI
    const aiReply = await queryPerplexityAI(aiPrompt, 100);

    return aiReply.trim();
  } catch (err) {
    console.error("❌ askPerplexityChat error:", err);
    return "AI failed to respond";
  }
}
