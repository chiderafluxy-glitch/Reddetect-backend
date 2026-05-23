const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');

router.post('/sync-user', authenticate, async (req, res) => {
  try {
    const { authUser } = req;

    // Always try to find existing user first
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

    // Try to create new user
    let newUser;
    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
        avatar_url: authUser.user_metadata?.avatar_url || null
      })
      .select()
      .single();

    if (insertError) {
      // If duplicate, fetch by email instead
      if (insertError.code === '23505') {
        const { data: foundUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .single();
        newUser = foundUser;
      } else {
        throw insertError;
      }
    } else {
      newUser = inserted;
    }

    if (!newUser) {
      return res.status(500).json({ error: 'Could not find or create user' });
    }

    // Get or create workflow state
    let workflowState;
    const { data: existingState } = await supabase
      .from('user_workflow_state')
      .select('*')
      .eq('user_id', newUser.id)
      .single();

    if (existingState) {
      workflowState = existingState;
    } else {
      const { data: newState } = await supabase
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
      workflowState = newState;

      await supabase.from('subscriptions').insert({
        user_id: newUser.id,
        plan: 'free',
        status: 'inactive'
      });
    }

    res.json({ user: newUser, workflowState });
  } catch (err) {
    console.error('Sync user error:', err);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

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
