import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from services.research import ResearchCoordinator
from services.llm import LLMService
from database import db
from models import ChatRequest, ChatResponse

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("curalink")

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    logger.info("Initializing Curalink Services...")
    try:
        # Check for required tokens
        if not os.getenv("HUGGINGFACE_TOKEN"):
            logger.warning("HUGGINGFACE_TOKEN is missing! AI reasoning will fail.")
            
        await db.connect()
        logger.info("Database connected successfully.")
        
        # We attach services to app state to ensure they share the same event loop
        app.state.research_coordinator = ResearchCoordinator()
        app.state.llm_service = LLMService()
        
        yield
    except Exception as e:
        logger.error(f"Startup failed: {str(e)}")
        raise e
    finally:
        # Shutdown logic
        await db.close()
        logger.info("Database connection closed.")

app = FastAPI(title="Curalink AI API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Curalink AI Medical Research Assistant API is running"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, chat_req: ChatRequest):
    research_coordinator = request.app.state.research_coordinator
    llm_service = request.app.state.llm_service
    
    try:
        # 1. Context Loading (Optional: Load last turn for multi-turn)
        
        # 2. Query Expansion
        expansion = await llm_service.expand_query(
            disease=chat_req.disease,
            query=chat_req.query,
            location=chat_req.location
        )
        
        # 3. Research Retrieval (Depth + Ranking)
        research_data = await research_coordinator.get_comprehensive_research(
            disease=chat_req.disease,
            expanded_query=expansion
        )
        
        # 4. Result Synthesis (Reasoning)
        user_context = {
            "disease": chat_req.disease,
            "query": chat_req.query,
            "location": chat_req.location,
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
            user_id=chat_req.user_id,
            message=f"{chat_req.disease}: {chat_req.query}",
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
        logger.error(f"Chat endpoint error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{user_id}")
async def get_history(user_id: str):
    return await db.get_history(user_id)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
