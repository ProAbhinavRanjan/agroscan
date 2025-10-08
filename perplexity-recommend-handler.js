// perplexity-recommend-handler.js
import dotenv from "dotenv";
import fetch from "node-fetch"; // For HTTP API calls
import aiPersonality from "./aiPersonality.js"; // AI personality description

dotenv.config();

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

/**
 * Generates a recommendation for crops or soil based on provided parameters.
 * @param {Object} params - The parameters for generating a recommendation.
 * @param {number} params.ph - The soil pH level.
 * @param {number} params.moisture - The soil moisture level.
 * @param {number} params.temperature - The current temperature.
 * @param {string} [params.desiredCrop] - The desired crop to grow.
 * @returns {Promise<string>} - The generated recommendation.
 */
export async function askPerplexityRecommend(params) {
  const { ph, moisture, temperature, desiredCrop } = params;

  try {
    const prompt = `
You are an agriculture AI assistant. Your personality is: ${aiPersonality.description}
Given the following soil data:
- pH: ${ph}
- Moisture: ${moisture}
- Temperature: ${temperature}
- Desired Crop: ${desiredCrop || "any suitable crop"}

Provide a professional, easy-to-understand crop or soil recommendation.
`;

    const response = await fetch("https://api.perplexity.ai/v1/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 100,
      }),
    });

    const data = await response.json();
    return data.answer?.trim() || "AI failed to provide a recommendation.";
  } catch (err) {
    console.error("❌ Error in Perplexity recommendation:", err);
    return "AI failed to provide a recommendation.";
  }
}
