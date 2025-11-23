import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface Attachment {
  url: string;
  mimeType: string;
}

async function fetchFileAsBase64(url: string): Promise<string> {
  // Note: This relies on the file server supporting CORS. 
  // If the server denies cross-origin requests, this fetch will fail.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        // reader.result is like "data:application/pdf;base64,....."
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function askGemini(prompt: string, attachments: Attachment[] = []): Promise<string> {
  try {
    const parts: any[] = [{ text: prompt }];

    // Process attachments
    for (const file of attachments) {
        // Only support PDF and Images for now as they are most common and supported by Gemini
        if (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) {
            try {
                const base64Data = await fetchFileAsBase64(file.url);
                parts.push({
                    inlineData: {
                        mimeType: file.mimeType,
                        data: base64Data
                    }
                });
            } catch (e) {
                console.warn(`Could not fetch attachment ${file.url}:`, e);
                // Inform the model that a file was missing
                parts.push({ text: `[System Hinweis: Der Anhang ${file.url} konnte nicht heruntergeladen werden.]` });
            }
        }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
    });
    return response.text || "Keine Antwort erhalten.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Entschuldigung, ich konnte keine Verbindung zu Gemini herstellen oder die Dokumente verarbeiten. Möglicherweise sind die Dateien zu groß oder durch Sicherheitseinstellungen geschützt.";
  }
}