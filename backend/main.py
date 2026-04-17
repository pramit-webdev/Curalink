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
    allow_credentials=False,
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
        # 1. Context & History Loading
        history = []
        try:
            history = await db.get_history(chat_req.user_id, limit=5)
        except Exception as db_err:
            logger.warning(f"History retrieval failed (skipping): {db_err}")
        raw_msg = chat_req.query if chat_req.query else f"{chat_req.disease}: {chat_req.query}"
        
        # 2. Query Expansion (Incorporate History for Context)
        expansion = await llm_service.expand_query(raw_msg, history)
        disease = expansion.get("disease", chat_req.disease or "unknown condition")
        location = expansion.get("location", chat_req.location or "")
        
        # 3. Research Retrieval
        research_data = await research_coordinator.get_comprehensive_research(
            disease=disease,
            pubmed_query=expansion.get("pubmed_query", raw_msg),
            clinical_query=expansion.get("clinical_query", raw_msg),
            location=location
        )
        
        # 4. Result Synthesis
        all_results = research_data["papers"] + research_data["trials"]
        
        final_answer = await llm_service.synthesize_research(
            user_context={
                "disease": disease,
                "location": location,
                "intent": expansion.get("intent", ""),
                "original_query": raw_msg
            },
            results=all_results,
            history=history
        )
        
        # 5. Persistence
        try:
            await db.save_chat(
                user_id=chat_req.user_id,
                message=raw_msg,
                response=final_answer,
                results=research_data
            )
        except Exception as save_err:
             logger.warning(f"Failed to save chat history: {save_err}")
        
        return ChatResponse(
            response=final_answer,
            papers=research_data["papers"],
            trials=research_data["trials"],
            intent=expansion.get("intent", "")
        )
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Chat endpoint error: {error_details}")
        raise HTTPException(status_code=500, detail=f"Backend Error: {str(e)}\n\nTraceback:\n{error_details}")

@app.get("/history/{user_id}")
async def get_history(user_id: str):
    return await db.get_history(user_id)

@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "database": "connected" if db.db is not None else "disconnected",
        "llm_token": "set" if os.getenv("HUGGINGFACE_TOKEN") else "missing"
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
