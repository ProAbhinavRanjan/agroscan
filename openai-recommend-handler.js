// openai-handler.js
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * askAI: Sends soil and environmental data to OpenAI and receives crop recommendations.
 * @param {Object} data - Soil and environment data
 * @param {number} data.ph - Soil pH
 * @param {number} data.moisture - Soil moisture (%)
 * @param {number} data.temperature - Temperature (°C)
 * @param {string} data.location - Location of the farm
 * @param {string} [data.desiredCrop] - Optional crop the farmer wants
 * @returns {string} - AI recommendations in readable format
 */
export async function askAI({ ph, moisture, temperature, location, desiredCrop }) {
  try {
    const prompt = `
You are an expert agriculture assistant.

Analyze the following soil and environment data and suggest practical actions and crops in a readable, numbered list.
Do NOT return JSON. Start with a short conclusion, then suggest the best crops, then give soil and land analysis, followed by advice on irrigation, fertilization, and pest management.

- Soil pH: ${ph}
- Soil Moisture: ${moisture}%
- Temperature: ${temperature !== undefined ? temperature + "°C" : "Not provided"}
- Location: ${location || "Not provided"}
- Desired Crop: ${desiredCrop || "No specific crop requested"}

Keep the advice simple, actionable, and farmer-friendly.
`;

    const response = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Error calling OpenAI API:", err);
    return "AI analysis failed. Please try again later.";
  }
}
