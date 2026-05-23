const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticate, requirePaid } = require('../middleware/auth');
const { generatePosts } = require('../services/ai');

// Generate all social posts for a report
router.post('/generate', authenticate, requirePaid, async (req, res) => {
  try {
    const { reportId } = req.body;
    if (!reportId) return res.status(400).json({ error: 'Report ID is required' });

    const { data: report } = await supabase
      .from('reports')
      .select('report_data, original_query, status')
      .eq('id', reportId)
      .eq('user_id', req.user.id)
      .single();

    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'completed') return res.status(400).json({ error: 'Report not ready yet' });

    const posts = await generatePosts(report.report_data, report.original_query);

    // Save all generated posts
    const postsToInsert = Object.values(posts).map(post => ({
      report_id: reportId,
      user_id: req.user.id,
      platform: post.platform,
      tone: post.tone,
      content: post.content
    }));

    const { data: savedPosts } = await supabase
      .from('generated_posts')
      .insert(postsToInsert)
      .select();

    res.json({ posts: savedPosts, raw: posts });
  } catch (err) {
    console.error('Generate posts error:', err);
    res.status(500).json({ error: 'Failed to generate posts' });
  }
});

// Get all saved posts for a report
router.get('/report/:reportId', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: posts } = await supabase
      .from('generated_posts')
      .select('*')
      .eq('report_id', req.params.reportId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    res.json({ posts: posts || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

module.exports = router;
