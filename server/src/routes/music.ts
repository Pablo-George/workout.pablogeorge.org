import crypto from "node:crypto";
import { Router } from "express";
import { ensureAuth } from "../middleware/auth.js";
import { saveSpotifyConnection, spotifyConfigured, syncSpotifyPlaylists } from "../services/musicService.js";

const router = Router();
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

router.get("/music/spotify/connect", ensureAuth, (req, res) => {
  if (!spotifyConfigured()) return res.redirect("/#tab-profile");
  const state = crypto.randomBytes(24).toString("base64url");
  (req.session as unknown as { spotifyOAuthState?: string }).spotifyOAuthState = state;
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    redirect_uri: process.env.SPOTIFY_CALLBACK_URL!,
    scope: SCOPES,
    state,
  }).toString();
  res.redirect(url.toString());
});

router.get("/music/spotify/callback", ensureAuth, async (req, res, next) => {
  try {
    const session = req.session as unknown as { spotifyOAuthState?: string };
    const state = String(req.query.state ?? "");
    const code = String(req.query.code ?? "");
    if (!state || state !== session.spotifyOAuthState || !code) return res.redirect("/?music=spotify-error#tab-profile");
    delete session.spotifyOAuthState;

    const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_CALLBACK_URL!,
      }),
    });
    if (!response.ok) return res.redirect("/?music=spotify-error#tab-profile");
    const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
    const user = req.user as { userId: string };
    await saveSpotifyConnection(user.userId, tokens);
    await syncSpotifyPlaylists(user.userId);
    res.redirect("/?music=spotify-connected#tab-profile");
  } catch (error) {
    next(error);
  }
});

export default router;
