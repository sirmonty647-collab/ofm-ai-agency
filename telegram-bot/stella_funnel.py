"""
Stella AI Lead Funnel — Telegram + Deepseek Auto-Reply Bot
===========================================================
Listens for incoming messages on your Telegram account,
responds as "Stella" using Deepseek AI, and funnels leads
to stellav.baby after a few messages.

Features:
- Human-like delays & typing indicator
- JSON-safe reply parsing (no raw JSON leaks)
- Slow mode handling with retry
- Conversation tracking & link funneling
- Supabase leads collection (unique users)
- Daily stats tracking (unique users + links sent)
- Telegram channel invite after link drop

Usage:
    python stella_funnel.py

First run will ask for your phone number + verification code.
After that it runs 24/7.
"""

import os
import json
import asyncio
import random
import re
from datetime import datetime, date
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient, events
from openai import OpenAI
import requests

# Load .env
load_dotenv()

API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")
PHONE = os.getenv("PHONE_NUMBER", "")

# Supabase
SUPABASE_URL = "https://wmiydawnybullqwnuqvq.supabase.co"
SUPABASE_KEY = "sb_publishable_9qzgTB6orAb-MSJO8s5qAg_2XLRxTOL"

# Session file (local) or string session (Railway)
SESSION_FILE = "stella_session"
# For Railway: set TELETHON_STRING_SESSION env var after first local run
STRING_SESSION = os.getenv("TELETHON_STRING_SESSION", "")

# Conversation tracking file
CONVO_FILE = "conversations.json"

# Local leads & stats files (always works, Supabase is bonus)
LEADS_FILE = "leads.json"
STATS_FILE = "stats.json"

# Landing page link
LANDING_PAGE = "https://stellav.baby"

# Telegram channel invite
CHANNEL_LINK = "https://t.me/+B7VJhX0sjb4xZWE1"

# Messages before dropping the link
LINK_AFTER_MSGS = 4

# ============================================
# LOCAL JSON HELPERS (always works)
# ============================================
def load_json(path):
    if Path(path).exists():
        with open(path) as f:
            return json.load(f)
    return {}

def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def track_lead(username, user_id):
    """Save a lead locally."""
    leads = load_json(LEADS_FILE)
    if str(user_id) not in leads:
        leads[str(user_id)] = {
            "username": username,
            "user_id": str(user_id),
            "timestamp": datetime.now().isoformat(),
            "message_count": 1,
            "link_sent": False
        }
        save_json(LEADS_FILE, leads)
        return True
    return False

def track_stats(is_new_user=False, link_sent=False):
    """Update daily stats locally."""
    today_str = date.today().isoformat()
    stats = load_json(STATS_FILE)
    if today_str not in stats:
        stats[today_str] = {"unique_users": 0, "links_sent": 0}
    if is_new_user:
        stats[today_str]["unique_users"] += 1
    if link_sent:
        stats[today_str]["links_sent"] += 1
    save_json(STATS_FILE, stats)

# ============================================
# SUPABASE HELPERS (bonus if tables exist)
# ============================================
def supabase_insert(table: str, data: dict):
    """Insert a row into Supabase."""
    try:
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            json=data
        )
        return res.ok or res.status_code == 201
    except Exception as e:
        return False

def supabase_upsert(table: str, data: dict, on_conflict: str):
    """Upsert a row into Supabase (insert or update on conflict)."""
    try:
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            json=data
        )
        return res.ok or res.status_code == 201
    except Exception as e:
        return False

