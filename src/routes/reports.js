const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticate, requirePaid, checkReportLimit } = require('../middleware/auth');
const { scrapeAll } = require('../services/scraper');
const { generateFollowupQuestions, generateReport, askReport } = require('../services/ai');

// Generate follow-up questions for a query (step 1)
router.post('/followup', authenticate, requirePaid, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a more detailed query' });
    }

    const questions = await generateFollowupQuestions(query);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

// Generate full research report (step 2 - after user answers follow-up questions)
router.post('/generate', authenticate, requirePaid, checkReportLimit, async (req, res) => {
  try {
    const { query, followupQuestions, followupAnswers } = req.body;

    if (!query) return res.status(400).json({ error: 'Query is required' });

    // Create report record with pending status
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        user_id: req.user.id,
        title: query.slice(0, 100),
        original_query: query,
        followup_questions: followupQuestions || [],
        followup_answers: followupAnswers || {},
        status: 'processing'
      })
      .select()
      .single();

    if (reportError) throw reportError;

    // Send report ID immediately so frontend can show loading state
    res.json({ reportId: report.id, status: 'processing' });

    // Run scraping + AI generation async (don't block the response)
    setImmediate(async () => {
      try {
        const contextString = followupAnswers
          ? Object.values(followupAnswers).join(' ')
          : '';

        // Scrape everything in parallel
        const scrapedData = await scrapeAll(query, contextString);

        // Generate the full report
        const reportData = await generateReport(query, followupAnswers, scrapedData);

        // Save completed report
        await supabase.from('reports').update({
          verdict: reportData.verdict,
          report_data: reportData,
          status: 'completed',
          sources_used: {
            reddit: scrapedData.reddit.length,
            web: scrapedData.web.length,
            twitter: scrapedData.twitter.length
          },
          completed_at: new Date().toISOString()
        }).eq('id', report.id);

        // Auto-create workspace for this report
        await supabase.from('workspaces').insert({
          user_id: req.user.id,
          report_id: report.id,
          title: query.slice(0, 100),
          stage: 'exploring'
        });

        // Add to idea vault
        await supabase.from('idea_vault').insert({
          user_id: req.user.id,
          title: query.slice(0, 100),
          stage: 'exploring'
        });

        // Increment report usage counter
        const now = new Date();
        await supabase.from('report_usage').upsert({
          user_id: req.user.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          report_count: (req.reportUsage || 0) + 1,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,month,year' });

      } catch (err) {
        console.error('Report generation error:', err);
        await supabase.from('reports').update({
          status: 'failed'
        }).eq('id', report.id);
      }
    });

  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ error: 'Failed to start report generation' });
  }
});

// Poll report status (frontend polls this until status is 'completed')
router.get('/:id/status', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: report } = await supabase
      .from('reports')
      .select('id, status, verdict, completed_at')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get report status' });
  }
});

// Get full report data
router.get('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: report } = await supabase
      .from('reports')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// List all reports for user
router.get('/', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: reports } = await supabase
      .from('reports')
      .select('id, title, verdict, status, created_at, completed_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    res.json({ reports: reports || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Delete a report
router.delete('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    await supabase.from('reports').delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Ask the Data - chat with a specific report
router.post('/:id/ask', authenticate, requirePaid, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    const { data: report } = await supabase
      .from('reports')
      .select('report_data')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!report) return res.status(404).json({ error: 'Report not found' });

    const answer = await askReport(question, report.report_data);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process question' });
  }
});

module.exports = router;
