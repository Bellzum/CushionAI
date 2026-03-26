# CushionAI Vocal Bridge Setup

## Backend

1. `cd backend`
2. `npm install`
3. Add `.env`:
   - `VOCAL_BRIDGE_API_KEY=vb_<your key>`
   - `PORT=3000`
4. `npm start`

## Frontend

1. `cd frontend`
2. `npm install`
3. `npm start`
4. Open `http://localhost:5173` (or Vite URL)

## Verify

- Click Connect, allow microphone access
- Should log `Connected to CushionAI voice room`
- Should receive audio on `TrackSubscribed`
- Assistant replies should appear in `Assistant Response`
- The `Visualization` panel should populate automatically from the latest assistant transcript through OpenAI

## Notes

- Keep `vb_...` secret, do not commit.
- Token endpoint calls Vocal Bridge API and returns LiveKit token.
- Use `client_actions` data channel events for app<->agent integration.
- `POST /api/visualization` converts the latest assistant transcript into a structured visual type on the same screen

## Docker Compose (optional)

1. `docker compose up --build`
2. Backend: `http://localhost:3000/api/voice-token`
3. Frontend: `http://localhost:5173`

## vb CLI quick commands

1. `python3 -m pip install --upgrade pip`
2. `python3 -m pip install vocal-bridge`
3. `vocal-bridge:login vb_<your key>`
4. `vb config show` / `vb config set --ai-agent-enabled true` (if using CLI agent config)
