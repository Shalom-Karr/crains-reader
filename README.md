# Crain's Reader

Paste a Crain's article URL, get the full text. Works on any Arc XP site (all Crain's brands) because the full story is embedded in the page's `Fusion.globalContent` script and only hidden client-side.

## Run

```
node server.js
```

Open http://localhost:3030. No dependencies. Set `PORT` to change the port.

## Use

Paste the URL and press Enter. The page also accepts a `?url=` parameter, so this bookmarklet opens the current article in the reader:

```
javascript:location='http://localhost:3030/?url='+encodeURIComponent(location.href)
```

Technical details: [docs/how-it-works.md](docs/how-it-works.md)
