import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, AssetPrice } from "../types";

// Gemini API key is automatically injected by the platform at runtime.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not defined in the environment. Please check your AI Studio secrets.");
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "" });

export async function fetchAssetPrices(stockSymbols: string[]): Promise<AssetPrice> {
  const fallback = {
    gold: 7500,
    silver: 95,
    stocks: stockSymbols.reduce((acc, sym) => ({ ...acc, [sym]: 1000 }), {})
  };

  const model = "gemini-3-flash-preview";
  const prompt = `Provide the current market price in INR for:
  - Gold (per 1 gram, 24K)
  - Silver (per 1 gram)
  - Stocks with these symbols: ${stockSymbols.join(", ")}
  
  Use the latest available data. Return as a JSON object.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { text: prompt },
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gold: { type: Type.NUMBER },
            silver: { type: Type.NUMBER },
            stocks: {
              type: Type.OBJECT,
              additionalProperties: { type: Type.NUMBER }
            }
          },
          required: ["gold", "silver", "stocks"]
        }
      }
    });

    const text = response.text;
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (error) {
    console.error("Error fetching asset prices:", error);
    return fallback;
  }
}

export async function analyzeUPIScreenshot(base64Image: string): Promise<Partial<Transaction>[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze this UPI transaction history screenshot. Extract a list of transactions. 
  For each transaction, find:
  - amount (number, absolute value)
  - recipient (name of person or merchant)
  - date (ISO 8601 format like YYYY-MM-DDTHH:mm:ssZ. If date is missing year, assume 2026)
  - description (any note, transaction ID, or context)
  - type (always 'expense' for these)
  - method (always 'upi')
  - confidence (string: 'high', 'medium', or 'low' based on how clear the text is)
  
  Return the data as a JSON array of objects.`;

  try {
    const mimeType = base64Image.includes(";") ? base64Image.split(";")[0].split(":")[1] : "image/jpeg";
    const imageData = base64Image.split(",")[1] || base64Image;

    console.log("Analyzing screenshot with mimeType:", mimeType);

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: imageData,
            },
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER },
              recipient: { type: Type.STRING },
              date: { type: Type.STRING },
              description: { type: Type.STRING },
              type: { type: Type.STRING },
              method: { type: Type.STRING },
              confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
            },
            required: ["amount", "recipient", "confidence"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) {
      console.warn("Gemini returned empty text for screenshot analysis");
      return [];
    }
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing screenshot:", error);
    throw error;
  }
}
