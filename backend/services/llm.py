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

    async def _groq_call(self, messages: List[Dict[str, str]], temperature: float = 0.3, max_tokens: int = 1500, json_format: bool = False):
        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not set.")
        
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if json_format:
                payload["response_format"] = {"type": "json_object"}
            
            resp = await client.post(self.url, headers=headers, json=payload, timeout=20.0)
            
            if resp.status_code != 200:
                # SELF-HEALING: If model is decommissioned (400/404), fallback to stable Llama 3.3
                if resp.status_code in [400, 404] and payload["model"] != "llama-3.3-70b-versatile":
                    logger.warning(f"Model {payload['model']} unreachable. Falling back to Llama 3.3.")
                    payload["model"] = "llama-3.3-70b-versatile"
                    resp = await client.post(self.url, headers=headers, json=payload, timeout=20.0)
                    if resp.status_code == 200:
                        return resp.json()["choices"][0]["message"]["content"]
                
                error_body = resp.text
                raise Exception(f"Groq API Error {resp.status_code}: {error_body}")
                
            return resp.json()["choices"][0]["message"]["content"]

    async def expand_query(self, raw_input: str) -> Dict[str, str]:
        """Extracts medical context using raw API call to Groq."""
        prompt = f"""
        Analyze this medical research request: "{raw_input}"
        Extract the following and return ONLY a JSON object:
        - disease: The main medical condition (or "general health")
        - pubmed_query: An optimized search string for academic papers
        - clinical_query: An optimized search string for clinical trials
        - location: Mentioned geographic location or empty string
        - intent: Brief description of what the user is looking for
        
        JSON ONLY. No preamble.
        """
        
        try:
            content = await self._groq_call([{"role": "user", "content": prompt}], temperature=0.1, json_format=True)
            return json.loads(content)
        except Exception as e:
            logger.error(f"Groq Expansion Error: {e}")
            return {
                "disease": "medical condition",
                "pubmed_query": raw_input,
                "clinical_query": raw_input,
                "location": "",
                "intent": f"Search for: {raw_input}"
            }

    async def synthesize_research(self, user_context: Dict[str, Any], results: List[Dict[str, Any]], history: List[Dict[str, Any]] = []) -> str:
        """Synthesizes research results using raw API call to Groq."""
        context_str = json.dumps(user_context)
        # Limit results strictly to prevent payload bloat
        results_str = json.dumps(results[:10])
        
        history_str = "\n".join([f"{'User' if h.get('message') else 'Assistant'}: {h.get('message') or h.get('response')}" for h in history[-3:]])

        prompt = f"""
        You are Curalink, a premier medical research assistant. 
        Synthesize these results for a user interested in: {user_context.get('disease')}
        
        User Context: {context_str}
        Conversation History:
        {history_str}
        
        Research Data:
        {results_str}
        
        ---
        RULES:
        1. Be precise, clinical yet accessible.
        2. Use MARKDOWN. 
        3. ALWAYS cite sources in [Source Name] format.
        4. Organize as: [Executive Summary], [Key Findings/Trials], [Research Direction].
        """
        
        try:
            return await self._groq_call([{"role": "user", "content": prompt}], max_tokens=2000)
        except Exception as e:
            logger.error(f"Groq Synthesis Error: {e}")
            return f"### Analysis Unavailable\nI encountered an error synthesizing your research results: {str(e)}\n\n**Common Causes:**\n1. Invalid GROQ_API_KEY in Render settings.\n2. Service rate-limiting."
