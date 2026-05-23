# Reddetect Backend

Market research and idea validation API.

---

## SETUP (Do this in order)

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```

Fill in these values in your .env:

**SUPABASE**
- Go to supabase.com → project: reddetect
- Settings → API
- Copy: URL, anon key, service_role key

**STRIPE**
- Go to stripe.com → Developers → API keys
- Copy your Secret key (starts with sk_)
- For webhook secret: Developers → Webhooks → Add endpoint
  - URL: https://your-render-url.onrender.com/api/stripe/webhook
  - Events to listen for:
    - checkout.session.completed
    - customer.subscription.deleted
    - customer.subscription.updated
    - invoice.payment_failed
  - Copy the webhook signing secret

**DEEPSEEK**
- Go to platform.deepseek.com
- API Keys → Create key
- Copy it

**GEMINI**
- Go to aistudio.google.com
- Get API key → Create API key
- Copy it

**SERPER**
- Go to serper.dev
- Sign up → API key
- Copy it

**FRONTEND_URL**
- Development: http://localhost:3000
- Production: your Vercel URL

---

### 3. Run locally
```bash
npm run dev
```

API runs on http://localhost:4000
Test it: http://localhost:4000/health

---

## DEPLOY TO RENDER

1. Push this folder to a GitHub repo
2. Go to render.com → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects the render.yaml
5. Add all your secret env vars in Render dashboard
6. Deploy

---

## PROJECT STRUCTURE

```
src/
├── index.js              # Express app + routes setup
├── lib/
│   └── supabase.js       # Supabase client
├── middleware/
│   └── auth.js           # JWT verify + payment gate + report limit check
├── routes/
│   ├── auth.js           # User sync + workflow state
│   ├── stripe.js         # Checkout + webhook + subscription status
│   ├── reports.js        # Core feature - generate reports
│   ├── workspaces.js     # Idea workspaces + notes
│   ├── posts.js          # Launch Voice - social post generation
│   └── vault.js          # Idea Vault + Graveyard
└── services/
    ├── scraper.js        # Reddit JSON + Serper web search
    └── ai.js             # Gemini (follow-up Qs) + DeepSeek (reports + posts)
```

---

## HOW REPORT GENERATION WORKS

1. Frontend sends query → POST /api/reports/followup → gets 3 questions
2. User answers questions
3. Frontend sends query + answers → POST /api/reports/generate
4. Backend returns reportId immediately (non-blocking)
5. In background: scrapes Reddit + web in parallel, sends to DeepSeek
6. Frontend polls GET /api/reports/:id/status every 3 seconds
7. When status = "completed" → fetch full report GET /api/reports/:id
8. Auto-creates workspace + vault entry for the idea

---

## SUPABASE PROJECT
URL: https://uxeftaskeprmtqdvtadr.supabase.co
Name: reddetect
Region: us-east-1

Tables created:
- users
- subscriptions
- user_workflow_state
- report_usage
- reports
- workspaces
- workspace_notes
- competitors
- generated_posts
- idea_vault
