import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

export const analyzeReceipt = async (base64Image) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
      Analiza esta imagen de un recibo de consignación bancaria.
      Extrae la siguiente información y responde ÚNICAMENTE en formato JSON:
      {
        "valor": número (sin puntos ni comas, solo el valor numérico),
        "comprobante": "string (el número de referencia o aprobación)",
        "banco": "string (nombre del banco detectado)"
      }
      Si no puedes encontrar algún dato, pon null en ese campo.
    `;

    // Detectar el mimeType real de la imagen base64
    const mimeType = base64Image.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    const base64Data = base64Image.split(",")[1];

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    console.log("Enviando a Gemini...", { mimeType });
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    console.log("Respuesta bruta de Gemini:", text);
    
    // Limpiamos el texto por si Gemini devuelve markdown como \`\`\`json ... \`\`\`
    const cleanText = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Error analizando recibo con Gemini:", error);
    return null;
  }
};
