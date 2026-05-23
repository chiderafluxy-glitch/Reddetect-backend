const axios = require('axios');

const groqRequest = async (prompt, temperature = 0.3, maxTokens = 8192) => {
  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );
  return response.data?.choices?.[0]?.message?.content || '{}';
};

const generateFollowupQuestions = async (userQuery) => {
  try {
    const prompt = `You are a market research assistant. A user wants to validate an idea or find market demand.

Their input: "${userQuery}"

Generate exactly 3 short focused follow-up questions to sharpen the search. Return ONLY a JSON array of 3 strings. No preamble no markdown.
Example: ["Who is your ideal customer?", "What problem are you trying to solve?", "Are you validating an idea or looking for new ones?"]`;

    const text = await groqRequest(prompt, 0.7, 300);
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Followup questions error:', err.message);
    return [
      'Who is your target customer?',
      'What specific problem are you trying to solve?',
      'Are you validating an existing idea or looking for new opportunities?'
    ];
  }
};

const generateReport = async (query, followupAnswers, scrapedData) => {
  const redditSummary = scrapedData.reddit
    .slice(0, 15)
    .map(p => `[r/${p.subreddit}] "${p.title}" (${p.upvotes} upvotes) - ${p.body ? p.body.slice(0, 200) : ''}`)
    .join('\n');

  const webSummary = scrapedData.web
    .slice(0, 8)
    .map(p => `[${p.source}] "${p.title}" - ${p.snippet}`)
    .join('\n');

  const prompt = `You are an expert market research analyst. Analyze this data and generate a comprehensive market research report.

USER QUERY: ${query}
USER CONTEXT: ${JSON.stringify(followupAnswers)}
REDDIT DATA: ${redditSummary}
WEB DATA: ${webSummary}

Return ONLY valid JSON with this structure, no markdown no preamble:
{"verdict":"strong_signal","verdict_summary":"string","demand_score":75,"competition_level":"medium","key_insights":[{"insight":"string","evidence":"string","source_url":"string"}],"top_quotes":[{"quote":"string","subreddit":"string","upvotes":100,"url":"string"}],"subreddits":[{"name":"string","relevance":"string","url":"string"}],"audience":{"who_they_are":"string","pain_points":["string"],"language_they_use":["string"],"where_they_hang_out":["string"]},"competitors":[{"name":"string","url":"string","what_people_say":"string","gaps":["string"]}],"market_gaps":["string"],"willingness_to_pay":{"score":70,"evidence":"string","price_signals":["string"]},"opportunity_map":{"crowded_areas":["string"],"underserved_areas":["string"],"best_opportunity":"string"},"mvp_suggestion":{"core_feature":"string","target_user":"string","why":"string"},"kill_switch":{"risks":["string"],"existing_solutions":["string"],"why_it_might_fail":"string","market_concerns":["string"]},"market_size":{"estimate":"string","reasoning":"string","conversation_volume":"medium"},"pricing_intelligence":{"what_people_pay_now":["string"],"complaints_about_pricing":["string"],"suggested_price_range":"string"},"customer_persona":{"name":"string","age_range":"string","occupation":"string","frustrations":["string"],"goals":["string"],"typical_quote":"string"},"reddit_threads":[{"title":"string","url":"string","why_relevant":"string","upvotes":100}],"sources_count":{"reddit_posts":15,"web_results":8,"twitter_results":5}}`;

  try {
    const text = await groqRequest(prompt, 0.3, 8192);
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Report generation error:', err.message);
    throw new Error('Failed to generate report');
  }
};

const generatePosts = async (reportData, query) => {
  const prompt = `You are a social media expert helping a founder share market research.

TOPIC: ${query}
VERDICT: ${reportData.verdict}
DEMAND SCORE: ${reportData.demand_score}/100

Return ONLY valid JSON, no markdown:
{"twitter_thread":{"platform":"twitter","tone":"storytelling","content":"Full Twitter thread with tweet numbers"},"linkedin":{"platform":"linkedin","tone":"data_driven","content":"Professional LinkedIn post"},"reddit":{"platform":"reddit","tone":"humble","content":"Authentic Reddit post"},"hook":{"platform":"hook","tone":"hype","content":"One powerful hook sentence"}}`;

  try {
    const text = await groqRequest(prompt, 0.8, 2000);
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    throw new Error('Failed to generate posts');
  }
};

const askReport = async (question, reportData) => {
  const prompt = `You are an AI analyst with access to this market research report. Answer using ONLY data from the report in 2-4 sentences.

REPORT: ${JSON.stringify(reportData)}
QUESTION: ${question}`;

  try {
    return await groqRequest(prompt, 0.4, 500);
  } catch (err) {
    throw new Error('Failed to process question');
  }
};

module.exports = { generateFollowupQuestions, generateReport, generatePosts, askReport };
