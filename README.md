# LP Race Tracker (live)

A small local web app that polls the official Riot Games API for a list of
League of Legends accounts' ranked solo/duo LP, and shows the result as a
race, auto-refreshing in the browser.

## How it works

- `server.js` is a tiny Node/Express server. On a timer, it calls the Riot
  API for each account in `config.json`, converts their rank into a single
  "race score," and writes the result to `data.json`.
- `public/index.html` is the race page. It polls the server's own
  `/api/lp` endpoint every 20 seconds and re-renders the lanes — it never
  talks to Riot directly (browsers aren't allowed to call Riot's API
  directly anyway).

## 1. Get a Riot API key

1. Go to https://developer.riotgames.com and log in with your Riot account.
2. Click **"Generate API Key"** under Development API Key.
3. Copy the key (starts with `RGAPI-`). **This key expires every 24 hours**
   — for anything longer-term you'd need to register an app for a
   personal/production key, which involves a review from Riot.

## 2. Configure the project

```bash
cd lp-race-tracker
npm install
cp .env.example .env
```

Open `.env` and paste your key:

```
RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Open `config.json` and list the accounts to race, using each player's
**Riot ID** (the `Name#TAG` shown in-client — not the old "summoner name").

```json
{
  "players": [
    { "displayName": "Alice", "gameName": "AliceRiotName", "tagLine": "EUW", "region": "europe", "platform": "euw1" },
    { "displayName": "Bob",   "gameName": "BobRiotName",   "tagLine": "1234", "region": "europe", "platform": "eun1" }
  ]
}
```

`region` is for the account lookup, `platform` is for the ranked lookup.
Common values:

| Server              | region   | platform |
|---------------------|----------|----------|
| EUW                 | europe   | euw1     |
| EUNE                | europe   | eun1     |
| NA                  | americas | na1      |
| BR                  | americas | br1      |
| LAN                 | americas | la1      |
| LAS                 | americas | la2      |
| KR                  | asia     | kr       |
| JP                  | asia     | jp1      |
| OCE                 | sea      | oc1      |

## 3. Run it

```bash
npm start
```

Then open **http://localhost:3000** in your browser. The server fetches
everyone's rank immediately on startup, then again every
`POLL_INTERVAL_MINUTES` (default 3) — adjust that in `.env`.

## Notes and limits

- **Rate limits:** a personal dev key allows roughly 20 requests/second and
  100 requests/2 minutes. The server already waits ~1.3s between each
  player to stay safely under that, so this comfortably handles a handful
  of racers. If you add many more, increase `POLL_INTERVAL_MINUTES`.
- **Dev keys expire daily.** For something you want running unattended for
  more than 24 hours, you'd apply for a personal or production key from
  Riot (free, but requires filling out a form and waiting for approval).
- **Unranked accounts** show as "Unranked" and sit at the back of the pack
  until they place.
- To host this somewhere other than your own machine (so friends can see
  the live page too), deploy it to any Node-friendly host (Render,
  Railway, Fly.io, a VPS, etc.) and keep the `.env` file out of version
  control — never commit your API key.
