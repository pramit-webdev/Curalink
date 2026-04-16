import os
from huggingface_hub import InferenceClient
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.token = os.getenv("HUGGINGFACE_TOKEN")
        self.model = "meta-llama/Meta-Llama-3.1-8B-Instruct"
        self.client = InferenceClient(model=self.model, token=self.token)

    async def expand_query(self, raw_input: str) -> Dict[str, str]:
        """Extracts and expands medical context from a single natural language input."""
        prompt = f"""
        You are a medical research assistant. Extract the medical context from the user's query and expand it into optimized search terms for PubMed and ClinicalTrials.gov.
        
        USER INPUT: "{raw_input}"
        
        Extract:
        1. Primary Disease/Condition.
        2. Specific Research Intent/Query.
        3. Mentioned Location (if any).
        
        Return exactly a JSON object with:
        - "disease": The extracted primary condition.
        - "pubmed_query": Optimized boolean string for PubMed.
        - "clinical_query": Short keyword string for ClinicalTrials.gov.
        - "location": Extracted location or empty string.
        - "intent": Brief summary of the specific search path.
        """
        
        try:
            response = self.client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300
            )
            content = response.choices[0].message.content
            
            # Robust extraction of JSON (handles common markdown edge cases)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            return json.loads(content)
        except Exception as e:
            logger.error(f"LLM Expansion Error: {e}")
            # Intelligent Fallback if LLM fails
            return {
                "disease": "medical condition",
                "pubmed_query": raw_input,
                "clinical_query": raw_input,
                "location": "",
                "intent": f"Search for: {raw_input}"
            }

    async def synthesize_research(self, user_context: Dict[str, Any], results: List[Dict[str, Any]], history: List[Dict[str, Any]] = []) -> str:
        """Combines research results and history into a structured, personalized medical response."""
        
        context_str = json.dumps(user_context)
        results_str = json.dumps(results[:15]) # Send top 15 to stay within context limits
        
        # Format history for the prompt
        history_str = "\n".join([f"{'User' if h.get('message') else 'Assistant'}: {h.get('message') or h.get('response')}" for h in history[-3:]])
        
        prompt = f"""
        You are Curalink, a health research companion. Synthesize the following research data for the user.
        
        USER CONTEXT:
        {context_str}

        CONVERSATION HISTORY:
        {history_str}
        
        RESEARCH RESULTS:
        {results_str}
        
        EXPECTED OUTPUT STRUCTURE:
        1. Condition Overview: Brief summary of the current research landscape for this disease.
        2. Research Insights: Deep, personalized insights based on the provided papers.
        3. Clinical Trials: Key ongoing trials that match the user's intent and location.
        4. Summary & Next Steps: Personalized advice for discussing this with a doctor.
        
        RULES:
        - Use ONLY the provided sources. Do not hallucinate.
        - Cite sources using [Source Name, Year] (e.g. [PubMed, 2024]).
        - Be empathetic but scientific.
        - Be structured and easy to read (use markdown).
        """
        
        try:
            response = self.client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1500
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM Synthesis Error: {e}")
            return "I'm sorry, I was unable to process the research results at this time. Please try again or check the source links directly."
