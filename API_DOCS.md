# REDDETECT — COMPLETE API DOCUMENTATION
# Give this entire file to AI Studio when building the frontend

---

## BASE URL
Development: http://localhost:4000
Production: https://your-render-url.onrender.com

## AUTHENTICATION
Every protected request needs this header:
Authorization: Bearer <supabase_jwt_token>

Get the token from Supabase auth on the frontend:
const { data: { session } } = await supabase.auth.getSession()
const token = session.access_token

---

## USER WORKFLOW GATE
After every login, call GET /api/auth/workflow-state
The response tells you where to send the user:
- has_signed_up: false → /signup
- has_paid: false → /pricing
- Both true → /dashboard

---

## ENDPOINTS

### AUTH

#### POST /api/auth/sync-user
Call this IMMEDIATELY after user signs up or logs in via Supabase.
No body needed. Token in header is enough.
Response:
{
  "user": { "id": "uuid", "email": "string", "full_name": "string", "avatar_url": "string" },
  "workflowState": { "has_signed_up": true, "has_paid": false }
}

#### GET /api/auth/workflow-state
Check where to route the user after login.
Response:
{
  "state": { "has_signed_up": true, "has_paid": true },
  "subscription": { "plan": "pro", "status": "active" },
  "redirect": "/dashboard"
}

---

### STRIPE

#### POST /api/stripe/create-checkout
Redirect user to Stripe to pay.
Body: { "priceId": "price_1TZqapCBOoQTb0NpDoJmctz7" }
Pro price ID: price_1TZqapCBOoQTb0NpDoJmctz7
Builder price ID: price_1TZqc2CBOoQTb0NpsOJfR9p6
Response: { "url": "https://checkout.stripe.com/..." }
→ Redirect user to this URL

#### GET /api/stripe/status
Get current subscription and usage.
Response:
{
  "subscription": { "plan": "pro", "status": "active" },
  "usage": { "used": 5, "limit": 30, "unlimited": false }
}

---

### REPORTS (Core Feature)

#### STEP 1 — POST /api/reports/followup
Send the user's query, get back 3 follow-up questions.
Body: { "query": "I want to build a tool for freelancers to track invoices" }
Response: { "questions": ["Who is your target customer?", "What problem...", "Are you validating..."] }

#### STEP 2 — POST /api/reports/generate
Send query + follow-up answers to start report generation.
Returns immediately with reportId. Report generates in background.
Body:
{
  "query": "I want to build a tool for freelancers to track invoices",
  "followupQuestions": ["Who is your target customer?", ...],
  "followupAnswers": { "0": "Freelance designers", "1": "Late payments", "2": "Validating" }
}
Response: { "reportId": "uuid", "status": "processing" }

#### POLL — GET /api/reports/:id/status
Poll this every 3 seconds until status is "completed" or "failed".
Response: { "id": "uuid", "status": "processing" | "completed" | "failed", "verdict": "strong_signal" }

#### GET /api/reports/:id
Get the full completed report.
Response includes ALL of these fields:
{
  "id": "uuid",
  "title": "string",
  "original_query": "string",
  "verdict": "strong_signal" | "weak_signal" | "mixed",
  "report_data": {
    "verdict": "strong_signal",
    "verdict_summary": "string",
    "demand_score": 0-100,
    "competition_level": "low" | "medium" | "high",
    "key_insights": [{ "insight": "string", "evidence": "string", "source_url": "string" }],
    "top_quotes": [{ "quote": "string", "subreddit": "string", "upvotes": number, "url": "string" }],
    "subreddits": [{ "name": "string", "relevance": "string", "url": "string" }],
    "audience": {
      "who_they_are": "string",
      "pain_points": ["string"],
      "language_they_use": ["string"],
      "where_they_hang_out": ["string"]
    },
    "competitors": [{ "name": "string", "url": "string", "what_people_say": "string", "gaps": ["string"] }],
    "market_gaps": ["string"],
    "willingness_to_pay": { "score": 0-100, "evidence": "string", "price_signals": ["string"] },
    "opportunity_map": { "crowded_areas": ["string"], "underserved_areas": ["string"], "best_opportunity": "string" },
    "mvp_suggestion": { "core_feature": "string", "target_user": "string", "why": "string" },
    "kill_switch": { "risks": ["string"], "existing_solutions": ["string"], "why_it_might_fail": "string" },
    "market_size": { "estimate": "string", "reasoning": "string", "conversation_volume": "low"|"medium"|"high"|"very_high" },
    "pricing_intelligence": { "what_people_pay_now": ["string"], "complaints_about_pricing": ["string"], "suggested_price_range": "string" },
    "customer_persona": { "name": "string", "age_range": "string", "occupation": "string", "frustrations": ["string"], "goals": ["string"], "typical_quote": "string" },
    "reddit_threads": [{ "title": "string", "url": "string", "why_relevant": "string", "upvotes": number }],
    "sources_count": { "reddit_posts": number, "web_results": number, "twitter_results": number }
  }
}

