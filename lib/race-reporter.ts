// Handles server-side reporting to the race server.
// Auto-logins with RACE_PLAYER_NAME + RACE_PLAYER_PASSWORD, caches the JWT,
// and re-authenticates transparently when the token expires or is rejected.

const RACE_SERVER_URL   = process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";
const RACE_PLAYER_NAME  = process.env.RACE_PLAYER_NAME  || "";
const RACE_PLAYER_PASS  = process.env.RACE_PLAYER_PASSWORD || "";

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // Unix ms

async function login(): Promise<string | null> {
  if (!RACE_SERVER_URL || !RACE_PLAYER_NAME || !RACE_PLAYER_PASS) return null;
  try {
    const res = await fetch(`${RACE_SERVER_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: RACE_PLAYER_NAME, password: RACE_PLAYER_PASS }),
    });
    if (!res.ok) {
      console.warn(`[race] login failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    cachedToken = data.token;
    // JWT expires in 7d — refresh 1h before expiry to be safe
    tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000;
    console.log(`[race] logged in as "${data.displayName}"`);
    return cachedToken;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login();
}

export async function reportToRace(totalTokens: number): Promise<void> {
  if (!RACE_SERVER_URL || !RACE_PLAYER_NAME || !RACE_PLAYER_PASS) return;

  const token = await getToken();
  if (!token) return;

  const doReport = async (t: string) =>
    fetch(`${RACE_SERVER_URL}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, totalTokens }),
    });

  let res = await doReport(token);

  // Token rejected (expired / server restarted) — re-login once and retry
  if (res.status === 401) {
    cachedToken = null;
    const fresh = await login();
    if (fresh) res = await doReport(fresh);
  }

  if (!res.ok) {
    console.warn(`[race] report failed: ${res.status}`);
  }
}
