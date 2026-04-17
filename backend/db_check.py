import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def check():
    load_dotenv()
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("Error: MONGODB_URI not found")
        return
        
    client = AsyncIOMotorClient(uri)
    db = client[os.getenv("DATABASE_NAME", "curalink")]
    
    # Check count
    count = await db.chats.count_documents({})
    print(f"Total chats in DB: {count}")
    
    # Check a few samples to see user_id and session_id
    samples = await db.chats.find().sort("timestamp", -1).limit(10).to_list(length=10)
    for s in samples:
        print(f"User: {s.get('user_id')}, Session: {s.get('session_id')}, Msg: {s.get('message', '')[:30]}...")

if __name__ == "__main__":
    asyncio.run(check())
