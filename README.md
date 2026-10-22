# Skippio POS sync

Receives payment confirmations, records paid orders and registers them with a simulated POS.

- `backend/`: Node.js + Express + TypeScript, in-memory storage
- `frontend/`: React + Vite + TypeScript

## Run

Requires Node 22.12+.

```bash
npm install
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173 (proxies /api to the backend)
npm test               # backend tests
```
