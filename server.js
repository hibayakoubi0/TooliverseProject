// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import NodeCache from "node-cache";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const PORT = process.env.PORT || 3000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));
app.use(cors({ origin:  "http://localhost:3000" }));
app.use(express.static("public"));
app.get("/", (_, res) => res.send("Tooliverse Summarizer API"));
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." }
});
app.use("/api/", limiter);

const cache = new NodeCache({ stdTTL: 60 * 5, checkperiod: 120 });

const ai = new GoogleGenAI({ apiKey: process.env.GENAI_API_KEY });

function buildPrompt(userText) {
  return `You are a concise summarizer. Detect the input language automatically.
Summarize the following text in the same language.

1) Provide up to 3 concise bullet points capturing the main ideas (each bullet one line).
2) Provide a one-sentence TL;DR labeled "TL;DR:".

Text:
"""${userText}"""`;
}

app.post("/api/summarize", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Missing text." });

    const key = "summ:" + text.slice(0, 300);
    const cached = cache.get(key);
    if (cached) return res.json({ summary: cached, cached: true });

    const prompt = buildPrompt(text);
    const modelId = process.env.GENAI_MODEL || "gemini-2.5-flash";

    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ type: "text", text: prompt }],
    });

    let summaryText = "";
    if (response?.text) summaryText = response.text;
    else if (response?.candidates && response.candidates[0]?.output) summaryText = response.candidates[0].output;
    else if (response?.candidates && response.candidates[0]?.content) summaryText = response.candidates[0].content;
    else summaryText = JSON.stringify(response);

    cache.set(key, summaryText);
    return res.json({ summary: summaryText, cached: false });
  } catch (err) {
    console.error("Summarize error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

app.get("/", (_, res) => res.send("Tooliverse Summarizer API"));

app.listen(PORT, () => console.log(`Summarizer API running on port ${PORT}`));
