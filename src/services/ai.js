const axios = require('axios');

// Generate dynamic follow-up questions using Groq
const generateFollowupQuestions = async (userQuery) => {
  try {
    const prompt = `You are a market research assistant. A user wants to validate an idea or find market demand.

Their input: "${userQuery}"

Generate exactly 3 short, focused follow-up questions to sharpen the search and make the report more accurate. Questions should uncover:
1. Who is the target customer
2. What specific problem they have
3. What the user wants to achieve (validate existing idea, find new idea, or market research)

Return ONLY a JSON array of 3 question strings. No preamble, no markdown, no explanation.
Example: ["Who is your ideal customer?", "What problem are you trying to solve?", "Are you validating an idea or looking for new ones?"]`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const text = response.data?.choices?.[0]?.message?.content || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Groq error:', err.message);
    return [
      'Who is your target customer?',
      'What specific problem are you trying to solve?',
      'Are you validating an existing idea or looking for new opportunities?'
    ];
  }
};

// Generate the full research report using Groq
const generateReport = async (query, followupAnswers, scrapedData) => {
  const redditSummary = scrapedData.reddit
    .slice(0, 15)
    .map(p => `[r/${p.subreddit}] "${p.title}" (${p.upvotes} upvotes) - ${p.body?.slice(0, 200)}`)
    .join('
');

  const webSummary = scrapedData.web
    .slice(0, 8)
    .map(p => `[${p.source}] "${p.title}" - ${p.snippet}`)
    .join('
');

  const twitterSummary = scrapedData.twitter
    .slice(0, 5)
    .map(p => `[Twitter] "${p.title}" - ${p.snippet}`)
    .join('
');

  const competitorSummary = scrapedData.competitors
    .slice(0, 5)
    .map(p => `"${p.title}" - ${p.snippet} (${p.url})`)
    .join('
');

  const prompt = `You are an expert market research analyst. Analyze the following data and generate a comprehensive market research report.

USER QUERY: ${query}

USER CONTEXT: ${JSON.stringify(followupAnswers)}

REDDIT DATA:
${redditSummary}

WEB DATA:
${webSummary}

TWITTER DATA:
${twitterSummary}

COMPETITOR DATA:
${competitorSummary}

Generate a detailed JSON report with this exact structure (return ONLY valid JSON, no markdown, no preamble):

{
  "verdict": "strong_signal" | "weak_signal" | "mixed",
  "verdict_summary": "2-3 sentence executive summary of findings",
  "demand_score": 0-100,
  "competition_level": "low" | "medium" | "high",
  "key_insights": [{ "insight": "string", "evidence": "string", "source_url": "string" }],
  "top_quotes": [{ "quote": "string", "subreddit": "string", "upvotes": number, "url": "string" }],
  "subreddits": [{ "name": "string", "relevance": "string", "url": "string" }],
  "audience": { "who_they_are": "string", "pain_points": ["string"], "language_they_use": ["string"], "where_they_hang_out": ["string"] },
  "competitors": [{ "name": "string", "url": "string", "what_people_say": "string", "gaps": ["string"] }],
  "market_gaps": ["string"],
  "willingness_to_pay": { "score": 0-100, "evidence": "string", "price_signals": ["string"] },
  "opportunity_map": { "crowded_areas": ["string"], "underserved_areas": ["string"], "best_opportunity": "string" },
  "mvp_suggestion": { "core_feature": "string", "target_user": "string", "why": "string" },
  "kill_switch": { "risks": ["string"], "existing_solutions": ["string"], "why_it_might_fail": "string", "market_concerns": ["string"] },
  "market_size": { "estimate": "string", "reasoning": "string", "conversation_volume": "low" | "medium" | "high" | "very_high" },
  "pricing_intelligence": { "what_people_pay_now": ["string"], "complaints_about_pricing": ["string"], "suggested_price_range": "string" },
  "customer_persona": { "name": "string", "age_range": "string", "occupation": "string", "frustrations": ["string"], "goals": ["string"], "typical_quote": "string" },
  "reddit_threads": [{ "title": "string", "url": "string", "why_relevant": "string", "upvotes": number }],
  "sources_count": { "reddit_posts": number, "web_results": number, "twitter_results": number }
}`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const text = response.data?.choices?.[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Groq error:', err.message);
    throw new Error('Failed to generate report');
  }
};

// Generate social media posts using Groq
const generatePosts = async (reportData, query) => {
  const prompt = `You are a social media content expert. Generate 4 posts in this exact JSON format:
{
  "twitter_thread": { "platform": "twitter", "tone": "storytelling", "content": "Full thread with tweet numbers" },
  "linkedin": { "platform": "linkedin", "tone": "data_driven", "content": "Professional post" },
  "reddit": { "platform": "reddit", "tone": "humble", "content": "Authentic post" },
  "hook": { "platform": "hook", "tone": "hype", "content": "One hook sentence" }
}`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const text = response.data?.choices?.[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    throw new Error('Failed to generate posts');
  }
};

// Ask the Data using Groq
const askReport = async (question, reportData) => {
  const prompt = `You are an AI analyst. Answer the question using ONLY the data in the report. Be concise.

REPORT: ${JSON.stringify(reportData)}
QUESTION: ${question}
Answer in 2-4 sentences maximum.`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return response.data?.choices?.[0]?.message?.content || 'Unable to answer that question.';
  } catch (err) {
    throw new Error('Failed to process question');
  }
};

module.exports = { generateFollowupQuestions, generateReport, generatePosts, askReport };
