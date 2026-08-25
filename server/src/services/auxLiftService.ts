import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/googleai";

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
});

const AuxLiftSchema = z.array(
  z.object({
    name: z.string(),
    description: z.string(),
    sets: z.number().int(),
    reps: z.string(),
    weightRecommendation: z.string(),
    youtubeQuery: z.string(),
  })
);

export async function getAuxLifts(
  lift: { name: string },
  trainingMax: number
) {
  const { output } = await ai.generate({
    model: "googleai/gemini-2.5-flash",
    prompt: `You are a strength training coach programming accessory work for the 5/3/1 program.
The athlete just trained their ${lift.name}. Their training max for ${lift.name} is ${trainingMax} lbs.

Suggest exactly 3 accessory exercises that directly support improving ${lift.name}.
Choose exercises that target supporting muscle groups and common weak points for this lift.

For each exercise return:
- name: concise exercise name
- description: 1-2 sentences on which muscles it targets and how it carries over to ${lift.name}
- sets: integer number of sets (3 or 4)
- reps: rep range string like "8-12" or "10-15"
- weightRecommendation: a simple weight suggestion based on the athlete's ${trainingMax} lb training max, e.g. "40 lb dumbbells" or "95 lb barbell". Use common plate/dumbbell increments.
- youtubeQuery: a YouTube search query that will find a clear tutorial for this exercise`,
    output: { schema: AuxLiftSchema },
  });

  if (!output) throw new Error("No output from Gemini");

  return output.map((item, i) => ({
    name: item.name,
    description: item.description,
    setsReps: `${item.sets} × ${item.reps}`,
    weightRecommendation: item.weightRecommendation,
    youtubeSearchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.youtubeQuery)}`,
    displayOrder: i,
  }));
}
