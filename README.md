# Seeker Summer Live

An independent animated community visualization of real SKR Round 1 claims during Solana Mobile's Seeker Summer.

Every confirmed claim creates an anthropomorphic Seeker phone that runs across the summer boardwalk. The UI shows live campaign totals and links every arrival to its Solscan transaction.

## Architecture

- Static HTML/CSS/Canvas 2D frontend
- Vercel serverless proxy at `/api/state`
- Live data sourced from the public SKR campaign monitor
- Polling with transaction-signature deduplication
- No wallet connection, keys, cookies, or user data collection

## Local development

The API route requires a Vercel-compatible dev server. The visual frontend can also be previewed through any static server, but live data will need the proxy.

```bash
npx vercel dev
```

## Disclaimer

Independent community project. Not affiliated with or endorsed by Solana Mobile. “Solana”, “Seeker”, and “SKR” may be trademarks of their respective owners.
