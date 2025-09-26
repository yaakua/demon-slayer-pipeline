
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const API = 'https://api.steampowered.com/IPublishedFileService/QueryFiles/v1';
const GET_DETAILS = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1';

const APPID = 431960; // Wallpaper Engine
const REQUIRED_TAGS = (() => {
  try {
    return JSON.parse(process.env.STEAM_WE_REQUIRED_TAGS || '["Type: Scene"]');
  } catch {
    return ["Type: Scene"];
  }
})();
const SEARCH = process.env.STEAM_WE_SEARCH || 'demon slayer'; // Kimetsu / Demon Slayer
const MAX_PAGES = Number(process.env.STEAM_WE_MAX_PAGES || 5);

const STEAMCMD = process.env.STEAMCMD_PATH || 'steamcmd';
const STEAM_USER ="807791273";
const STEAM_PASS = "]M*Bl!C7O~;K";

function sleep(ms:number){ return new Promise(res=>setTimeout(res, ms)); }

async function queryFiles(cursor="*") {
  const input = {
    appid: APPID,
    query_type: 0,          // RankedByVote
    numperpage: 100,
    cursor,
    search_text: SEARCH,    // free-text search
    requiredtags: REQUIRED_TAGS,
    match_all_tags: true,
    ids_only: true,
    return_tags: false,
    return_details: false
  };
  const resp = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'input_json=' + encodeURIComponent(JSON.stringify(input)),
  });
  if (!resp.ok) throw new Error(`QueryFiles HTTP ${resp.status}`);
  const j = await resp.json();
  return {
    ids: (j?.response?.publishedfileids || []).map((o:any)=>o.publishedfileid),
    next: j?.response?.next_cursor as string|undefined
  };
}

async function getDetails(ids: string[]) {
  // public endpoint (no key required) also exists via steamapi.xpaw.me mirror; we use official one
  const form = new URLSearchParams();
  const payload:any = { itemcount: ids.length };
  ids.forEach((id, i)=> payload[`publishedfileids[${i}]`] = id);
  Object.entries(payload).forEach(([k,v])=> form.append(k, String(v)));
  const resp = await fetch(GET_DETAILS, { method:'POST', body: form });
  if (!resp.ok) throw new Error(`GetDetails HTTP ${resp.status}`);
  const j = await resp.json();
  return (j?.response?.publishedfiledetails || []) as Array<any>;
}

function steamcmdDownload(id: string) {
  return new Promise<void>((resolve, reject) => {
    const args = [
      '+login', STEAM_USER || 'anonymous', STEAM_PASS || '',
      '+workshop_download_item', String(APPID), String(id),
      '+quit'
    ];
    const child = spawn(STEAMCMD, args, { stdio: 'inherit' });
    child.on('exit', (code)=> code===0 ? resolve() : reject(new Error('steamcmd exit '+code)));
  });
}

async function main(){
  if (!STEAM_USER || !STEAM_PASS){
    console.warn('[steam] Warning: It is recommended to login with an account that OWNS app 431960 to download items.');
  }
  let cursor = '*';
  let pages = 0;
  const allIds: string[] = [];

  while (pages < MAX_PAGES) {
    const { ids, next } = await queryFiles(cursor);
    console.log('[steam] page', pages+1, 'ids', ids.length);
    allIds.push(...ids);
    if (!next || next==='') break;
    cursor = next;
    pages++;
    await sleep(500);
  }

  // Fetch details (optional but useful for metadata & filtering)
  const unique = Array.from(new Set(allIds));
  const batched: string[][] = [];
  for (let i=0;i<unique.length;i+=100) batched.push(unique.slice(i,i+100));

  const meta: any[] = [];
  for (const chunk of batched) {
    const details = await getDetails(chunk);
    meta.push(...details);
  }

  // Save a JSON list of IDs & some meta (title, file_size, preview_url/tags)
  await fs.mkdir('data/steam', { recursive: true });
  await fs.writeFile('data/steam/wallpaper_engine_ids.json', JSON.stringify(meta, null, 2));

  // Download each item with steamcmd
  for (const id of unique) {
    console.log('[steam] downloading', id);
    try {
      await steamcmdDownload(id);
    } catch (e:any) {
      console.error('[steam] failed', id, e?.message || String(e));
    }
  }

  // Note: downloaded files end up under:
  // <steamcmd_root>/steamapps/workshop/content/431960/<ID>/...
  // You can post-process them as needed for your pipeline.
}

main().catch(e=>{ console.error(e); process.exit(1); });
