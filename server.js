require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const POLL_INTERVAL_MS = (Number(process.env.POLL_INTERVAL_MINUTES) || 3) * 60 * 1000;
const CONFIG_PATH = path.join(__dirname, 'config.json');
const DATA_PATH = path.join(__dirname, 'data.json');
const DELAY_BETWEEN_PLAYERS_MS = 1300; // stay comfortably under rate limits

if (!RIOT_API_KEY) {
  console.error('Missing RIOT_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { updatedAt: null, players: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

async function riotFetch(url) {
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Riot API ${res.status} for ${url} ${body}`);
  }
  return res.json();
}

async function fetchPlayerRank(player) {
  const { gameName, tagLine, platform, region } = player;
  const nickname = player.nickname || gameName;
  const riotId = `${gameName}#${tagLine}`;

  // 1. Riot ID -> PUUID (regional routing: europe / americas / asia)
  const accountUrl = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const account = await riotFetch(accountUrl);

  // 2. PUUID -> ranked entries (platform routing: euw1 / na1 / eun1 / kr / jp1 ...)
  const leagueUrl = `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`;
  const entries = await riotFetch(leagueUrl);

  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');

  if (!solo) {
    return { nickname, riotId, tier: 'UNRANKED', division: null, lp: 0, wins: 0, losses: 0 };
  }

  return {
    nickname,
    riotId,
    tier: solo.tier,
    division: solo.rank,
    lp: solo.leaguePoints,
    wins: solo.wins,
    losses: solo.losses
  };
}

async function pollAll() {
  const config = loadConfig();
  const results = [];

  for (const player of config.players) {
    try {
      const rank = await fetchPlayerRank(player);
      results.push(rank);
    } catch (err) {
      console.error(`Failed to fetch ${player.nickname || player.gameName}:`, err.message);
      results.push({
        nickname: player.nickname || player.gameName,
        riotId: `${player.gameName}#${player.tagLine}`,
        tier: 'ERROR',
        division: null,
        lp: 0,
        wins: 0,
        losses: 0
      });
    }
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PLAYERS_MS));
  }

  saveData({ updatedAt: new Date().toISOString(), players: results });
  console.log(`[${new Date().toLocaleTimeString()}] Updated ${results.length} players.`);
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/lp', (req, res) => {
  res.json(loadData());
});

app.listen(PORT, () => {
  console.log(`LP Race running at http://localhost:${PORT}`);
  pollAll();
  setInterval(pollAll, POLL_INTERVAL_MS);
});
