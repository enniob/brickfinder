import Anthropic from '@anthropic-ai/sdk';
import { Part } from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface IdentifiedPart {
  partNum: string;
  quantity: number;
}

export async function identifyParts(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  requiredParts: Part[]
): Promise<IdentifiedPart[]> {
  const partsList = requiredParts
    .map((p) => `- Part ${p.partNum}: "${p.name}", color: ${p.color}, need: ${p.quantity}`)
    .join('\n');

  const prompt = `You are a Lego piece identification expert. I am looking to build a Lego set and need help finding specific pieces.

Here are the Lego parts I still need to find:
${partsList}

Look carefully at the image and identify which of the above parts you can see. Consider the shape, studs, and color of each piece.

Return ONLY a valid JSON array with no markdown formatting. Each entry should have:
- "partNum": the part number from the list above
- "quantity": how many of that part you can see in the image

Example: [{"partNum":"3001","quantity":2},{"partNum":"3003","quantity":1}]

If you cannot identify any matching parts, return an empty array: []`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();

  const identified: IdentifiedPart[] = JSON.parse(cleaned);
  return identified;
}
