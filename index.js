const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Groq } = require("groq-sdk");
require("dotenv").config();

const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://choosy-frontend.vercel.app' // Replace with your Vercel URL
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(bodyParser.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are Choosy AI — an expert product comparison assistant. Your job is to provide an honest, up-to-date, and accurate comparison of products based on the user’s query.

⚠️ VERY IMPORTANT:
- Respond ONLY in **valid pure JSON**, NO markdown, no explanations, no code formatting.
- Include AT LEAST 5–6 good product options relevant to the user's query.
- Include **realistic prices** based on current Indian market (Flipkart, Amazon, etc.)
- Add a fun and helpful **final verdict** to help the user decide.
- Fill every field carefully. Use your latest knowledge.

🔧 JSON FORMAT (strict):
{
  "products": [
    {
      "product": "string",
      "rating": "4.5/5",
      "likes": 85,
      "summary": "short but clear summary",
      "price": "₹19999",
      "pros": ["Fast performance", "Good battery life"],
      "cons": ["No expandable storage", "Average camera"],
      "source": "Amazon / Flipkart / Croma",
      "link": "https://valid-buy-link.com",
      "image": "https://image-link.jpg",
      "specs": {
        "RAM": "8GB",
        "Processor": "Snapdragon 8 Gen 2"
      },
      "tags": ["budget", "camera", "gaming"],
      "festivalPrice": {
        "price": "₹17999",
        "festival": "Big Billion Days"
      }
    }
  ],
  "finalVerdict": "A short paragraph helping the user choose the best product",
  "choosyRating": 8.9
}
`.trim();

app.post("/scrape", async (req, res) => {
  const { query } = req.body;

  try {
    const { choices } = await groq.chat.completions.create({
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Compare and recommend best options for: ${query}` },
      ],
    });

    let aiText = choices?.[0]?.message?.content?.trim() || "";

    // Clean and parse
    const cleaned = aiText
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/\\n/g, '')
      .replace(/(\r\n|\n|\r)/g, '');

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("❌ JSON parse failed:", err.message);
      return res.status(500).json({ error: "Invalid JSON from AI", raw: aiText, details: err.message });
    }

    if (!Array.isArray(parsed.products)) {
      return res.status(500).json({ error: "Missing products array", raw: aiText });
    }

    const result = parsed.products
      .filter(p => p.product && p.price && p.link && p.rating)
      .map(p => ({
        id: crypto.randomUUID(),
        product: p.product,
        rating: p.rating,
        summary: p.summary || "",
        price: p.price,
        pros: Array.isArray(p.pros) ? p.pros : [],
        cons: Array.isArray(p.cons) ? p.cons : [],
        source: p.source || "Unknown",
        link: p.link.startsWith("http") ? p.link : `https://www.google.com/search?q=${encodeURIComponent(p.product + " buy")}`,
        image: p.image || "https://via.placeholder.com/300x200?text=No+Image",
        tags: Array.isArray(p.tags) ? p.tags : [],
        specs: p.specs || {},
        festivalPrice: p.festivalPrice?.price ? {
          price: p.festivalPrice.price,
          festival: p.festivalPrice.festival || "Festival Deal"
        } : null,
        likes: typeof p.likes === "number" ? p.likes : Math.floor(Math.random() * 50) + 50,
      }));

    return res.json({
      result,
      finalVerdict: parsed.finalVerdict || "No verdict available.",
      choosyRating: parsed.choosyRating || 8.0,
    });

  } catch (err) {
    console.error("❌ Backend error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
});

app.listen(5000, () => console.log("🚀 Choosy backend running at http://localhost:5000"));
