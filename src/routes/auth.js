const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');

// Called right after user signs up via Supabase auth
// Creates user profile + workflow state in our tables
router.post('/sync-user', authenticate, async (req, res) => {
  try {
    const { authUser } = req;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    if (existingUser) {
      // Return existing user + their workflow state
      const { data: state } = await supabase
        .from('user_workflow_state')
        .select('*')
        .eq('user_id', existingUser.id)
        .single();

      return res.json({ user: existingUser, workflowState: state });
    }

    // Create new user record
    let newUser;
    try {
      const { data, error } = await supabase
        .from('users')
        .insert({
          auth_id: authUser.id,
          email: authUser.email,
          full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
          avatar_url: authUser.user_metadata?.avatar_url || null
        })
        .select()
        .single();
      
      if (error) throw error;
      newUser = data;
    } catch (err) {
      // If duplicate error (23505), fetch existing user
      if (err.code === '23505') {
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', authUser.id)
          .single();
        
        if (existingUser) {
          const { data: state } = await supabase
            .from('user_workflow_state')
            .select('*')
            .eq('user_id', existingUser.id)
            .single();
          
          return res.json({ user: existingUser, workflowState: state });
        }
      }
      throw err;
    }

    // Create workflow state tracking record
    const { data: workflowState } = await supabase
      .from('user_workflow_state')
      .insert({
        user_id: newUser.id,
        has_signed_up: true,
        has_paid: false,
        has_completed_onboarding: false,
        signup_completed_at: new Date().toISOString()
      })
      .select()
      .single();

    // Create default free subscription
    await supabase.from('subscriptions').insert({
      user_id: newUser.id,
      plan: 'free',
      status: 'inactive'
    });

    res.json({ user: newUser, workflowState });
  } catch (err) {
    console.error('Sync user error:', err);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Get current user's workflow state (used by frontend gating logic)
router.get('/workflow-state', authenticate, async (req, res) => {
  try {
    const { data: state } = await supabase
      .from('user_workflow_state')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', req.user.id)
      .single();

    res.json({
      state,
      subscription,
      redirect: !state?.has_paid ? '/pricing' : '/dashboard'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get workflow state' });
  }
});

module.exports = router;
