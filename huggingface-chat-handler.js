import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();
const hf = new HfInference(process.env.HF_API_KEY);

export async function askHFChat(messages, model = "facebook/blenderbot-400M-distilltiiuae/falcon-7b-instruct") {
  try {
    const conversation = messages
      .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n") + "\nAI:";

    const response = await hf.textGeneration({
      model,
      inputs: conversation,
      parameters: {
        max_new_tokens: 150,
        temperature: 0.7,
        do_sample: true
      }
    });

    return response[0].generated_text?.trim() || "AI failed to respond";
  } catch (err) {
    console.error("❌ HF Chat error:", err);
    return "AI failed to respond";
  }
}
