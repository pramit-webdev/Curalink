from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from dotenv import load_dotenv
from typing import List, Dict, Any

from services.research import ResearchCoordinator
from services.llm import LLMService
from database import db
from models import ChatRequest, ChatResponse

load_dotenv()

app = FastAPI(title="Curalink AI API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Services
research_coordinator = ResearchCoordinator()
llm_service = LLMService()

@app.on_event("startup")
async def startup():
    await db.connect()

@app.on_event("shutdown")
async def shutdown():
    await db.close()

@app.get("/")
async def root():
    return {"message": "Curalink AI Medical Research Assistant API is running"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        # 1. Context Loading (Optional: Load last turn for multi-turn)
        # For now, we expand query based on current input
        
        # 2. Query Expansion
        expansion = await llm_service.expand_query(
            disease=request.disease,
            query=request.query,
            location=request.location
        )
        
        # 3. Research Retrieval (Depth + Ranking)
        research_data = await research_coordinator.get_comprehensive_research(
            disease=request.disease,
            expanded_query=expansion
        )
        
        # 4. Result Synthesis (Reasoning)
        user_context = {
            "disease": request.disease,
            "query": request.query,
            "location": request.location,
            "intent": expansion.get("intent")
        }
        
        # Merge papers and trials for synthesis
        all_results = research_data["papers"] + research_data["trials"]
        
        final_answer = await llm_service.synthesize_research(
            user_context=user_context,
            results=all_results
        )
        
        # 5. Persistence
        await db.save_chat(
            user_id=request.user_id,
            message=f"{request.disease}: {request.query}",
            response=final_answer,
            results=research_data
        )
        
        return ChatResponse(
            response=final_answer,
            papers=research_data["papers"],
            trials=research_data["trials"],
            intent=expansion.get("intent", "")
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{user_id}")
async def get_history(user_id: str):
    return await db.get_history(user_id)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
