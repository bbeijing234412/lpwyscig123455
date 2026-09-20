# LP Race Tracker (live)

A small web app that polls the official Riot Games API for a list of League
of Legends accounts' ranked solo/duo LP, and shows the result as a race.
The public-facing page (`public/index.html`) is in Polish.

## How it works

- `server.js` is a tiny Node/Express server. On a timer, it calls the Riot
  API for each account in `config.json` and writes the result to `data.json`.
- `public/index.html` is the race page. It polls the server's own `/api/lp`
  endpoint every 20 seconds and re-renders the lanes — it never talks to
  Riot directly.
- Each racer shows their **set nickname** above and their **real Riot ID**
  (`Name#TAG`) below it, so viewers know who's who without seeing account
  names as the headline.

## 1. Get a Riot API key

1. Go to https://developer.riotgames.com and log in with your Riot account.
2. Click **"Generate API Key"** under Development API Key.
3. Copy the key (starts with `RGAPI-`). **This key expires every 24 hours**
   — for anything longer-term you'd apply for a personal/production key,
   which needs a short form and Riot's approval.

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

**Windows tip:** if you see "Missing RIOT_API_KEY" when running `npm start`,
it means `.env` doesn't exist yet — only `.env.example` does. In the project
folder, run:
```
copy .env.example .env
notepad .env
```
paste your key after `RIOT_API_KEY=`, save, and try `npm start` again.

Open `config.json` and list the accounts to race, using each player's
**Riot ID** (the `Name#TAG` shown in-client — not the old "summoner name")
and a **nickname** — the display name shown to viewers:

```json
{
  "players": [
    { "nickname": "Ala", "gameName": "AliceRiotName", "tagLine": "EUW", "region": "europe", "platform": "euw1" },
    { "nickname": "Bob", "gameName": "BobRiotName",   "tagLine": "1234", "region": "europe", "platform": "eun1" }
  ]
}
```

`region` is for the account lookup, `platform` is for the ranked lookup.
Common values:

| Server | region   | platform |
|--------|----------|----------|
| EUW    | europe   | euw1     |
| EUNE   | europe   | eun1     |
| NA     | americas | na1      |
| BR     | americas | br1      |
| LAN    | americas | la1      |
| LAS    | americas | la2      |
| KR     | asia     | kr       |
| JP     | asia     | jp1      |
| OCE    | sea      | oc1      |

## 3. Run it locally

```bash
npm start
```

Then open **http://localhost:3000**. Leave the terminal window open — the
server (and the page) stops working once you close it.

## 4. Host it as a real website (Render, free tier)

This puts the site on a real `https://...` URL that stays up without your
computer running, while keeping your API key private in Render's dashboard
rather than in the code.

1. **Put the project on GitHub** (no command line needed):
   - Go to https://github.com/new, create a new **private** repository.
   - On the new repo's page, click **"uploading an existing file"** and
     drag in every file from this folder (skip `node_modules` and `.env`
     if you have them locally — they're already excluded via `.gitignore`
     if you use git instead).
2. **Create a Render account** at https://render.com (free, sign in with
   GitHub is easiest).
3. Click **New → Blueprint**, pick the repo you just created. Render will
   read `render.yaml` in this project and set up the service automatically.
4. When it asks for the `RIOT_API_KEY` environment variable, paste your key.
   It's stored securely in Render, never in your code.
5. Click **Deploy**. After a minute or two you'll get a live URL like
   `https://lp-race-tracker.onrender.com` — send that to anyone you want
   watching the race.

Notes on the free Render tier: the service goes to sleep after periods of
inactivity and takes ~30–50 seconds to wake up on the next visit. That's
fine for a casual race page; if you want it always-instant, Render's paid
tier removes the sleep.

## Notes and limits

- **Rate limits:** a personal dev key allows roughly 20 requests/second and
  100 requests/2 minutes. The server waits ~1.3s between each player to
  stay safely under that. If you add many more racers, increase
  `POLL_INTERVAL_MINUTES`.
- **Dev keys expire daily.** Update the `RIOT_API_KEY` env var (locally in
  `.env`, or in Render's dashboard) each time it expires, until you have a
  longer-lived key from Riot.
- **Unranked accounts** show as "Bez rangi" and sit at the back until they
  place.
- Never commit your `.env` file or paste your API key into a public GitHub
  repo — keep the repo private, or use Render's dashboard to store the key
  instead.
