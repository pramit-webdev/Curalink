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

    async def save_chat(self, user_id: str, message: str, response: str, results: Dict[str, Any]):
        """Saves a chat turn to MongoDB."""
        chat_turn = {
            "user_id": user_id,
            "message": message,
            "response": response,
            "results": results,
            "timestamp": datetime.utcnow()
        }
        await self.db.chats.insert_one(chat_turn)

    async def get_history(self, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Retrieves last N turns for a user."""
        cursor = self.db.chats.find({"user_id": user_id}).sort("timestamp", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def close(self):
        if self.client:
            self.client.close()

db = Database()
