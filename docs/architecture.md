# Technical Architecture: The Curalink Reasoning Pipeline

Curalink is designed to solve the **"Stall & Hallucinate"** problem common in RAG (Retrieval-Augmented Generation) applications. This document outlines the technical trade-offs and architectural decisions made to ensure speed and accuracy.

---

## 1. High-Performance Streaming: The SSE Pulse
Standard REST APIs require a full request-response cycle, which is fatal for medical LLMs that may take 30+ seconds to synthesize data. 

### The Challenge
Cloud proxies (Render, Nginx, Vercel) often use **Aggressive Buffering**, holding small data packets until a buffer threshold (usually 4KB or 8KB) is met. This makes the UI feel "frozen."

### The Solution: 8KB Nuclear Flush
Curalink uses **Server-Sent Events (SSE)** with a custom **Header Payer**:
- **Padded Heartbeat**: Every stream begins with an **8192-byte** silent comment. This "kicks" the proxy into flushing the buffer immediately.
- **Constant Status Yields**: Instead of waiting for the LLM to start, the backend yields real-time state updates (`Searching PubMed...`, `Found 50 papers...`), providing a 0.5s Perceived Initial Latency (PIL).

---

## 2. Research Orchestration: Depth vs Precision
Medical research requires broad coverage followed by expert refinement.

### Step 1: Query Expansion
We use a **Reasoning LLM (Llama 3/4)** to decompose user input. For example, "DBS" is expanded into `("Deep Brain Stimulation" AND "Parkinson's")`.

### Step 2: The Parallel Fetch
We use `asyncio.gather` with a **20-second strict timeout** to fetch data from:
- **PubMed**: Clinical and academic excellence.
- **OpenAlex**: Global research publications.
- **ClinicalTrials.gov**: The bridge to future treatments.

### Step 3: Heuristic Re-ranking
Results are scored based on **Recency** (Weight: 2.0x for 2024+) and **Source Credibility** (Weight: 1.5x for PubMed).

---

## 3. Summarization Depth (Map-Reduce Thinking)
To fulfill the need for "Global Consensus," we implement a two-tier data flow:
1. **Consensus Pool (n=50)**: The LLM scans the titles and snippets of the top 50 results to identify overall field trends.
2. **Citation Pool (n=8)**: The LLM performs full-abstract reasoning on the top 8 results for the final cited summary.

---

## 4. State & Persistence
- **MongoDB Atlas**: Stores sessions as discrete medical research threads.
- **Sanitization Layer**: Internal `ObjectId` formats are converted to standard JSON strings to prevent 500 errors in cross-domain frontend communication.
- **CORS Hardening**: Dynamically mirrors Vercel origins to ensure secure, credentialed sessions without manual IP whitelisting.

---

## 5. Security & Availability
- **Content-Encoding: identity**: Specifically added to prevent Nginx from trying to Gzip-buffer the SSE stream.
- **X-Content-Type-Options: nosniff**: Added for compatibility with Brave Browser's aggressive Shields.
