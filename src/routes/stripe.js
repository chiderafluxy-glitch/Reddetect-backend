const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');

const PLAN_MAP = {
  [process.env.STRIPE_PRO_PRICE_ID]: 'pro',
  [process.env.STRIPE_BUILDER_PRICE_ID]: 'builder'
};

// Create Stripe checkout session
router.post('/create-checkout', authenticate, async (req, res) => {
  try {
    const { priceId } = req.body;

    if (!priceId || !PLAN_MAP[priceId]) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?payment=cancelled`,
      customer_email: req.authUser.email,
      metadata: {
        user_id: req.user.id,
        auth_id: req.authUser.id
      }
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook - handles payment events
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const priceId = session.line_items?.data?.[0]?.price?.id;

        // Fetch full session to get subscription and price
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items', 'subscription']
        });

        const subscriptionId = fullSession.subscription?.id;
        const actualPriceId = fullSession.line_items?.data?.[0]?.price?.id;
        const plan = PLAN_MAP[actualPriceId] || 'pro';

        if (userId) {
          // Update subscription table
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            plan,
            status: 'active',
            stripe_customer_id: session.customer,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: actualPriceId,
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

          // Update workflow state - mark as paid
          await supabase.from('user_workflow_state').upsert({
            user_id: userId,
            has_paid: true,
            payment_completed_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
        }
        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status;

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (sub) {
          const isActive = status === 'active';
          await supabase.from('subscriptions').update({
            status: isActive ? 'active' : status === 'canceled' ? 'cancelled' : 'past_due',
            plan: isActive ? PLAN_MAP[subscription.items?.data?.[0]?.price?.id] || 'free' : 'free',
            updated_at: new Date().toISOString()
          }).eq('stripe_subscription_id', subscription.id);

          // If cancelled - update workflow state
          if (!isActive) {
            await supabase.from('user_workflow_state').update({
              has_paid: false
            }).eq('user_id', sub.user_id);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', invoice.customer)
          .single();

        if (sub) {
          await supabase.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString()
          }).eq('user_id', sub.user_id);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get current user's subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    const now = new Date();
    const { data: usage } = await supabase
      .from('report_usage')
      .select('report_count')
      .eq('user_id', req.user.id)
      .eq('month', now.getMonth() + 1)
      .eq('year', now.getFullYear())
      .single();

    const limits = { free: 3, pro: 30, builder: -1 };
    const plan = subscription?.plan || 'free';

    res.json({
      subscription,
      usage: {
        used: usage?.report_count || 0,
        limit: limits[plan],
        unlimited: plan === 'builder'
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

module.exports = router;
