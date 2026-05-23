const supabase = require('../lib/supabase');

// Verifies the user's JWT token from Supabase
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.authUser = user;

    // Fetch internal user record
    const { data: internalUser } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .single();

    req.user = internalUser;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Auth error' });
  }
};

// Gate: checks every step of the user workflow
// Blocks access to dashboard if user hasn't paid
const requirePaid = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: state } = await supabase
      .from('user_workflow_state')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (!state || !state.has_paid) {
      return res.status(403).json({
        error: 'Payment required',
        redirect: '/pricing',
        code: 'PAYMENT_REQUIRED'
      });
    }

    req.workflowState = state;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Workflow check failed' });
  }
};

// Check report limits based on plan
const checkReportLimit = async (req, res, next) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', req.user.id)
      .single();

    const plan = subscription?.plan || 'free';
    const limits = { free: 3, pro: 30, builder: Infinity };
    const limit = limits[plan];

    const now = new Date();
    const { data: usage } = await supabase
      .from('report_usage')
      .select('report_count')
      .eq('user_id', req.user.id)
      .eq('month', now.getMonth() + 1)
      .eq('year', now.getFullYear())
      .single();

    const currentCount = usage?.report_count || 0;

    if (currentCount >= limit) {
      return res.status(403).json({
        error: 'Report limit reached',
        code: 'LIMIT_REACHED',
        plan,
        limit,
        used: currentCount,
        redirect: '/pricing'
      });
    }

    req.userPlan = plan;
    req.reportUsage = currentCount;
    next();
  } catch (err) {
    next();
  }
};

module.exports = { authenticate, requirePaid, checkReportLimit };
