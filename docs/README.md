# DriftDesk Sharp

DriftDesk is a TxLINE-powered football odds movement analyzer for the Trading Tools and Agents track.

## Live URLs

- App: https://driftdesk-solana.vercel.app/
- Signals API: `/api/signals`
- Signal history: `/api/history`
- Health: `/api/health`
- Odds validation proxy: `/api/odds/validation?messageId={messageId}&ts={ts}`

## Environment

Set on Vercel Production:

- `TXLINE_NETWORK=devnet`
- `TXLINE_JWT`
- `TXLINE_API_TOKEN`
- `NEXT_PUBLIC_SITE_URL=https://driftdesk-solana.vercel.app`
- `NEXT_PUBLIC_PRODUCT_TITLE=DriftDesk Sharp`

## Demo script

1. Open the app.
2. Show selected live TxLINE fixture and source labels.
3. Explain large-move share and CLV as descriptive metrics, not PnL.
4. Open `/api/signals` and show proof metadata.
5. Open `/api/history` and show independent DriftDesk history.

No real-money wagering or financial advice is offered.