def supabase_delete_all(table: str):
    """Delete all rows from a Supabase table."""
    try:
        res = requests.delete(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        return res.ok
    except Exception as e:
        return False

# ============================================
# CONVERSATION TRACKING
# ============================================
def load_conversations():
    """Load conversation state from disk."""
    if Path(CONVO_FILE).exists():
        with open(CONVO_FILE, "r") as f:
            return json.load(f)
    return {}

def save_conversations(convs):
    """Save conversation state to disk."""
    with open(CONVO_FILE, "w") as f:
        json.dump(convs, f, indent=2)

def get_conversation(user_id):
    """Get or create a conversation entry for a user."""
    convs = load_conversations()
    uid = str(user_id)
    if uid not in convs:
        convs[uid] = {
            "message_count": 0,
            "link_sent": False,
            "first_seen": datetime.now().isoformat(),
            "last_message": "",
            "username": "",
            "channel_invited": False
        }
    return convs, uid

# ============================================
# DEEPSEEK SYSTEM PROMPT
# ============================================
SYSTEM_PROMPT = """You are Stella — a flirty, fun girl chatting with guys on Telegram. You're not a bot, you're a real person. Keep messages short, casual, and flirty — like texting a guy you're interested in.

YOUR PERSONALITY:
- Flirty but not desperate
- Casual and playful
- Use emojis sometimes 😏💙
- Short messages (1-2 sentences max)
- Never sound like a salesperson or bot
- Be natural — vary your responses

THE CONVERSATION FLOW (follow this naturally based on how many messages you've exchanged):

Messages 1-2: Casual intro, playful
- "hey whats up u from the site x?"
- "you seem fun what are you into?"
- "hey you 😏"
- "whats good"

Messages 3-4: Build interest, get flirty
- "you wanna have fun together"
- "mm I like the sound of that"
- "oh u wanna see me cum heheh"
- "you're making me blush"

Message 5+: Drop the link naturally
- "I have a free solo video for you, check it out - stellav.baby 💙"
- After sending the link, just chat casually, don't spam it

IMPORTANT RULES:
1. NEVER mention you're an AI or bot
2. NEVER sound scripted — mix it up
3. Keep replies short (1-2 sentences)
4. Be flirty but not too aggressive
5. If they ask personal questions, be playful and deflect
6. After sending the link once, don't send it again
7. If they say they already subscribed, say something like "omg did you like it? 😏"

The user's message history will be provided. Use it to stay consistent.

CRITICAL: Respond with ONLY the reply text. No JSON, no formatting, no markdown. Just the raw message text.
"""

# ============================================
# DEEPSEEK SERVICE
# ============================================
class DeepseekStella:
    def __init__(self):
        self.client = OpenAI(
            api_key=DEEPSEEK_KEY,
            base_url="https://api.deepseek.com/v1"
        )
        self.model = "deepseek-chat"

    def get_reply(self, user_message: str, history: list, message_count: int, link_sent: bool) -> str:
        """Get a reply from Deepseek as Stella."""
        try:
            stage_info = f"Message #{message_count + 1} in this conversation. Link already sent: {link_sent}."
            if message_count >= LINK_AFTER_MSGS and not link_sent:
                stage_info += " THIS is the right moment to naturally drop the link: stellav.baby"

            history_text = ""
            if history:
                history_text = "Recent conversation:\n" + "\n".join(
                    [f"{'You' if i % 2 == 0 else 'Them'}: {msg}" for i, msg in enumerate(history[-6:])]
                )

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": f"Context: {stage_info}"},
            ]

            if history_text:
                messages.append({"role": "system", "content": history_text})

            messages.append({"role": "user", "content": user_message})

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.85,
                max_tokens=200,
            )

            content = response.choices[0].message.content.strip()

            # Clean up any JSON that might leak through
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1])

            # Try to parse as JSON and extract reply field
            try:
                result = json.loads(content)
                if isinstance(result, dict) and "reply" in result:
                    return result["reply"]
            except (json.JSONDecodeError, TypeError):
                pass

            # Strip any remaining JSON artifacts
            content = re.sub(r'^\s*\{\s*"reply"\s*:\s*"', '', content)
            content = re.sub(r'"\s*\}\s*$', '', content)
            content = content.replace('\\"', '"').replace("\\n", "\n")

            return content.strip()

        except Exception as e:
            print(f"❌ Deepseek error: {e}")
            return "Hey! Give me a sec 😅"

