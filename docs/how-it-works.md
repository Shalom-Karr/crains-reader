# How it works

## Why the full text is available

Crain's sites run on Arc XP. Every article page ships an inline `<script id="fusion-metadata">` containing `Fusion.globalContent={...}`, the complete ANS story object with every paragraph in `content_elements`. The paywall runs after load: the page calls `junction.crain.com/api/v1/access/decision.json`, gets `decision: "denied"`, and the Pelcro wall truncates the rendered DOM. The server never withholds the text.

## Where the page is fetched from

The public hostnames (`www.crainscleveland.com` etc.) sit behind Akamai Bot Manager, which:

- returns 403 to bare `curl` and PowerShell `Invoke-WebRequest` (passes with a Chrome `User-Agent`, `Accept` and `Accept-Language`), and
- returns 403 to every request from a Cloudflare Worker, whatever the headers. Cloudflare stamps Worker subrequests with `Cf-Worker`, `Cf-Ray`, `Cf-Ew-Via` and `Cdn-Loop` headers that cannot be removed, and Akamai rejects them.

Each site also has an Arc-hosted origin that is not behind Akamai:

```
https://crain-<arc site id>-prod.web.arc-cdn.net/<article path>
```

`article.js` maps the public domain to the Arc site id and fetches from that origin instead. The site id is `Fusion.arcSite` in any page of that site.

| Domain | Arc site id | Origin |
|---|---|---|
| crainscleveland.com | crains-cleveland | reachable |
| crainsdetroit.com | crains-detroit | reachable |
| crainsnewyork.com | crains-new-york | reachable |
| chicagobusiness.com | chicago-business | reachable |
| crainsgrandrapids.com | crains-grand-rapids | reachable |
| adage.com | adage | reachable |
| modernhealthcare.com | modern-healthcare | 403 (origin locked down) |
| autonews.com | automotivenews | 403 |
| pionline.com | pensions-and-investments | 403 |

Only the Cleveland origin sends `Access-Control-Allow-Origin: *`, so a browser cannot fetch the others directly. That is why the deployed page goes through the Worker.

The story is also available by ID on the public host, useful for manual checks in a browser:

```
https://www.crainscleveland.com/pf/api/v3/content/fetch/content-api?query={"_id":"<STORY_ID>"}&_website=crains-cleveland
```

## Extraction (`article.js`)

Finds `Fusion.globalContent=` in the HTML and walks forward with a brace-depth scanner that respects JSON strings and escapes, so it does not depend on what follows the object (`;Fusion.globalContentConfig=` today).

Supported `content_elements` types: `text`, `header`, `list`, `quote`, `image`, `interstitial_link`, `divider`. Anything else (`oembed_response`, `raw_html`, `custom_embed`, `table`) is skipped and counted in `skipped`. Inline `<script>` tags and `on*=` attributes are stripped from paragraph HTML before it reaches the page.

`parseTarget` rejects any host not in the `SITES` map with a 400 before any fetch happens, so the public Worker is not an open proxy. Add a domain there if Crain's launches another brand.

## Deployment

- **Page**: GitHub Pages serves `index.html` from the `main` branch root (`.nojekyll` skips the Jekyll build). Enabled via `POST repos/Shalom-Karr/crains-reader/pages` with `source.branch=main`, `source.path=/`.
- **Worker**: `wrangler.jsonc` names the Worker `crains-reader` on account `536d945663a8a3a20a671cf695c2e027`. `npm run deploy` runs `npx wrangler deploy`. The Worker answers `/api/article` only, with `Access-Control-Allow-Origin: *` and a 204 on `OPTIONS`.
- **Page → API selection**: `index.html` calls `/api/article` relative when on `localhost` or `127.0.0.1`, otherwise `https://crains-reader.shalomkarr.workers.dev/api/article`.

## Deep links

`index.html` reads `?url=` on load and fetches it immediately. After any successful load it rewrites the address bar to `?url=<canonical article url>` (tracking params stripped) and sets the document title to the headline, so the browser URL is always shareable. The **Copy link** button copies that same URL.

## API

`GET /api/article?url=<encoded article url>` (same shape from `server.js` and the Worker)

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
| 400 | Missing or malformed URL, or a host that is not a supported Crain's site |
| 422 | Page loaded but has no story data (section page, homepage) |
| 502 | Arc origin returned a non-200 status (404 for a bad slug) |
| 504 | Fetch exceeded 20s |

The local server binds to 127.0.0.1 only.
