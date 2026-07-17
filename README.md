# Seeker Summer Live

An independent animated community visualization of real SKR Round 1 claims during Seeker Summer.

Every confirmed claim creates an anthropomorphic Seeker phone that runs from a Solana portal to the 25M SKR vault, claims its allocation, and joins the summer side. The monitor shows live totals and links every runner to its Solscan transaction.

## Architecture

- Static HTML/CSS/Canvas 2D frontend
- Vercel serverless proxy at `/api/state`
- Live data sourced from the public SKR claim monitor
- 3-second polling with transaction-signature deduplication
- No wallet connection, keys, cookies, analytics, or user data collection

## Local development

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

## Disclaimer

Independent community project. Not affiliated with or endorsed by Solana Mobile. “Solana”, “Seeker”, and “SKR” may be trademarks of their respective owners.
