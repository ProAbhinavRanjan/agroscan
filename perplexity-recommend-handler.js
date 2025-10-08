// perplexity-recommend-handler.js
import { Perplexity } from "perplexity"; // Ensure you have the Perplexity SDK installed
import dotenv from "dotenv";
import aiPersonality from "./aiPersonality.js"; // Importing AI personality description

dotenv.config();

// Initialize Perplexity client using the API key from environment variables
const client = new Perplexity({
  apiKey: process.env.PERPLEXITY_API_KEY,
});

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
    // Constructing the prompt with AI personality description
    const prompt = `
You are an agriculture AI assistant. Your personality is: ${aiPersonality.description}
Given the following soil data:
- pH: ${ph}
- Moisture: ${moisture}
- Temperature: ${temperature}
- Desired Crop: ${desiredCrop || "any suitable crop"}

Provide a professional, easy-to-understand crop or soil recommendation.
`;

    // Making the API call to Perplexity's chat completions endpoint
    const response = await client.chat.completions.create({
      model: "sonar-pro", // Specify the model to use
      messages: [
        { role: "user", content: prompt },
      ],
    });

    // Returning the AI's response
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Error in Perplexity recommendation:", err);
    return "AI failed to provide a recommendation.";
  }
}
