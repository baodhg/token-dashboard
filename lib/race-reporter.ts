// Handles server-side reporting to the race server.
// Auto-logins with RACE_PLAYER_NAME + RACE_PLAYER_PASSWORD, caches the JWT,
// and re-authenticates transparently when the token expires or is rejected.

// NEXT_PUBLIC_ prefix only exposes to browser — use both for server-side access
const RACE_SERVER_URL  = process.env.RACE_SERVER_URL || process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";
const RACE_PLAYER_NAME = process.env.RACE_PLAYER_NAME  || "";
const RACE_PLAYER_PASS = process.env.RACE_PLAYER_PASSWORD || "";

// Default race period — players compete within the same window
const RACE_PERIOD = (process.env.RACE_PERIOD || "1d") as string;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function authRequest(path: string): Promise<Response | null> {
  try {
    return await fetch(`${RACE_SERVER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: RACE_PLAYER_NAME, password: RACE_PLAYER_PASS }),
    });
  } catch { return null; }
}

async function login(): Promise<string | null> {
  if (!RACE_SERVER_URL || !RACE_PLAYER_NAME || !RACE_PLAYER_PASS) return null;

  let res = await authRequest("/auth/login");
  if (!res) return null;

  // Login no longer auto-creates accounts. If this player has never been
  // registered (404), bootstrap the account once via /auth/register.
  if (res.status === 404) {
    console.log(`[race] account "${RACE_PLAYER_NAME}" not found — registering`);
    const reg = await authRequest("/auth/register");
    if (reg && reg.ok) {
      res = reg;
    } else {
      console.warn(`[race] register failed: ${reg ? reg.status : "no response"}`);
      return null;
    }
  }

  if (!res.ok) { console.warn(`[race] login failed: ${res.status}`); return null; }
  const data = await res.json();
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000; // refresh before 7d expiry
  console.log(`[race] logged in as "${data.displayName}" (period: ${RACE_PERIOD})`);
  return cachedToken;
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login();
}

export async function reportToRace(totalTokens: number, totalCost: number | null = null, period = RACE_PERIOD): Promise<void> {
  if (!RACE_SERVER_URL || !RACE_PLAYER_NAME || !RACE_PLAYER_PASS) return;

  const token = await getToken();
  if (!token) return;

  const doReport = (t: string) =>
    fetch(`${RACE_SERVER_URL}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, totalTokens, totalCost, period }),
    });

  let res = await doReport(token);

  if (res.status === 401) {
    cachedToken = null;
    const fresh = await login();
    if (fresh) res = await doReport(fresh);
  }

  if (!res.ok) console.warn(`[race] report failed: ${res.status}`);
}
