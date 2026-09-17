# Crain's Reader

Paste a Crain's article URL, get the full text.

**Live:** https://shalom-karr.github.io/crains-reader/

Supported sites: Crain's Cleveland, Crain's Detroit, Crain's New York, Crain's Chicago Business, Crain's Grand Rapids, Ad Age. (Modern Healthcare, Automotive News and Pensions & Investments lock down their Arc origin, so they are not supported.)

## Share an article

Every loaded article has a deep link. Use the **Copy link** button, or build it yourself:

```
https://shalom-karr.github.io/crains-reader/?url=<article url>
```

Bookmarklet that opens the article you're currently on:

```
javascript:location='https://shalom-karr.github.io/crains-reader/?url='+encodeURIComponent(location.href)
```

## Deployment

| Part | Where | Source |
|---|---|---|
| Page | GitHub Pages, `main` branch root | `index.html` |
| Fetch API | Cloudflare Worker `crains-reader` at https://crains-reader.shalomkarr.workers.dev | `worker.js` + `article.js` |

The page calls the Worker whenever it is not running on localhost. Pushing to `main` redeploys the page. Redeploy the Worker with:

```
npm run deploy
```

## Run locally

```
node server.js
```

Open http://localhost:3030. Same parser (`article.js`), no Worker needed. Set `PORT` to change the port.

Technical details: [docs/how-it-works.md](docs/how-it-works.md)
