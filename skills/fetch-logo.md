---
name: fetch-logo
description: Fetch a company logo and display it on the Fire TV background
trigger: When the user asks to find, fetch, grab, or display a company logo on the TV
---

# Fetch Logo Skill

You are helping the user fetch a high-res company logo and display it on their Fire TV via the background server running at `http://localhost:3100`.

## Steps

1. **Identify the company and domain.** The user will provide a company name and optionally a URL or domain. If no domain is given, infer it from the company name (e.g. "Stripe" → `stripe.com`, "ThreePoint Labs" → `threepointlabs.com`). If you're unsure, ask.

2. **Fetch the logo.** Call the API endpoint:

```
GET http://localhost:3100/api/logo?company=COMPANY_NAME&domain=DOMAIN
```

This downloads the best available logo (preferring dark-background variants) and automatically sets it as the current Fire TV background.

3. **Report the result.** Tell the user:
   - Which source the logo came from (Brandfetch, website scrape, Clearbit, or Google Favicon)
   - The filename it was saved as
   - That it's now showing on the Fire TV

4. **If the logo isn't right**, offer to:
   - Try a different domain (`/api/logo?company=X&domain=alternative.com`)
   - Search for the logo using the `mcp__magic__logo_search` tool in SVG format and save it manually to `~/Documents/fire-tv-backgrounds/backgrounds/`
   - Use `mcp__firecrawl__firecrawl_scrape` to scrape the company's brand/press page for a media kit logo

## Example Interactions

**User:** "Get me the Dunham and Company logo"
**Action:** `curl http://localhost:3100/api/logo?company=Dunham+and+Company&domain=dunhamandcompany.com`

**User:** "Pull up the Nike logo on the TV"
**Action:** `curl http://localhost:3100/api/logo?company=Nike&domain=nike.com`

**User:** "Show the Christian Aid logo"
**Action:** `curl http://localhost:3100/api/logo?company=Christian+Aid&domain=christianaid.org.uk`

## Notes

- Logos are saved to `~/Documents/fire-tv-backgrounds/backgrounds/` as `{company}-logo.{ext}`
- The API auto-sets the fetched logo as the current background — the Fire TV updates instantly via SSE
- If the automatic sources fail, fall back to the MCP logo_search tool or manual scraping
- The server must be running on port 3100
