export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, todayStr, dayOfWeek } = req.body;
  if (!text) return res.status(400).json({ error: "Missing text" });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "API key not configured" });

  const prompt = `You are a task parser for a construction business owner named Rajesh Bansal. He manages these projects:
1. Ludhiana - Building a mall and hotel
2. Jhajjar - Residential housing project  
3. Alwar - Affordable housing project (starting soon)
4. Costify - Appliance refurbishing business (refrigerators, washing machines, ACs, visi coolers, deep freezers)
5. Personal - Everything else

Today is ${dayOfWeek}, ${todayStr}.

Parse this task input and return ONLY valid JSON (no markdown, no backticks, no explanation):
{
  "title": "clean concise task title in English",
  "notes": "any extra details or context, empty string if none",
  "project": "ludhiana|jhajjar|alwar|costify|personal",
  "priority": "urgent|high|normal|low",
  "due": "YYYY-MM-DD or null"
}

Rules:
- Input may be in Hindi, Hinglish, or English — always output English
- "tomorrow" / "kal" = the day after today
- "friday" or "next friday" / "shukravar" = the coming Friday
- "next week" / "agle hafte" = next Monday
- "end of week" = this coming Friday  
- "urgent" / "asap" / "jaldi" / "turant" / "fauran" = urgent priority
- "important" / "zaruri" = high priority
- Default priority is "normal"
- Detect project from keywords: "mall/hotel/ludhiana" → ludhiana, "residential/jhajjar" → jhajjar, "alwar/affordable/housing" → alwar, "costify/fridge/washing/AC/dealer/appliance/refurbish/visi/cooler/freezer" → costify
- If no project keyword found, use "personal"
- Keep title short and action-oriented
- Put phone numbers, names, addresses in notes

Input: "${text.replace(/"/g, '\\"')}"`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Anthropic API error:", data.error);
      return res.status(500).json({ error: "AI parse failed" });
    }

    const textResp = data.content?.map(i => i.text || "").join("") || "";
    const clean = textResp.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Parse error:", err);
    return res.status(500).json({ error: "Parse failed" });
  }
}
