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
            
        try:
            await db.connect()
            logger.info("Database connected successfully.")
        except Exception as db_err:
            logger.error(f"⚠️ Database connection failed: {db_err}")
            logger.warning("Continuing startup in 'Maintenance' mode to allow port binding.")
        
        # We attach services to app state to ensure they share the same event loop
        app.state.research_coordinator = ResearchCoordinator()
        app.state.llm_service = LLMService()
        
        yield
    except Exception as e:
        logger.error(f"Startup crash: {str(e)}")
        raise e
    finally:
        # Shutdown logic
        await db.close()
        logger.info("Database connection closed.")

app = FastAPI(title="Curalink AI API", lifespan=lifespan)

# Advanced Dynamic CORS Middleware
@app.middleware("http")
async def dynamic_cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    
    # Handle preflight OPTIONS requests
    if request.method == "OPTIONS":
        from fastapi.responses import Response
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
        return response
        # Successful response path
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Curalink Reasoning Engine",
        "database": "connected" if db.db is not None else "disconnected"
    }

@app.get("/debug/db")
async def debug_db():
    """Manual trigger to test MongoDB connectivity."""
    try:
        # Simple operation to verify live connection
        count = await db.db.chats.count_documents({})
        return {
            "status": "success", 
            "chats_count": count, 
            "db_name": db.db_name,
            "connected": True
        }
    except Exception as e:
        return {"status": "error", "detail": str(e), "connected": False}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    from fastapi.responses import JSONResponse
    import traceback
    error_details = traceback.format_exc()
    logger.error(f"Global Error Catch: {error_details}")
    
    origin = request.headers.get("origin", "*")
    content = {"status": "error", "detail": str(exc), "type": type(exc).__name__}
    
    return JSONResponse(
        status_code=500,
        content=content,
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true"
        }
    )

@app.post("/chat/stream")
async def chat_stream_endpoint(request: Request, chat_req: ChatRequest):
    research_coordinator = request.app.state.research_coordinator
    llm_service = request.app.state.llm_service
    
    async def event_generator():
        try:
            # 0. Immediate Connection Confirmation
            padding = " " * 2048
            yield f": heartbeat {padding}\n\n" 
            yield json.dumps({"type": "status", "text": "🚀 Connection established. Starting research..."}) + "\n"
            
            # 1. Expansion
            yield json.dumps({"type": "status", "text": "🧠 Expanding query using medical context..."}) + "\n"
            history = await db.get_session_history(chat_req.user_id, chat_req.session_id)
            expansion = await llm_service.expand_query(chat_req.query, history)
            
            # 2. PubMed / ClinicalTrials
            yield json.dumps({"type": "status", "text": f"🔎 Searching PubMed for '{expansion.get('disease', 'condition')}'..."}) + "\n"
            disease = expansion.get("disease", chat_req.disease or "unknown condition")
            location = expansion.get("location", chat_req.location or "")
            
            research_data = await research_coordinator.get_comprehensive_research(
                disease=disease,
                pubmed_query=expansion.get("pubmed_query", chat_req.query),
                clinical_query=expansion.get("clinical_query", chat_req.query),
                location=location
            )
            
            # 3. Process Findings
            yield json.dumps({"type": "status", "text": f"📊 Found {len(research_data['papers'])} papers and {len(research_data['trials'])} trials. Organizing..."}) + "\n"
            yield json.dumps({
                "type": "metadata",
                "intent": expansion.get("intent", ""),
                "papers": research_data["papers"],
                "trials": research_data["trials"]
            }) + "\n"

            # 4. Streamed Synthesis
            yield json.dumps({"type": "status", "text": "✍️ Synthesizing your medical research brief..."}) + "\n"
            all_results = research_data["papers"] + research_data["trials"]
            full_response = ""
            
            async for chunk in llm_service.stream_synthesis(
                user_context={
                    "disease": disease,
                    "location": location,
                    "intent": expansion.get("intent", ""),
                    "original_query": chat_req.query
                },
                results=all_results,
                history=history
            ):
                full_response += chunk
                yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

            # 5. Persistence
            yield json.dumps({"type": "status", "text": "💾 Saving research session..."}) + "\n"
            await db.save_chat(
                user_id=chat_req.user_id,
                session_id=chat_req.session_id,
                message=chat_req.query,
                response=full_response,
                results=research_data
            )
            yield json.dumps({"type": "done"}) + "\n"

        except Exception as e:
            import traceback
            logger.error(f"Streaming error: {traceback.format_exc()}")
            yield json.dumps({"type": "error", "detail": str(e)}) + "\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        }
    )

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, chat_req: ChatRequest):
    try:
        research_coordinator = request.app.state.research_coordinator
        llm_service = request.app.state.llm_service
        
        # 1. Fetch Session-Specific History
        history = []
        try:
            history = await db.get_session_history(chat_req.user_id, chat_req.session_id)
        except Exception as db_err:
            logger.warning(f"Session history retrieval failed: {db_err}")
            
        raw_msg = chat_req.query
        
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
        
        # 5. Persistence (Save to specific Session)
        try:
            await db.save_chat(
                user_id=chat_req.user_id,
                session_id=chat_req.session_id,
                message=raw_msg,
                response=final_answer,
                results=research_data
            )
        except Exception as save_err:
             logger.warning(f"Failed to save chat turn: {save_err}")
        
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

@app.get("/sessions/{user_id}")
async def get_user_sessions(user_id: str):
    """Returns list of past research threads for this user."""
    return await db.get_user_sessions(user_id)

@app.get("/session/{session_id}")
async def get_session_history(session_id: str, user_id: str):
    """Returns all messages for a specific research thread."""
    return await db.get_session_history(user_id, session_id)

@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "database": "connected" if db.db is not None else "disconnected",
        "llm_token": "set" if os.getenv("HUGGINGFACE_TOKEN") else "missing"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 10000))
    # Note: reload=True is disabled for production stability
    uvicorn.run("main:app", host="0.0.0.0", port=port)
