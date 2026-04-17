from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ChatRequest(BaseModel):
    user_id: str
    disease: str
    query: str
    location: Optional[str] = ""

class ChatResponse(BaseModel):
    response: str
    papers: List[Dict[str, Any]]
    trials: List[Dict[str, Any]]
    intent: Optional[str] = ""
