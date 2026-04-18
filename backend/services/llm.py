import os
import httpx
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.model = "meta-llama/llama-4-scout-17b-16e-instruct"
        self.url = "https://api.groq.com/openai/v1/chat/completions"

    async def _groq_call(self, messages: List[Dict[str, str]], temperature: float = 0.3, max_tokens: int = 1500, json_format: bool = False, stream: bool = False):
        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not set.")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream
        }
        if json_format:
            payload["response_format"] = {"type": "json_object"}
        
        async with httpx.AsyncClient() as client:
            if not stream:
                resp = await client.post(self.url, headers=headers, json=payload, timeout=25.0)
                if resp.status_code != 200:
                    # SELF-HEALING: If model is decommissioned (400/404), fallback to stable Llama 3.3
                    if resp.status_code in [400, 404] and payload["model"] != "llama-3.3-70b-versatile":
                        logger.warning(f"Model {payload['model']} unreachable. Falling back to Llama 3.3.")
                        payload["model"] = "llama-3.3-70b-versatile"
                        resp = await client.post(self.url, headers=headers, json=payload, timeout=25.0)
                        if resp.status_code == 200:
                            return resp.json()["choices"][0]["message"]["content"]
                    
                    error_body = resp.text
                    raise Exception(f"Groq API Error {resp.status_code}: {error_body}")
                return resp.json()["choices"][0]["message"]["content"]
            else:
                # Streaming logic is handled by specific methods below for better encapsulation
                raise NotImplementedError("Use stream_synthesis for streaming calls.")

    async def stream_synthesis(self, user_context: Dict[str, Any], results: List[Dict[str, Any]], consensus_pool: Dict[str, Any] = None, history: List[Dict[str, Any]] = []):
        """Generator that streams the research synthesis chunk by chunk with Trend Analysis."""
        context_str = json.dumps(user_context)
        results_str = json.dumps(results[:10])
        consensus_str = json.dumps(consensus_pool) if consensus_pool else ""
        history_str = "\n".join([f"{'User' if h.get('message') else 'Assistant'}: {h.get('message') or h.get('response')}" for h in history[-3:]])

        prompt = f"""
        You are Curalink, a premier medical research assistant focused on PRECISE and DEEP evidence. 
        
        STEP 1: Global Research Scan
        Review this pool of 50+ research titles/snippets to identify the overall field consensus, trends, or major disagreements:
        ---
        CONSENSUS POOL: {consensus_str}
        ---
        
        STEP 2: Detailed Synthesis
        Now, provide a highly structured research brief for: {user_context.get('disease')}
        Use these specific cited results for supporting evidence:
        ---
        CITED RESULTS: {results_str}
        ---

        Context & History: {context_str} | {history_str}
        
        ---
        RULES:
        1. START with a "Global Research Pulse" section summarizing the consensus found in the 50+ items.
        2. Then organize into Findings and Research Direction using the CITED RESULTS.
        3. Be precise, clinical yet accessible.
        4. Use MARKDOWN and always cite sources in [Source Name] format.
        """
        
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 2048,
            "stream": True
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            async with client.stream("POST", self.url, headers=headers, json=payload, timeout=40.0) as resp:
                if resp.status_code != 200:
                    yield f"Error: Groq returned {resp.status_code}"
                    return

                async for line in resp.aiter_lines():
                    if not line or line.strip() == "": continue
                    if line.strip() == "data: [DONE]": break
                    
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            chunk = data["choices"][0].get("delta", {}).get("content", "")
                            if chunk:
                                yield chunk
                        except Exception:
                            continue

    async def expand_query(self, raw_input: str, history: List[Dict[str, Any]] = []) -> Dict[str, str]:
        # ... (rest of the file as is)
        history_str = "\n".join([f"{'User' if h.get('message') else 'Assistant'}: {h.get('message') or h.get('response')}" for h in history[-2:]])
        prompt = f"Analyze: {raw_input}\nHistory: {history_str}\nReturn JSON with disease, pubmed_query, clinical_query, location, intent."
        
        try:
            content = await self._groq_call([{"role": "user", "content": prompt}], json_format=True)
            return json.loads(content)
        except:
            return {"disease": "condition", "pubmed_query": raw_input, "clinical_query": raw_input, "location": "", "intent": "search"}

    async def synthesize_research(self, user_context: Dict[str, Any], results: List[Dict[str, Any]], consensus_pool: Dict[str, Any] = None, history: List[Dict[str, Any]] = []) -> str:
        # Static synthesis for history loading/background tasks
        full_text = ""
        async for chunk in self.stream_synthesis(user_context, results, consensus_pool, history):
            full_text += chunk
        return full_text
