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

function extractJsonObject(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return null;
    }
  }
}

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

    const parsed = extractJsonObject(responseText);
    if (parsed) {
      answer = parsed.answer || responseText;
      mermaid = parsed.mermaid || "";
    }

    res.json({ answer, mermaid });
  } catch (error) {
    console.error("Chat error", error);
    res.status(500).json({ error: "Failed to process chat" });
  }
});

app.post("/api/flowchart", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text is required" });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY env var is required" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'Convert assistant text into a Mermaid flowchart when the text describes a process or ordered steps. Respond only with JSON: {"mermaid":"graph LR; A[Start] --> B[End]"} . If the text does not describe a process, respond with {"mermaid":""}. Do not include markdown fences.'
        },
        {
          role: "user",
          content: text
        }
      ],
      max_tokens: 400,
      temperature: 0.2
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const parsed = extractJsonObject(responseText);
    const mermaid = typeof parsed?.mermaid === "string" ? parsed.mermaid.trim() : "";

    return res.json({ mermaid });
  } catch (error) {
    console.error("Flowchart error", error);
    return res.status(500).json({ error: "Failed to generate flowchart" });
  }
});

app.post("/api/visualization", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "Transcript is required" });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY env var is required" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'You generate visualization JSON for a live voice support dashboard. Respond only with JSON in this shape: {"visualType":"flowchart|knowledge_map|risk_matrix|layer_diagram|comparison|timeline","title":"short title","description":"one sentence","data":{}}. Choose flowchart for components or flows, knowledge_map for constants or hidden rules, risk_matrix for risks, layer_diagram for C++/Python layers, comparison for before/after states, and timeline for steps or sequence. Keep fields concise and practical.'
        },
        {
          role: "user",
          content: `Transcript:\n${transcript}\n\nReturn only JSON.`
        }
      ],
      max_tokens: 900,
      temperature: 0.2
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const parsed = extractJsonObject(responseText);

    if (!parsed?.visualType || !parsed?.title || !parsed?.description) {
      return res.status(502).json({ error: "Invalid visualization payload from model" });
    }

    return res.json({
      visualType: parsed.visualType,
      title: parsed.title,
      description: parsed.description,
      data: parsed.data || {}
    });
  } catch (error) {
    console.error("Visualization error", error);
    return res.status(500).json({ error: "Failed to generate visualization" });
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
