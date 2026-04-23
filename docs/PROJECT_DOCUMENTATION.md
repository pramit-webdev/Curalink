# 🧬 Curalink AI: Project Documentation

## 1. Project Overview
Curalink is a high-performance, real-time medical reasoning platform. It bridges the gap between massive medical datasets (PubMed, OpenAlex, ClinicalTrials.gov) and actionable clinical insights using advanced LLM synthesis (Meta's Llama via Groq Cloud).

### Core Mission
To provide source-backed, context-aware assistance for complex medical inquiries, moving beyond simple search to deep, systemic reasoning.

---

## 2. System Architecture

Curalink follows a modern full-stack architecture optimized for high-latency AI workloads and real-time streaming.

### 2.1 Backend Architecture (FastAPI)
The backend is built with **FastAPI** (Python) and focuses on orchestration, research retrieval, and streaming.

- **Research Coordinator**: Orchestrates parallel fetching from multiple APIs (PubMed, OpenAlex, ClinicalTrials.gov) using `asyncio.gather`.
- **LLM Service**: Manages interaction with Groq Cloud. Implements query expansion (to improve search accuracy) and research synthesis.
- **SSE Pulse Architecture**: 
    - Uses **Server-Sent Events (SSE)** for real-time word-by-word streaming.
    - Implements an **8KB Heartbeat Padded Flush** to bypass cloud proxy (Nginx/Render) buffering, ensuring immediate UI feedback.
    - Sets `X-Accel-Buffering: no` and `Content-Encoding: identity` for maximum streaming compatibility.

### 2.2 Frontend Architecture (React + Vite)
The frontend is a responsive Single Page Application (SPA) built with **React** and **Vite**.

- **State Management**: Uses React hooks for managing chat sessions, research results, and UI state.
- **SSE Integration**: Implements a custom EventSource-like handler using `fetch` and `ReadableStream` to process the backend's SSE chunks.
- **Rich UI**: Uses **Lucide-React** for iconography and **Markdown-to-JSX** for rendering AI-generated research briefs with citations.

### 2.3 Data Persistence (MongoDB Atlas)
- **Multi-Session History**: Stores research threads as discrete sessions.
- **Motor (Async Driver)**: Used by the backend for non-blocking database operations.
- **Schema**:
    - `user_id`: String (unique identifier)
    - `session_id`: String (unique thread identifier)
    - `message`: User query
    - `response`: LLM-generated synthesis
    - `results`: Full research data (papers, trials) saved for future reference.

---

## 3. The Reasoning Pipeline

The "Global Research Pulse" is Curalink's primary innovation, following a "Map-Reduce" style flow:

1.  **Intelligent Query Expansion**: The user's natural language is transformed into precise search terms (e.g., "DBS" -> "Deep Brain Stimulation").
2.  **Parallel Fetch (The Map Phase)**: Fetches up to 100 results from PubMed, OpenAlex, and ClinicalTrials.gov simultaneously with a 20s timeout.
3.  **Tiered Data Processing**:
    *   **Consensus Pool (n=50)**: The titles/snippets of the top 50 results are sent to the LLM to identify field-wide trends.
    *   **Precision Pool (n=8)**: Detailed abstracts of the top 8 results are used for specific, linkable citations.
4.  **Streaming Synthesis (The Reduce Phase)**: The LLM generates a structured brief starting with the "Global Research Pulse," followed by detailed findings.

---

## 4. API Reference

### `POST /chat/stream`
The primary endpoint for real-time research.
- **Payload**: `ChatRequest` (user_id, session_id, disease, query, location)
- **Response**: `text/event-stream` yielding JSON chunks:
    - `{"type": "status", "text": "..."}`: Progress updates.
    - `{"type": "metadata", "papers": [], "trials": []}`: The raw research results.
    - `{"type": "chunk", "text": "..."}`: LLM-generated text fragments.
    - `{"type": "done"}`: End of stream.

### `GET /sessions/{user_id}`
Returns a list of all research sessions for a specific user.

### `GET /session/{session_id}`
Returns the full conversation history and research data for a specific session.

---

## 5. Deployment & Configuration

### Environment Variables
**Backend (.env)**:
- `GROQ_API_KEY`: Required for LLM reasoning.
- `MONGODB_URI`: Connection string for MongoDB Atlas.
- `HUGGINGFACE_TOKEN`: Used for secondary research services.
- `PORT`: Default is 10000.

**Frontend (.env)**:
- `VITE_API_URL`: Base URL of the deployed backend.

### Deployment Platforms
- **Frontend**: Vercel (Optimized for SPA).
- **Backend**: Render (Configured for high-performance FastAPI/Uvicorn).

---

## 6. Security & Hardening
- **Dynamic CORS Adaptation**: Automatically mirrors Vercel/localhost origins to allow secure credentialed requests.
- **Timeout Resilience**: Strict 20s cap on external API calls ensures the backend remains responsive.
- **Anti-Sniffing**: `nosniff` headers and identity encoding ensure SSE compatibility with Brave and other security-focused browsers.

---

## 7. Disclaimer
Curalink is a research-oriented tool. It is designed to assist in medical literature discovery and does not provide medical advice or diagnosis. All findings should be reviewed by a licensed professional.
