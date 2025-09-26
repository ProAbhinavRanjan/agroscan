// backend/huggingface-recommend-handler.js
import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const hf = new HfInference(process.env.HF_API_KEY);

/**
 * askHFRecommend - Get AgroAI recommendations from Hugging Face
 * @param {Object} params - { ph, moisture, temperature, location, desiredCrop }
 * @param {string} model - HF model ID (default: a conversational or text-generation HF model)
 * @returns {string} - AI recommendation
 */
export async function askHFRecommend(
  { ph, moisture, temperature, location, desiredCrop },
  model = "Qwen/Qwen3-Next-80B-A3B-Thinking" // Use a conversational HF model
) {
  try {
    // Compose prompt
    const prompt = `
You are AgroAI, the most advanced agricultural AI assistant in the world.
Provide actionable recommendations based on the following farm parameters:
- Soil pH: ${ph}
- Moisture: ${moisture}
- Temperature: ${temperature}
- Location: ${location || "Unknown"}
- Desired Crop: ${desiredCrop || "Unknown"}

Give precise, practical, cost-effective advice for:
1. Fertilizer recommendations
2. Irrigation suggestions
3. Pest/disease prevention
4. Sustainable farming practices

Format your response as bullet points.
`;

    // Call HF text generation (or conversational) API
    const result = await hf.textGeneration({
      model,
      inputs: prompt,
      parameters: {
        max_new_tokens: 300,
        temperature: 0.5,
        top_p: 0.9,
      },
    });

    // Return generated text
    return result.generated_text.replace(prompt, "").trim();
  } catch (err) {
    console.error("❌ HF Recommendation error:", err);
    return "AI failed to generate recommendation";
  }
}
