// Spotify Web API wrapper voor Frobster.
// Werkt via Spotify Connect: stuurt commando's naar het actieve apparaat
// (typisch: Spotify-app op telefoon -> gekoppelde Bluetooth/Connect-speaker).

(function() {
  const API = "https://api.spotify.com/v1";

  async function authedFetch(path, options = {}) {
    const token = await FrobsterAuth.getValidAccessToken();
    if (!token) throw new Error("Niet ingelogd");
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };
    const resp = await fetch(`${API}${path}`, { ...options, headers });
    if (resp.status === 204) return null;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      const err = new Error(`Spotify API ${resp.status}: ${txt}`);
      err.status = resp.status;
      throw err;
    }
    if (resp.headers.get("content-type")?.includes("application/json")) {
      return resp.json();
    }
    return null;
  }

  async function getProfile() {
    return authedFetch("/me");
  }

  async function isPremium() {
    try {
      const me = await getProfile();
      return me?.product === "premium";
    } catch { return false; }
  }

  async function getDevices() {
    const data = await authedFetch("/me/player/devices");
    return data?.devices || [];
  }

  async function pickActiveDevice() {
    const devices = await getDevices();
    if (devices.length === 0) return null;
    const active = devices.find(d => d.is_active);
    return active || devices[0];
  }

  async function playTrack(trackId, deviceId, positionMs = 0) {
    const body = JSON.stringify({
      uris: [`spotify:track:${trackId}`],
      position_ms: positionMs
    });
    const path = deviceId
      ? `/me/player/play?device_id=${encodeURIComponent(deviceId)}`
      : `/me/player/play`;
    try {
      await authedFetch(path, { method: "PUT", body });
    } catch (e) {
      // Spotify Connect device in slaapstand: wek het met een transfer-call
      // en probeer dan opnieuw. Dekt 404 (NO_ACTIVE_DEVICE) en 403.
      if ((e.status === 404 || e.status === 403) && deviceId) {
        try { await transferPlayback(deviceId, false); } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
        await authedFetch(path, { method: "PUT", body });
      } else {
        throw e;
      }
    }
  }

  async function pause() {
    try { await authedFetch("/me/player/pause", { method: "PUT" }); }
    catch (e) {
      // 403 bij niet-actief device -- niet fataal
      if (e.status !== 403 && e.status !== 404) throw e;
    }
  }

  async function resume() {
    await authedFetch("/me/player/play", { method: "PUT" });
  }

  async function transferPlayback(deviceId, play = false) {
    await authedFetch("/me/player", {
      method: "PUT",
      body: JSON.stringify({ device_ids: [deviceId], play })
    });
  }

  window.FrobsterPlayer = {
    getProfile,
    isPremium,
    getDevices,
    pickActiveDevice,
    playTrack,
    pause,
    resume,
    transferPlayback
  };
})();
