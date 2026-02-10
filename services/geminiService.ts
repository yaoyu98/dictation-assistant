
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SentenceData } from "../types";

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateNewSentence = async (level: number): Promise<SentenceData> => {
  // Instantiate inside the call to get the latest process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Act as an AI IELTS coach. The user is currently at Level ${level}. 
    Level 1 is beginner, Level 9 is IELTS 6.5, Level 12+ is expert.
    Generate an English sentence that perfectly fits Level ${level} difficulty.
    Include a Chinese translation, a brief context explanation, 3 key grammar points relevant to this level, and 3 useful vocabulary words.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "The English sentence" },
          translation: { type: Type.STRING, description: "Chinese translation" },
          explanation: { type: Type.STRING, description: "Contextual explanation" },
          grammarPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          vocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                meaning: { type: Type.STRING }
              },
              required: ["word", "meaning"]
            }
          }
        },
        required: ["text", "translation", "explanation", "grammarPoints", "vocabulary"]
      }
    }
  });

  return JSON.parse(response.text.trim());
};

export const generateSpeech = async (text: string): Promise<AudioBuffer> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this sentence clearly and at a speed appropriate for an English learner: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const decodedData = decodeBase64(base64Audio);
  return await decodeAudioData(decodedData, audioContext, 24000, 1);
};
