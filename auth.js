// Spotify Authorization Code with PKCE flow.
// Geen client_secret nodig â veilig voor pure webapp deployment.

(function() {
  const CLIENT_ID = "c506d9ea22cb4ec095d58448ba9de905";
  const REDIRECT_URI = "https://savdpluijm.github.io/frobster/callback.html";
  const SCOPES = [
    "user-modify-playback-state",
    "user-read-playback-state",
    "user-read-private"
  ].join(" ");

  const STORAGE_KEY = "frobster_spotify_tokens";
  const VERIFIER_KEY = "frobster_pkce_verifier";

  function base64urlEncode(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  function generateVerifier() {
    const arr = new Uint8Array(64);
    crypto.getRandomValues(arr);
    return base64urlEncode(arr);
  }

  async function deriveChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64urlEncode(hash);
  }

  function loadTokens() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  function saveTokens(tokens) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  function clearTokens() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function startLogin(pendingCardId) {
    if (pendingCardId) {
      sessionStorage.setItem("frobster_pending_card_id", pendingCardId);
    }
    const verifier = generateVerifier();
    const challenge = await deriveChallenge(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: challenge,
      scope: SCOPES
    });
    location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) throw new Error("PKCE verifier ontbreekt");

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    });

    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!resp.ok) throw new Error(`Token exchange faalde (${resp.status})`);
    const data = await resp.json();
    sessionStorage.removeItem(VERIFIER_KEY);
    saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in - 30) * 1000
    });
    return data.access_token;
  }

  async function refreshToken() {
    const tokens = loadTokens();
    if (!tokens?.refresh_token) throw new Error("Geen refresh token");

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token
    });

    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!resp.ok) throw new Error(`Refresh faalde (${resp.status})`);
    const data = await resp.json();
    saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + (data.expires_in - 30) * 1000
    });
    return data.access_token;
  }

  async function getValidAccessToken() {
    const tokens = loadTokens();
    if (!tokens) return null;
    if (Date.now() < tokens.expires_at) return tokens.access_token;
    try { return await refreshToken(); }
    catch { clearTokens(); return null; }
  }

  function isLoggedIn() {
    return !!loadTokens();
  }

  function logout() {
    clearTokens();
  }

  window.FrobsterAuth = {
    startLogin,
    exchangeCodeForToken,
    getValidAccessToken,
    isLoggedIn,
    logout,
    CLIENT_ID
  };
})();
