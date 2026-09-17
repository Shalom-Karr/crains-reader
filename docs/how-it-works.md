# How it works

## Why the full text is available

Crain's sites run on Arc XP. Every article page ships an inline `<script id="fusion-metadata">` containing `Fusion.globalContent={...}`, the complete ANS story object with every paragraph in `content_elements`. The paywall runs after load: the page calls `junction.crain.com/api/v1/access/decision.json`, gets `decision: "denied"`, and the Pelcro wall truncates the rendered DOM. The server never withholds the text.

The site also exposes the story by ID with no auth:

```
https://www.crainscleveland.com/pf/api/v3/content/fetch/content-api?query={"_id":"<STORY_ID>"}&_website=crains-cleveland
```

This tool uses the inline script instead because it needs only the URL, not the ID.

## Akamai

Plain `curl <url>` and PowerShell `Invoke-WebRequest` get a 403 from Akamai Bot Manager. It is a header check, not a TLS fingerprint check. Node's `fetch` passes with these three headers:

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
```

## Extraction

`server.js` finds `Fusion.globalContent=` in the HTML and walks forward with a brace-depth scanner that respects JSON strings and escapes, so it does not depend on what follows the object (`;Fusion.globalContentConfig=` today).

Supported `content_elements` types: `text`, `header`, `list`, `quote`, `image`, `interstitial_link`, `divider`. Anything else (`oembed_response`, `raw_html`, `custom_embed`, `table`) is skipped and counted in `skipped`. Inline `<script>` tags and `on*=` attributes are stripped from paragraph HTML before it reaches the page.

## API

`GET /api/article?url=<encoded article url>`

Response:

```json
{
  "id": "FLAYVE7RRRGVJCBADAE7BRJPMI",
  "url": "https://www.crainscleveland.com/real-estate/commercial/ccl-ndc-yeshiva-20260422/",
  "headline": "...",
  "subheadline": "",
  "byline": ["Joe Scalzo"],
  "date": "2026-04-22T16:30:15.327Z",
  "section": "Commercial Real Estate",
  "image": { "url": "https://.../resizer/v2/....jpeg?auth=...", "caption": "...", "credit": "" },
  "elements": [ { "type": "text", "html": "<p-content>" } ],
  "skipped": 0
}
```

Errors return `{ "error": "..." }` with:

| Status | Meaning |
|---|---|
| 400 | Missing or malformed URL |
| 422 | Page loaded but has no Arc XP story data (not an Arc site, or a section/landing page) |
| 502 | Site returned a non-200 status |
| 504 | Fetch exceeded 20s |

The server binds to 127.0.0.1 only.
