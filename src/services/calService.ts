import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/googleai";

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
});

const CalEstimateSchema = z.object({
  description: z.string(),
  calories: z.number().int(),
  breakdown: z.array(
    z.object({
      item: z.string(),
      calories: z.number().int(),
    })
  ),
});

export async function estimateCalories(buffer: Buffer, mimeType: string) {
  const { output } = await ai.generate({
    model: "googleai/gemini-2.5-flash",
    prompt: [
      {
        media: {
          url: `data:${mimeType};base64,${buffer.toString("base64")}`,
          contentType: mimeType,
        },
      },
      {
        text: `You are a nutrition expert. Analyze this food image and estimate the total calories.

Return:
- description: brief label for what you see (e.g. "Chicken breast with rice and broccoli")
- calories: total estimated calories as a single integer
- breakdown: each distinct food item with its individual calorie estimate`,
      },
    ],
    output: { schema: CalEstimateSchema },
  });

  if (!output) throw new Error("No output from Gemini");
  return output;
}
