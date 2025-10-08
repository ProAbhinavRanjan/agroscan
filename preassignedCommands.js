// ==========================
// preassignedCommands.js
// ==========================

// Map of preassigned commands and their responses
const commands = {
  "help": "You can ask me about soil health, crop recommendations, pest management, and general agriculture advice.",
  "who are you": "I am AgroBot, your professional agriculture assistant. I provide guidance on crops, soil, and farming best practices.",
  "hello": "Hello! How can I assist you with your farm or garden today?",
  "hi": "Hi there! Ask me anything about agriculture.",
  "thank you": "You're welcome! Happy to help with your agricultural queries.",
  "bye": "Goodbye! Wishing you a successful harvest."
};

// Function to get a command response if it exists
export function getPreassignedCommand(message) {
  const key = message.trim().toLowerCase();
  return commands[key] || null; // return null if no match
}
