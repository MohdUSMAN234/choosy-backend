const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Groq } = require("groq-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://choosy-frontend.vercel.app'
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(bodyParser.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are Choosy AI — an expert product comparison assistant. Your job is to provide an honest, up-to-date, and accurate comparison of products based on the user's query.

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

// Google Image Search API
app.get("/api/image-search", async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  try {
    // Using a scraping approach since Google's custom search API has limitations
    const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const imageUrls = [];
    
    $('img').each((i, element) => {
      const src = $(element).attr('src');
      if (src && src.startsWith('http')) {
        imageUrls.push(src);
      }
    });

    // Return the first valid image URL
    if (imageUrls.length > 0) {
      return res.json({ imageUrl: imageUrls[0] });
    }

    return res.status(404).json({ error: "No images found" });
  } catch (error) {
    console.error("Image search error:", error);
    return res.status(500).json({ error: "Failed to fetch images" });
  }
});

// Main product comparison endpoint
app.post("/scrape", async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Invalid query parameter" });
  }

  try {
    const { choices } = await groq.chat.completions.create({
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Compare and recommend best options for: ${query}` },
      ],
      temperature: 0.7,
      max_tokens: 2000,
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Choosy backend running at http://localhost:${PORT}`));