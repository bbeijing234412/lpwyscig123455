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
 
// Checks Riot's Spectator API to see if a player is currently in an active game.
// 200 = in game, 404 = not in game. Any other status is treated as "not in game"
// rather than thrown, so a transient hiccup here never breaks the whole poll cycle.
async function checkInGame(puuid, platform) {
  const url = `https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  return false;
}
 
// Fetches a player's last N ranked solo/duo games. Only called on demand
// (when a viewer clicks a nickname), never as part of the regular LP poll,
// since it costs several extra Riot API calls per player.
async function fetchRecentMatches(puuid, region, count = 5) {
  const idsUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${count}`;
  const matchIds = await riotFetch(idsUrl);
 
  const matches = [];
  for (const matchId of matchIds) {
    const detail = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
    const me = detail.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    matches.push({
      matchId,
      champion: me.championName,
      win: me.win,
      kills: me.kills,
      deaths: me.deaths,
      assists: me.assists,
      cs: (me.totalMinionsKilled || 0) + (me.neutralMinionsKilled || 0),
      durationSeconds: detail.info.gameDuration
    });
    await new Promise((r) => setTimeout(r, 300)); // small courtesy delay between match-detail calls
  }
  return matches;
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
 
  // 3. PUUID -> is this player in an active game right now?
  const inGame = await checkInGame(account.puuid, platform);
 
  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
 
  if (!solo) {
    return { nickname, riotId, tier: 'UNRANKED', division: null, lp: 0, wins: 0, losses: 0, inGame, puuid: account.puuid, region };
  }
 
  return {
    nickname,
    riotId,
    tier: solo.tier,
    division: solo.rank,
    lp: solo.leaguePoints,
    wins: solo.wins,
    losses: solo.losses,
    inGame,
    puuid: account.puuid,
    region
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
        losses: 0,
        inGame: false
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
 
// In-memory cache for match history, keyed by puuid. Keeps repeated clicks
// (from you or other viewers) from re-hitting Riot's Match-v5 API every time.
const matchCache = new Map(); // puuid -> { fetchedAt, matches }
const MATCH_CACHE_MS = 5 * 60 * 1000;
 
app.get('/api/matches/:nickname', async (req, res) => {
  const data = loadData();
  const player = data.players.find((p) => p.nickname === req.params.nickname);
 
  if (!player || !player.puuid) {
    return res.status(404).json({ error: 'Player not found' });
  }
 
  const cached = matchCache.get(player.puuid);
  if (cached && Date.now() - cached.fetchedAt < MATCH_CACHE_MS) {
    return res.json(cached.matches);
  }
 
  try {
    const matches = await fetchRecentMatches(player.puuid, player.region, 5);
    matchCache.set(player.puuid, { fetchedAt: Date.now(), matches });
    res.json(matches);
  } catch (err) {
    console.error(`Failed to fetch matches for ${player.nickname}:`, err.message);
    res.status(502).json({ error: 'Failed to fetch match history' });
  }
});
 
app.listen(PORT, () => {
  console.log(`LP Race running at http://localhost:${PORT}`);
  pollAll();
  setInterval(pollAll, POLL_INTERVAL_MS);
});
