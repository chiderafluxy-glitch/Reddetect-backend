const axios = require('axios');

// Search Reddit using the free JSON endpoint
const searchReddit = async (query, limit = 25) => {
  try {
    const response = await axios.get('https://www.reddit.com/search.json', {
      params: { q: query, limit, sort: 'relevance', t: 'year' },
      headers: { 'User-Agent': 'Reddetect/1.0' },
      timeout: 10000
    });

    const posts = response.data?.data?.children || [];

    return posts.map(({ data: post }) => ({
      title: post.title,
      body: post.selftext?.slice(0, 800) || '',
      subreddit: post.subreddit,
      upvotes: post.ups,
      comments: post.num_comments,
      url: `https://reddit.com${post.permalink}`,
      created: new Date(post.created_utc * 1000).toISOString(),
      author: post.author
    }));
  } catch (err) {
    console.error('Reddit search error:', err.message);
    return [];
  }
};

// Search top comments in a specific subreddit
const searchSubreddit = async (subreddit, query, limit = 10) => {
  try {
    const response = await axios.get(
      `https://www.reddit.com/r/${subreddit}/search.json`,
      {
        params: { q: query, limit, restrict_sr: true, sort: 'relevance' },
        headers: { 'User-Agent': 'Reddetect/1.0' },
        timeout: 10000
      }
    );

    const posts = response.data?.data?.children || [];
    return posts.map(({ data: post }) => ({
      title: post.title,
      body: post.selftext?.slice(0, 600) || '',
      subreddit: post.subreddit,
      upvotes: post.ups,
      url: `https://reddit.com${post.permalink}`
    }));
  } catch (err) {
    return [];
  }
};

// Search the web using Serper (finds Twitter, Quora, forums, news, etc.)
const searchWeb = async (query) => {
  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 10 },
      {
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const organic = response.data?.organic || [];
    return organic.map(item => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
      source: new URL(item.link).hostname
    }));
  } catch (err) {
    console.error('Serper search error:', err.message);
    return [];
  }
};

// Search Twitter/X content via Serper
const searchTwitter = async (query) => {
  return searchWeb(`site:twitter.com OR site:x.com ${query}`);
};

// Run all scraping in parallel for speed
const scrapeAll = async (query, followupContext = '') => {
  const fullQuery = followupContext ? `${query} ${followupContext}` : query;

  const [redditGeneral, webResults, twitterResults, competitorSearch] = await Promise.all([
    searchReddit(fullQuery, 30),
    searchWeb(fullQuery),
    searchTwitter(query),
    searchWeb(`${query} alternative tool app software price`)
  ]);

  return {
    reddit: redditGeneral,
    web: webResults,
    twitter: twitterResults,
    competitors: competitorSearch
  };
};

module.exports = { searchReddit, searchSubreddit, searchWeb, searchTwitter, scrapeAll };
