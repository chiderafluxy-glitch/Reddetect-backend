const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticate, requirePaid } = require('../middleware/auth');

// Get all ideas in vault
router.get('/', authenticate, requirePaid, async (req, res) => {
  try {
    const { stage } = req.query;

    let query = supabase
      .from('idea_vault')
      .select('*, workspaces(id, title, reports(verdict, status))')
      .eq('user_id', req.user.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (stage) query = query.eq('stage', stage);

    const { data: ideas } = await query;
    res.json({ ideas: ideas || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get vault' });
  }
});

// Update idea stage (exploring, validating, validated, killed)
router.put('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    const { stage, title, pinned } = req.body;

    const { data: idea } = await supabase
      .from('idea_vault')
      .update({ stage, title, pinned, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    // Sync stage to workspace if linked
    if (stage && idea?.workspace_id) {
      await supabase.from('workspaces')
        .update({ stage })
        .eq('id', idea.workspace_id);
    }

    res.json({ idea });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update idea' });
  }
});

// Get the graveyard (killed ideas only)
router.get('/graveyard', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: ideas } = await supabase
      .from('idea_vault')
      .select('*, workspaces(id, reports(kill_switch, verdict))')
      .eq('user_id', req.user.id)
      .eq('stage', 'killed')
      .order('updated_at', { ascending: false });

    res.json({ ideas: ideas || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get graveyard' });
  }
});

// Delete idea from vault permanently
router.delete('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    await supabase.from('idea_vault').delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete idea' });
  }
});

module.exports = router;
