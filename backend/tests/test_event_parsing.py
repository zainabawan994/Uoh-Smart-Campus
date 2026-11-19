"""Run: python -m tests.test_event_parsing  (from backend/)"""
import app.main  # noqa: F401  (import check for all routers)
from app.scraper import categorize, parse_preview, platform_of

assert categorize("Workshop on AI by ORIC") == "workshop"
assert categorize("Sports Gala: cricket and football competitions") == "sports"
assert categorize("Campus notice") == "news"
assert platform_of("https://m.facebook.com/x/posts/1") == "facebook"
assert platform_of("https://www.linkedin.com/posts/abc") == "linkedin"
assert platform_of("https://evil.com/facebook.com") == "web"
p = parse_preview(
    '<meta property="og:title" content="Hackathon 2026"><meta property="og:description" content="Register by 5 Dec 2026">'
    '<meta property="og:image" content="https://x/y.jpg">', "https://www.instagram.com/p/1/")
assert p["event_date"] == "5 Dec 2026" and p["image_url"] == "https://x/y.jpg", p
assert categorize(p["title"]) == "competition"
print("ok")