# ============================================
# MAIN BOT
# ============================================
async def main():
    print("=" * 50)
    print("🔥 Stella AI Lead Funnel v4")
    print("   Text-Only + Supabase Leads + Stats")
    print("=" * 50)

    if not all([API_ID, API_HASH, DEEPSEEK_KEY]):
        print("❌ Missing config. Check your .env file.")
        return

    # Clear old landing page data
    print("🧹 Clearing old landing page data...")
    supabase_delete_all("visits")
    print("✅ Old data cleared")

    # Create Telegram client (use string session for Railway, file session for local)
    if STRING_SESSION:
        from telethon.sessions import StringSession
        client = TelegramClient(StringSession(STRING_SESSION), API_ID, API_HASH)
        print("🔑 Using string session (Railway mode)")
    else:
        client = TelegramClient(SESSION_FILE, API_ID, API_HASH)
        print("📁 Using file session (local mode)")
    deepseek = DeepseekStella()

    @client.on(events.NewMessage(incoming=True))
    async def handle_message(event):
        """Handle incoming messages."""
        sender = await event.get_sender()
        if not sender:
            return  # Skip messages from deleted accounts or unknown senders
        user_id = sender.id
        username = sender.username or sender.first_name or "Unknown"
        message_text = event.message.text.strip()

        if not message_text:
            return

        # Skip group chats and channels
        if event.is_group or event.is_channel:
            return

        print(f"\n💬 From @{username}: {message_text[:100]}")

        # Load conversation state
        convs, uid = get_conversation(user_id)
        conv = convs[uid]
        conv["username"] = username

        # Check if this is a NEW unique user (first message ever)
        is_new_user = conv["message_count"] == 0

        # Build history
        history = []
        if "history" in conv:
            history = conv["history"]

        # Get AI reply
        reply = deepseek.get_reply(
            message_text,
            history,
            conv["message_count"],
            conv["link_sent"]
        )

        # Update conversation state
        conv["message_count"] += 1
        conv["last_message"] = message_text

        # Track history (keep last 10 messages)
        if "history" not in conv:
            conv["history"] = []
        conv["history"].append(message_text)
        conv["history"].append(reply)
        if len(conv["history"]) > 10:
            conv["history"] = conv["history"][-10:]

        # Check if we should send the link
        sending_link = False
        if conv["message_count"] >= LINK_AFTER_MSGS and not conv["link_sent"]:
            if LANDING_PAGE not in reply:
                reply += f"\n\nI have a free solo video for you, check it out - {LANDING_PAGE} 💙"
            conv["link_sent"] = True
            sending_link = True
            print(f"🔗 Link sent to @{username}")

        # Check if we should invite to channel (after link is sent)
        sending_channel_invite = False
        if sending_link and not conv["channel_invited"]:
            sending_channel_invite = True

        # Save state
        save_conversations(convs)

        # --- Tracking (local JSON + Supabase) ---
        today_str = date.today().isoformat()

        # If new user, save lead locally + try Supabase
        if is_new_user:
            track_lead(username, user_id)
            lead_data = {
                "username": username,
                "user_id": str(user_id),
                "timestamp": datetime.now().isoformat(),
                "message_count": 1,
                "link_sent": False
            }
            supabase_insert("leads", lead_data)
            print(f"📝 Lead saved: @{username}")

        # Update stats locally + try Supabase
        track_stats(is_new_user=is_new_user, link_sent=sending_link)
        stats_data = {
            "date": today_str,
            "unique_users": 1 if is_new_user else 0,
            "links_sent": 1 if sending_link else 0
        }
        supabase_upsert("bot_stats", stats_data, "date")

        # --- Human-like delay ---
        delay = random.uniform(5, 15)
        print(f"⏳ Waiting {delay:.1f}s before replying...")
        await asyncio.sleep(delay)

        # --- Show typing indicator ---
        async with client.action(event.chat_id, "typing"):
            typing_duration = random.uniform(4, 8)
            await asyncio.sleep(typing_duration)

        # --- Send text reply with retry on slow mode ---
        max_retries = 3
        for attempt in range(max_retries):
            try:
                await event.reply(reply)
                print(f"💙 Stella -> @{username}: {reply[:100]}...")
                break
            except Exception as e:
                error_str = str(e)
                if "SlowModeWaitError" in error_str or "FLOOD_WAIT" in error_str:
                    match = re.search(r'(\d+)', error_str)
                    wait_time = int(match.group(1)) if match else 30
                    print(f"⏳ Slow mode: waiting {wait_time}s...")
                    await asyncio.sleep(min(wait_time, 60))
                    continue
                else:
                    print(f"❌ Send error: {e}")
                    break

        # --- Send channel invite after link ---
        if sending_channel_invite:
            await asyncio.sleep(random.uniform(2, 5))
            async with client.action(event.chat_id, "typing"):
                await asyncio.sleep(random.uniform(2, 4))

            invite_msg = f"Hey join my Telegram channel too - {CHANNEL_LINK} I post daily 😏"
            try:
                await event.reply(invite_msg)
                conv["channel_invited"] = True
                print(f"📢 Channel invite sent to @{username}")
            except Exception as e:
                print(f"❌ Channel invite error: {e}")

        # Save state again
        save_conversations(convs)

    # Start the client
    print("\n📱 Connecting to Telegram...")
    phone_to_use = PHONE if PHONE else input("Enter your phone number (with country code, e.g. +614XXXXXXXX): ")
    await client.start(phone=phone_to_use)

    print(f"✅ Connected as: {(await client.get_me()).first_name}")
    print(f"🤖 Listening for messages... (Ctrl+C to stop)")
    print("=" * 50)

    await client.run_until_disconnected()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n👋 Stopped. See you later!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
