import Groq from "groq-sdk";

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

let groq: Groq | null = null;

function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  
  return groq;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  format: string = "webm"
): Promise<TranscriptionResult> {
  try {
    const client = getGroqClient();
    
    // Create a Blob from the buffer (Node-compatible)
    const audioBlob = new Blob([audioBuffer], {
      type: `audio/${format}`,
    }) as any; // Groq SDK accepts Blob-like objects

    const transcription = await client.audio.transcriptions.create({
      file: audioBlob,
      model: "whisper-large-v3",
      language: "en", // Can be made configurable
      response_format: "json",
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("Groq Whisper transcription error:", error);
    throw new Error(
      error instanceof Error ? error.message : "Transcription failed"
    );
  }
}
