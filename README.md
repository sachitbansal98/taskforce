# TaskForce 📋

**Rajesh Bansal's AI-powered task manager for construction projects.**

Voice input (Hindi + English) → AI parsing → structured tasks. Built for Samsung Galaxy, works as a PWA.

## Features

- 🎙️ **Voice Input** — Speak tasks in Hindi or English, AI structures them
- 🤖 **AI Quick Add** — Natural language to structured tasks via Claude API
- 💬 **WhatsApp Integration** — Forward tasks and daily briefings via WhatsApp
- 📊 **Morning Briefing** — Daily snapshot of all projects
- 🔔 **Push Notifications** — Browser notifications for due tasks
- 📱 **PWA** — Install on home screen, works like a native app

## Projects Pre-configured

1. 🏗️ **Ludhiana** — Mall & Hotel
2. 🏘️ **Jhajjar** — Residential
3. 🏠 **Alwar** — Affordable Housing
4. 🔧 **Costify** — Appliance Business
5. 📋 **Personal** — Everything else

---

## Deployment (step by step)

### Step 1: Push to GitHub

```bash
# In this folder:
git init
git add .
git commit -m "TaskForce v1"

# Create a new repo on GitHub called "taskforce" then:
git remote add origin https://github.com/sachitbansal98/taskforce.git
git branch -M main
git push -u origin main
```

### Step 2: Get your Anthropic API Key

1. Go to https://console.anthropic.com
2. Create an API key (or use your existing one)
3. Copy it — you'll need it in Step 3

### Step 3: Deploy on Vercel

1. Go to https://vercel.com/new
2. Import the `taskforce` repo from GitHub
3. **Framework Preset**: Select `Vite`
4. **Environment Variables**: Add one:
   - Key: `ANTHROPIC_API_KEY`
   - Value: *paste your API key*
5. Click **Deploy**

### Step 4: Set up on Rajesh uncle's phone

1. Open the Vercel URL on his Samsung Galaxy (in Samsung Internet or Chrome)
2. Tap the menu → **Add to Home Screen**
3. Now he has a TaskForce icon on his phone!
4. Open it, go to Settings (⚙️), enable Push Notifications

---

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` with:
```
ANTHROPIC_API_KEY=your_key_here
```

---

## Tech Stack

- **Frontend**: React + Vite (single page app)
- **Backend**: Vercel Serverless Function (API proxy for Claude)
- **AI**: Claude Sonnet via Anthropic API
- **Storage**: localStorage (device-local)
- **Voice**: Web Speech API (browser native)
- **Notifications**: Web Notifications API
