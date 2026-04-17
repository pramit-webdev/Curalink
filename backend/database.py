import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Dict, Any
from datetime import datetime

import logging

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("curalink.db")

class Database:
    def __init__(self):
        self.uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.db_name = os.getenv("DATABASE_NAME", "curalink")
        self.client = None
        self.db = None
        
        # Immediate warning if we are in production but URI is localhost
        if "localhost" in self.uri and os.getenv("RENDER") == "true":
             logger.warning("💩 MONGODB_URI is still set to localhost on Render! Did you forget to set the Env Var?")

    async def connect(self):
        """Initializes connection to MongoDB Atlas."""
        try:
            # Mask URI for logging
            masked_uri = self.uri.split("@")[-1] if "@" in self.uri else "localhost"
            logger.info(f"Connecting to MongoDB Cluster: ...@{masked_uri} (DB: {self.db_name})")
            
            self.client = AsyncIOMotorClient(self.uri, serverSelectionTimeoutMS=5000)
            self.db = self.client[self.db_name]
            
            # Simple ping to verify connection
            await self.client.admin.command('ping')
            logger.info("✅ Database connected successfully.")
        except Exception as e:
            logger.error(f"❌ MongoDB Connection Failed: {e}")
            logger.error("👉 TROUBLESHOOTING: Ensure you have whitelisted [0.0.0.0/0] in the 'Network Access' tab of MongoDB Atlas.")

    async def save_chat(self, user_id: str, session_id: str, message: str, response: str, results: Dict[str, Any]):
        """Saves a chat turn to MongoDB with session grouping."""
        try:
            chat_turn = {
                "user_id": user_id,
                "session_id": session_id,
                "message": message,
                "response": response,
                "results": results,
                "timestamp": datetime.utcnow()
            }
            res = await self.db.chats.insert_one(chat_turn)
            logger.info(f"Saved chat turn: {res.inserted_id}")
        except Exception as e:
            logger.error(f"Failed to save chat to DB: {e}")

    async def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """Retrieves unique session IDs, handling legacy chats without session_ids."""
        try:
            pipeline = [
                {"$match": {"user_id": user_id}},
                {"$project": {
                    "user_id": 1,
                    "message": 1,
                    "timestamp": 1,
                    "session_id": {"$ifNull": ["$session_id", "legacy_session"]}
                }},
                {"$sort": {"timestamp": 1}}, 
                {"$group": {
                    "_id": "$session_id",
                    "title": {"$first": "$message"},
                    "timestamp": {"$first": "$timestamp"}
                }},
                {"$sort": {"timestamp": -1}}
            ]
            cursor = self.db.chats.aggregate(pipeline)
            sessions = await cursor.to_list(length=50)
            
            # Clean for JSON (keep _id key for React compatibility)
            for s in sessions:
                s["_id"] = str(s["_id"])
                if s.get("timestamp"): s["timestamp"] = s["timestamp"].isoformat()
            return sessions
        except Exception as e:
            logger.error(f"Error fetching sessions: {e}")
            return []

    async def get_session_history(self, user_id: str, session_id: str) -> List[Dict[str, Any]]:
        """Retrieves all turns for a specific session, handling legacy orphans."""
        try:
            if session_id == "legacy_session":
                query = {"user_id": user_id, "session_id": {"$exists": False}}
            else:
                query = {"session_id": session_id}
                
            cursor = self.db.chats.find(query).sort("timestamp", 1)
            history = await cursor.to_list(length=100)
            
            # Clean for JSON (keep _id key for React compatibility)
            for h in history:
                h["_id"] = str(h["_id"])
                if h.get("timestamp"): h["timestamp"] = h["timestamp"].isoformat()
            return history
        except Exception as e:
            logger.error(f"Error fetching history: {e}")
            return []

    async def close(self):
        if self.client:
            self.client.close()

db = Database()
