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

    async def expand_query(self, disease: str, query: str, location: str = "") -> Dict[str, str]:
        """Expands user input into optimized search terms for scientific APIs."""
        prompt = f"""
        You are a medical research assistant. Expand the following user query into optimized search terms for PubMed and ClinicalTrials.gov.
        
        User Disease: {disease}
        User Query: {query}
        User Location: {location}
        
        Return exactly a JSON object with:
        - "pubmed_query": Optimized boolean string for PubMed (e.g., "(term1 AND term2) OR term3")
        - "clinical_query": Short keyword string for ClinicalTrials.gov
        - "intent": Brief summary of what the user is looking for.
        """
        
        try:
            response = self.client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                response_format={"type": "json"}
            )
            content = response.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            logger.error(f"LLM Expansion Error: {e}")
            return {
                "pubmed_query": f"{disease} {query}",
                "clinical_query": f"{disease} {query}",
                "intent": f"Search for {disease} and {query}"
            }

    async def synthesize_research(self, user_context: Dict[str, Any], results: List[Dict[str, Any]]) -> str:
        """Combines research results into a structured, personalized medical response."""
        
        context_str = json.dumps(user_context)
        results_str = json.dumps(results[:15]) # Send top 15 to stay within context limits
        
        prompt = f"""
        You are Curalink, a health research companion. Synthesize the following research data for the user.
        
        USER CONTEXT:
        {context_str}
        
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
