import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const VOCAL_BRIDGE_URL = "https://vocalbridgeai.com";
const VOCAL_BRIDGE_API_KEY = process.env.VOCAL_BRIDGE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!VOCAL_BRIDGE_API_KEY) {
  throw new Error("VOCAL_BRIDGE_API_KEY env var is required");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.get("/api/voice-token", async (req, res) => {
  try {
    const resp = await fetch(`${VOCAL_BRIDGE_URL}/api/v1/token`, {
      method: "POST",
      headers: {
        "X-API-Key": VOCAL_BRIDGE_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ participant_name: req.query.name || "Web User" })
    });

    const body = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).send(body);
    }

    return res.json(JSON.parse(body));
  } catch (error) {
    console.error("Voice token error", error);
    return res.status(500).json({ error: "Failed to fetch voice token" });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are CushionAI, a helpful assistant. For user questions, provide a clear answer and if applicable, a flowchart in Mermaid syntax to illustrate steps or processes. Respond in JSON format: {"answer": "your text answer", "mermaid": "graph LR; A-->B;"}`
        },
        { role: "user", content: question }
      ],
      max_tokens: 1000
    });

    const responseText = completion.choices[0].message.content;
    let answer = responseText;
    let mermaid = "";

    try {
      const parsed = JSON.parse(responseText);
      answer = parsed.answer || responseText;
      mermaid = parsed.mermaid || "";
    } catch (e) {
      // If not JSON, use as answer
    }

    res.json({ answer, mermaid });
  } catch (error) {
    console.error("Chat error", error);
    res.status(500).json({ error: "Failed to process chat" });
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: "A cute cartoon cat standing and speaking, with an open mouth, friendly expression, in a simple style.",
      n: 1,
      size: "256x256"
    });

    const imageUrl = response.data[0].url;
    res.json({ imageUrl });
  } catch (error) {
    console.error("Avatar generation error", error);
    res.status(500).json({ error: "Failed to generate avatar" });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`CushionAI backend started on ${PORT}`));
