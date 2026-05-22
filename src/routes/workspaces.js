const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticate, requirePaid } = require('../middleware/auth');

// Get all workspaces
router.get('/', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('*, reports(title, verdict, status)')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    res.json({ workspaces: workspaces || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get workspaces' });
  }
});

// Get single workspace with notes
router.get('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*, reports(*)')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const { data: notes } = await supabase
      .from('workspace_notes')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });

    res.json({ workspace, notes: notes || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

// Update workspace stage
router.put('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    const { title, stage } = req.body;

    const { data: workspace } = await supabase
      .from('workspaces')
      .update({ title, stage, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    res.json({ workspace });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// Add note to workspace
router.post('/:id/notes', authenticate, requirePaid, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const { data: note } = await supabase
      .from('workspace_notes')
      .insert({
        workspace_id: req.params.id,
        user_id: req.user.id,
        content
      })
      .select()
      .single();

    // Update workspace updated_at
    await supabase.from('workspaces')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ note });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Delete note
router.delete('/:id/notes/:noteId', authenticate, requirePaid, async (req, res) => {
  try {
    await supabase.from('workspace_notes')
      .delete()
      .eq('id', req.params.noteId)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Delete workspace
router.delete('/:id', authenticate, requirePaid, async (req, res) => {
  try {
    await supabase.from('workspaces').delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

module.exports = router;
