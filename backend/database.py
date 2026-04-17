import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Dict, Any
from datetime import datetime

class Database:
    def __init__(self):
        self.uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.db_name = os.getenv("DATABASE_NAME", "curalink")
        self.client = None
        self.db = None

    async def connect(self):
        # We ensure the URI is properly escaped for special characters in passwords
        # Pymongo/Motor requires special characters like @ or : to be quote_plus encoded
        # Using the URI directly from os.getenv
        self.client = AsyncIOMotorClient(self.uri)
        self.db = self.client[self.db_name]

    async def save_chat(self, user_id: str, session_id: str, message: str, response: str, results: Dict[str, Any]):
        """Saves a chat turn to MongoDB with session grouping."""
        chat_turn = {
            "user_id": user_id,
            "session_id": session_id,
            "message": message,
            "response": response,
            "results": results,
            "timestamp": datetime.utcnow()
        }
        await self.db.chats.insert_one(chat_turn)

    async def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """Retrieves unique session IDs and their first messages as titles."""
        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$sort": {"timestamp": 1}}, # Oldest first to get the first message
            {"$group": {
                "_id": "$session_id",
                "title": {"$first": "$message"},
                "timestamp": {"$first": "$timestamp"}
            }},
            {"$sort": {"timestamp": -1}} # Newest sessions at the top
        ]
        cursor = self.db.chats.aggregate(pipeline)
        return await cursor.to_list(length=20)

    async def get_session_history(self, session_id: str) -> List[Dict[str, Any]]:
        """Retrieves all turns for a specific session."""
        cursor = self.db.chats.find({"session_id": session_id}).sort("timestamp", 1)
        return await cursor.to_list(length=100)

    async def close(self):
        if self.client:
            self.client.close()

db = Database()
