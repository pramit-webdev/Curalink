# 🧬 Curalink AI: Precision Medical Research Engine

Curalink is a high-performance, real-time medical reasoning platform designed to bridge the gap between massive medical datasets and actionable clinical insights. By integrating PubMed, OpenAlex, and ClinicalTrials.gov with advanced LLM synthesis, Curalink provides source-backed, context-aware assistance for complex medical inquiries.

### 🌐 [Live App](https://curalink-flame.vercel.app) | 📡 [Backend API](https://curalink-p8ac.onrender.com)

---

## 🚀 Key Innovation: Summarization Depth
Curalink doesn't just "Google" your question. Our proprietary **Trend-Aware Reasoning Pipeline** performs a systemic scan across 50+ real-time research results to identify the **Global Research Pulse**. 
- **Consensus Discovery**: Detects whether the medical field is in agreement or conflict regarding a treatment.
- **Tiered Evidence**: Uses the broad pool (50 results) for field trends and the precision pool (top 8) for specific, linkable citations.

### 📖 [Detailed Documentation](docs/PROJECT_DOCUMENTATION.md)

---

## ✨ Features

- **🔍 Intelligent Query Expansion**: Automatically transforms natural language into multi-source search terms based on user history and medical intent.
- **⚡ SSE Pulse Architecture**: Implements Server-Sent Events with **8KB Heartbeat Padded Flush** to bypass cloud proxy buffering (Render/Vercel), ensuring instant word-by-word synthesis.
- **📋 Clinical Trials Specialist**: Direct integration with ClinicalTrials.gov v2 API, providing NCT IDs, Recruiting Status, Eligibility Criteria, and Location mapping.
- **🧠 Personalized Health Companion**: Remembers user condition and dialogue history to adapt subsequent answers, avoiding generic medical advice.
- **💾 Multi-Session History**: Robust persistence layer with MongoDB Atlas for saving, revisiting, and continuing complex research threads.

---

## 🛠 Technical Stack

- **Frontend**: React (Vite), Axios, Lucide-React, Markdown-to-JSX.
- **Backend**: FastAPI (Python), Motor (Async MongoDB), httpx, xmltodict.
- **AI / Reasoning**: Llama (Meta) via Groq Cloud with context-aware system prompts.
- **Database**: MongoDB Atlas (Global Persistence).
- **Deployment**: Vercel (Frontend), Render (Backend).

---

## 🔧 Installation & Setup

### Prerequisites
- Python 3.9+
- Node.js 18+
- MongoDB Atlas Account
- API Keys: `GROQ_API_KEY`, `HUGGINGFACE_TOKEN`

### Backend Setup
1. `cd backend`
2. `python -m venv .venv && source .venv/bin/activate`
3. `pip install -r requirements.txt`
4. Create `.env` from `.env.template` and fill in your keys.
5. `uvicorn main:app --reload`

### Frontend Setup
1. `cd frontend`
2. `npm install`
3. `npm run dev`

---

## 🛡 Security & Hardening

Curalink is hardened for production environments through:
- **Dynamic CORS Adaptation**: Automatic handshake between Vercel and Render environments.
- **Timeout Resilience**: Strict 20s cap on external API calls to prevent backend hangs.
- **Anti-Sniffing Headers**: `nosniff` and `identity` encoding to ensure SSE compatibility with Brave/Shielded browsers.

---

## 📜 Disclaimer
*Curalink is a research tool and does not provide medical advice. All findings should be verified with licensed medical professionals.*
