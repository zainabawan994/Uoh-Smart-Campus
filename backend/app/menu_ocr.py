"""Read a photographed cafe menu with Claude vision and return structured items."""
import base64
import json

import anthropic

from app.config import settings
from app.models import CafeCategory

MODEL = "claude-opus-5-5"
SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string"},
                    "category": {"type": "string", "enum": [c.value for c in CafeCategory]},
                    "price": {"type": "number"},
                },
                "required": ["item_name", "category", "price"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}
PROMPT = (
    "This is a photo of a university cafeteria menu in Pakistan (prices in PKR). "
    "List every food or drink item with its price. Map each to one category: "
    "fast_food (burgers, pizza, fries, shawarma, rolls), desi (karahi, biryani, daal, roti, chana), "
    "snacks (samosa, pakora, sandwiches, cakes, biscuits), beverages (tea, coffee, juice, cold drinks, water). "
    "If an item has several sizes, list each size as its own item, e.g. 'Pizza (Large)'. "
    "Skip items with no readable price. Do not invent items."
)


class MenuExtractionError(Exception):
    pass


async def extract_menu(data: bytes, media_type: str) -> list[dict]:
    if not settings.ANTHROPIC_API_KEY:
        raise MenuExtractionError("Menu reading is not configured. Set ANTHROPIC_API_KEY in backend/.env.")
    if "your-key" in settings.ANTHROPIC_API_KEY or not settings.ANTHROPIC_API_KEY.startswith("sk-ant-"):
        # A Windows/OS environment variable overrides backend/.env, so a leftover placeholder there wins.
        raise MenuExtractionError(
            "ANTHROPIC_API_KEY is a placeholder, not a real key. Fix it in backend/.env "
            "and remove or correct any ANTHROPIC_API_KEY Windows environment variable."
        )
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    try:
        response = await client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                             "data": base64.standard_b64encode(data).decode()}},
                {"type": "text", "text": PROMPT},
            ]}],
        )
    except anthropic.APIStatusError as exc:
        raise MenuExtractionError(f"Menu reader error ({exc.status_code}). Try a clearer or smaller photo.") from exc
    except anthropic.APIConnectionError as exc:
        raise MenuExtractionError("Could not reach the menu reader service. Check the internet connection.") from exc
    if response.stop_reason != "end_turn":
        raise MenuExtractionError("The menu could not be read from this photo. Try a clearer photo.")
    text = next(b.text for b in response.content if b.type == "text")
    items = json.loads(text)["items"]
    # Keep only sane rows; the manager reviews everything before publishing.
    return [
        {"item_name": i["item_name"].strip()[:120], "category": i["category"], "price": round(i["price"], 2)}
        for i in items if i["item_name"].strip() and 0 < i["price"] < 100000
    ]
