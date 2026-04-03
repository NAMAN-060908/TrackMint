import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, AssetPrice } from "../types";

// Only initialize if API key is present
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export async function fetchAssetPrices(stockSymbols: string[]): Promise<AssetPrice> {
  // Fallback/Mock data if AI is not available
  const fallback = {
    gold: 7500,
    silver: 95,
    stocks: stockSymbols.reduce((acc, sym) => ({ ...acc, [sym]: 1000 }), {})
  };

  if (!ai) return fallback;

  const model = "gemini-3-flash-preview";
  const prompt = `Provide the current market price in INR for:
  - Gold (per 1 gram, 24K)
  - Silver (per 1 gram)
  - Stocks with these symbols: ${stockSymbols.join(", ")}
  
  Use the latest available data. Return as a JSON object.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
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
  if (!ai) {
    // Return mock transaction data if no API key is provided
    console.log("No Gemini API key found. Returning mock data.");
    return [
      {
        amount: 450,
        recipient: "Swiggy (Mock)",
        date: new Date().toISOString(),
        description: "Mock data - Add GEMINI_API_KEY to enable real scanning",
        type: 'expense',
        method: 'upi',
        confidence: 'high'
      },
      {
        amount: 1200,
        recipient: "Amazon (Mock)",
        date: new Date().toISOString(),
        description: "Mock data - Add GEMINI_API_KEY to enable real scanning",
        type: 'expense',
        method: 'upi',
        confidence: 'medium'
      }
    ];
  }

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
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(",")[1] || base64Image,
              },
            },
          ],
        },
      ],
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
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing screenshot:", error);
    throw error;
  }
}
