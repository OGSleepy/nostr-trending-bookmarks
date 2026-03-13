# Nostr Trending Bookmarks

What the Nostr network is actually saving — no algorithm, pure human curation.

Aggregates `kind:10003` and `kind:30003` bookmark events across major relays and surfaces the most-saved notes ranked by bookmark count, filterable by time window.

## Time Filters

`1H` · `4H` · `24H` · `1W` · `1M` · `ALL`

## Relays

- wss://relay.damus.io
- wss://nos.lol
- wss://relay.ditto.pub
- wss://relay.primal.net

## Stack

- React 18
- Vite
- Native WebSockets (no nostr libraries needed)
- NIP-51 (kind:10003 + kind:30003)

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
# then drag the /dist folder to Vercel, Netlify, or Cloudflare Pages
```
