import { SentenceData } from "../types";

const OPENAI_API_BASE = "https://api.openai.com/v1";

const getApiKey = (): string => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key. Please set OPENAI_API_KEY in .env.local.");
  }
  return apiKey;
};

export const generateNewSentence = async (level: number): Promise<SentenceData> => {
  const apiKey = getApiKey();

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an IELTS English coach. Return strictly valid JSON that matches the provided schema.",
        },
        {
          role: "user",
          content: `The learner is at Level ${level}. Level 1 is beginner, Level 9 is IELTS 6.5, Level 12+ is expert. Generate one English sentence suitable for this level. Include Chinese translation, brief context explanation, 3 key grammar points, and 3 useful vocabulary words with meanings.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sentence_data",
          strict: true,
          schema: {
            type: "object",
            properties: {
              text: { type: "string" },
              translation: { type: "string" },
              explanation: { type: "string" },
              grammarPoints: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
              },
              vocabulary: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    word: { type: "string" },
                    meaning: { type: "string" },
                  },
                  required: ["word", "meaning"],
                  additionalProperties: false,
                },
              },
            },
            required: ["text", "translation", "explanation", "grammarPoints", "vocabulary"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI sentence generation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned an empty sentence response.");
  }

  return JSON.parse(content) as SentenceData;
};

export const generateSpeech = async (text: string): Promise<AudioBuffer> => {
  const apiKey = getApiKey();

  const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: `Read this sentence clearly and at a speed appropriate for an English learner: ${text}`,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI speech generation failed: ${response.status} ${errorText}`);
  }

  const audioData = await response.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  return await audioContext.decodeAudioData(audioData);
};
