import { pathToFileURL } from 'node:url';

export interface SteamSearchResult {
  appid: number;
  name: string;
  icon: string;
  logo: string;
}

export interface SteamMovie {
  id: number;
  name: string;
  mp4: { max: string; '480': string };
  webm: { max: string; '480': string };
}

export interface SteamPriceOverview {
  final_formatted: string;   // ex. "14,99€"
  discount_percent: number;  // 0 si pas de promo
  initial_formatted: string; // prix barré, vide si pas de promo
}

export interface SteamAppDetails {
  type: string;
  name: string;
  steam_appid: number;
  short_description: string;
  header_image: string;
  website: string | null;
  // absent sur les jeux gratuits et certains DLC
  price_overview?: SteamPriceOverview;
  // movies is absent on some titles (e.g. DLC, age-gated entries that slipped through)
  movies?: SteamMovie[];
}

// The Storefront API wraps results by appid:
//   { "367520": { success: true, data: { ... } } }
// success is false for age-gated titles and delisted games — data will be absent in that case.
interface StorefrontEnvelope {
  success: boolean;
  data?: SteamAppDetails;
}

type StorefrontResponse = Record<string, StorefrontEnvelope>;

export async function searchApps(query: string): Promise<SteamSearchResult[]> {
  const url = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam SearchApps HTTP ${res.status}`);
  return (await res.json()) as SteamSearchResult[];
}

export async function getAppDetails(appid: number): Promise<SteamAppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=french&cc=fr`;
  const res = await fetch(url, {
    headers: {
      Cookie: 'birthtime=283993201; lastagecheckage=1-January-1979; mature_content=1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`Steam appdetails HTTP ${res.status}`);
  const json = (await res.json()) as StorefrontResponse;
  const entry = json[String(appid)];
  // success: false happens with age-gates and delisted titles
  if (!entry?.success || !entry.data) return null;
  return entry.data;
}

// Smoke test — run with: npx tsx src/steam.ts
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const details = await getAppDetails(367520);
  console.log('Hollow Knight:', details?.name, '|', details?.short_description?.slice(0, 80));
}
