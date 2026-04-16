import os
from groq import Groq
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.model = "llama3-70b-8192"
        self.client = Groq(api_key=self.api_key)

    async def expand_query(self, raw_input: str) -> Dict[str, str]:
        """Extracts medical context and generates optimized search queries using Groq."""
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
            response = self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content
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
        """Synthesizes research results into a structured response using Groq."""
        context_str = json.dumps(user_context)
        results_str = json.dumps(results[:15])
        
        history_str = "\n".join([f"{'User' if h.get('message') else 'Assistant'}: {h.get('message') or h.get('response')}" for h in history[-3:]])

        prompt = f"""
        You are Curalink, a medical research assistant. 
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
        5. If history is provided, address it to maintain context.
        """
        
        try:
            response = self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                temperature=0.3,
                max_tokens=2000
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Groq Synthesis Error: {e}")
            return "I'm sorry, I was unable to process the research results at this time. Please try again or check the source links directly."