#### GET /api/reports
List all reports for the user.
Response: { "reports": [{ "id", "title", "verdict", "status", "created_at" }] }

#### DELETE /api/reports/:id
Delete a report.
Response: { "success": true }

#### POST /api/reports/:id/ask
Ask the Data feature — chat with a report.
Body: { "question": "Who is most frustrated by this?" }
Response: { "answer": "string" }

---

### WORKSPACES

#### GET /api/workspaces
List all workspaces.
Response: { "workspaces": [{ "id", "title", "stage", "reports": {...} }] }

#### GET /api/workspaces/:id
Get single workspace with all notes.
Response: { "workspace": {...}, "notes": [...] }

#### PUT /api/workspaces/:id
Update workspace stage or title.
Body: { "title": "string", "stage": "exploring" | "validating" | "validated" | "killed" }

#### POST /api/workspaces/:id/notes
Add a note to a workspace.
Body: { "content": "string" }
Response: { "note": { "id", "content", "created_at" } }

#### DELETE /api/workspaces/:id/notes/:noteId
Delete a note.

#### DELETE /api/workspaces/:id
Delete a workspace.

---

### POSTS (Launch Voice)

#### POST /api/posts/generate
Generate all social media posts from a report. One click.
Body: { "reportId": "uuid" }
Response:
{
  "posts": [...],
  "raw": {
    "twitter_thread": { "platform": "twitter", "tone": "storytelling", "content": "1/ I just..." },
    "linkedin": { "platform": "linkedin", "tone": "data_driven", "content": "..." },
    "reddit": { "platform": "reddit", "tone": "humble", "content": "..." },
    "hook": { "platform": "hook", "tone": "hype", "content": "One powerful sentence" }
  }
}

#### GET /api/posts/report/:reportId
Get all previously generated posts for a report.

---

### VAULT (Idea Vault + Graveyard)

#### GET /api/vault
Get all ideas. Optional filter: ?stage=exploring|validating|validated|killed
Response: { "ideas": [...] }

#### GET /api/vault/graveyard
Get only killed ideas (The Graveyard).

#### PUT /api/vault/:id
Update idea stage or pin it.
Body: { "stage": "killed", "pinned": true }

#### DELETE /api/vault/:id
Permanently delete an idea.

---

## PAGES NEEDED (Frontend)

1. / — Landing page with Get Started CTA
2. /signup — Email + Google signup via Supabase
3. /login — Email + Google login via Supabase
4. /pricing — Plans page ($20 Pro, $50 Builder, free hidden at bottom)
5. /dashboard — Main workspace (sidebar + prompt box + report history)
6. /report/:id — Full report view with all sections
7. /workspace/:id — Idea workspace with notes
8. /vault — Idea vault with stage filters
9. /vault/graveyard — Killed ideas

## SIDEBAR NAVIGATION
- Dashboard (home/prompt)
- My Reports
- Workspaces
- Idea Vault
- Graveyard
- Settings

## COLOR CODES FOR VERDICT
- strong_signal → green
- weak_signal → red/orange
- mixed → yellow

## PLAN LIMITS TO SHOW IN UI
- free: 3 reports/month
- pro: 30 reports/month
- builder: unlimited
