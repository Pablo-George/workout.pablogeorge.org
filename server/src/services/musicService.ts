import crypto from "node:crypto";
import { prisma } from "../db.js";
import { MUSIC_ENABLED } from "../config/features.js";

export const MUSIC_PROVIDERS = ["SPOTIFY", "APPLE_MUSIC"] as const;
export type MusicProvider = (typeof MUSIC_PROVIDERS)[number];

export type TrackSnapshot = {
  provider: MusicProvider;
  trackId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  externalUrl: string | null;
  isPlaying: boolean;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

function encryptionKey(): Buffer {
  const configured = process.env.MUSIC_TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MUSIC_TOKEN_ENCRYPTION_KEY is required for music connections");
    }
    return crypto.createHash("sha256").update(process.env.SESSION_SECRET || "dev-secret").digest();
  }
  return crypto.createHash("sha256").update(configured).digest();
}

export function encryptToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string): string {
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted music token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function spotifyConfigured(): boolean {
  return MUSIC_ENABLED && Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_CALLBACK_URL);
}

export function appleMusicConfigured(): boolean {
  return MUSIC_ENABLED && Boolean(process.env.APPLE_MUSIC_TEAM_ID && process.env.APPLE_MUSIC_KEY_ID && process.env.APPLE_MUSIC_PRIVATE_KEY);
}

export async function saveSpotifyConnection(userId: string, tokens: SpotifyTokenResponse): Promise<void> {
  const existing = await prisma.musicConnection.findUnique({
    where: { userId_provider: { userId, provider: "SPOTIFY" } },
  });
  await prisma.musicConnection.upsert({
    where: { userId_provider: { userId, provider: "SPOTIFY" } },
    create: {
      userId,
      provider: "SPOTIFY",
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    update: {
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : existing?.encryptedRefreshToken,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

export async function saveAppleConnection(userId: string, musicUserToken: string): Promise<void> {
  await prisma.musicConnection.upsert({
    where: { userId_provider: { userId, provider: "APPLE_MUSIC" } },
    create: {
      userId,
      provider: "APPLE_MUSIC",
      encryptedAccessToken: encryptToken(musicUserToken),
    },
    update: { encryptedAccessToken: encryptToken(musicUserToken), expiresAt: null },
  });
}

async function refreshSpotify(userId: string, encryptedRefreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decryptToken(encryptedRefreshToken),
  });
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Spotify refresh failed (${response.status})`);
  const tokens = (await response.json()) as SpotifyTokenResponse;
  await saveSpotifyConnection(userId, tokens);
  return tokens.access_token;
}

export async function spotifyAccessToken(userId: string): Promise<string | null> {
  const connection = await prisma.musicConnection.findUnique({
    where: { userId_provider: { userId, provider: "SPOTIFY" } },
  });
  if (!connection) return null;
  if (connection.expiresAt && connection.expiresAt.getTime() < Date.now() + 30_000) {
    if (!connection.encryptedRefreshToken) return null;
    return refreshSpotify(userId, connection.encryptedRefreshToken);
  }
  return decryptToken(connection.encryptedAccessToken);
}

export function appleDeveloperToken(): string {
  if (!appleMusicConfigured()) throw new Error("Apple Music is not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_MUSIC_KEY_ID })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: process.env.APPLE_MUSIC_TEAM_ID,
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
  })).toString("base64url");
  const key = process.env.APPLE_MUSIC_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

async function spotifyJson<T>(userId: string, path: string, init?: RequestInit): Promise<T> {
  const token = await spotifyAccessToken(userId);
  if (!token) throw new Error("Spotify is not connected");
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`Spotify request failed (${response.status})`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function syncSpotifyPlaylists(userId: string) {
  const payload = await spotifyJson<{
    items: Array<{ id: string; name: string; images: Array<{ url: string }>; external_urls: { spotify?: string } }>;
  }>(userId, "/me/playlists?limit=50");
  for (const playlist of payload.items) {
    await prisma.musicPlaylist.upsert({
      where: { userId_provider_providerPlaylistId: { userId, provider: "SPOTIFY", providerPlaylistId: playlist.id } },
      create: {
        userId, provider: "SPOTIFY", providerPlaylistId: playlist.id, name: playlist.name,
        artworkUrl: playlist.images[0]?.url ?? null, externalUrl: playlist.external_urls.spotify ?? null,
      },
      update: {
        name: playlist.name, artworkUrl: playlist.images[0]?.url ?? null,
        externalUrl: playlist.external_urls.spotify ?? null,
      },
    });
  }
  return prisma.musicPlaylist.findMany({ where: { userId, provider: "SPOTIFY" }, orderBy: { name: "asc" } });
}

export async function syncApplePlaylists(userId: string) {
  const connection = await prisma.musicConnection.findUnique({
    where: { userId_provider: { userId, provider: "APPLE_MUSIC" } },
  });
  if (!connection) throw new Error("Apple Music is not connected");
  const response = await fetch("https://api.music.apple.com/v1/me/library/playlists?limit=50", {
    headers: {
      Authorization: `Bearer ${appleDeveloperToken()}`,
      "Music-User-Token": decryptToken(connection.encryptedAccessToken),
    },
  });
  if (!response.ok) throw new Error(`Apple Music request failed (${response.status})`);
  const payload = (await response.json()) as {
    data: Array<{ id: string; attributes: { name: string; artwork?: { url: string }; playParams?: { globalId?: string } } }>;
  };
  for (const playlist of payload.data) {
    const artworkUrl = playlist.attributes.artwork?.url?.replace("{w}", "300").replace("{h}", "300") ?? null;
    await prisma.musicPlaylist.upsert({
      where: { userId_provider_providerPlaylistId: { userId, provider: "APPLE_MUSIC", providerPlaylistId: playlist.id } },
      create: { userId, provider: "APPLE_MUSIC", providerPlaylistId: playlist.id, name: playlist.attributes.name, artworkUrl },
      update: { name: playlist.attributes.name, artworkUrl },
    });
  }
  return prisma.musicPlaylist.findMany({ where: { userId, provider: "APPLE_MUSIC" }, orderBy: { name: "asc" } });
}

export async function startSelectedPlaylist(userId: string, workoutSessionId?: number) {
  const selected = await prisma.musicPlaylist.findFirst({ where: { userId, isSelected: true } });
  if (!selected) return { started: false, reason: "NO_PLAYLIST" as const };
  if (selected.provider === "SPOTIFY") {
    try {
      await spotifyJson<void>(userId, "/me/player/play", {
        method: "PUT",
        body: JSON.stringify({ context_uri: `spotify:playlist:${selected.providerPlaylistId}` }),
      });
      return { started: true, provider: selected.provider, playlist: selected };
    } catch (error) {
      return { started: false, reason: "NO_ACTIVE_DEVICE" as const, provider: selected.provider, playlist: selected };
    }
  }
  return { started: false, reason: "START_IN_BROWSER" as const, provider: selected.provider, playlist: selected, workoutSessionId };
}

export async function readSpotifyNowPlaying(userId: string): Promise<TrackSnapshot | null> {
  try {
    const token = await spotifyAccessToken(userId);
    if (!token) return null;
    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 204 || !response.ok) return null;
    const value = (await response.json()) as any;
    if (!value.item || value.item.type !== "track") return null;
    return {
      provider: "SPOTIFY", trackId: value.item.id, title: value.item.name,
      artist: value.item.artists?.map((a: any) => a.name).join(", ") || "Unknown artist",
      album: value.item.album?.name ?? null, artworkUrl: value.item.album?.images?.[0]?.url ?? null,
      externalUrl: value.item.external_urls?.spotify ?? null, isPlaying: Boolean(value.is_playing),
    };
  } catch {
    return null;
  }
}

export async function updateListening(userId: string, track: TrackSnapshot, workoutSessionId?: number | null) {
  return prisma.currentListening.upsert({
    where: { userId },
    create: { userId, ...track, workoutSessionId: workoutSessionId ?? null },
    update: { ...track, workoutSessionId: workoutSessionId ?? undefined },
  });
}

export async function currentTrack(userId: string, workoutSessionId?: number): Promise<TrackSnapshot | null> {
  if (!MUSIC_ENABLED) return null;
  const spotify = await readSpotifyNowPlaying(userId);
  if (spotify) {
    await updateListening(userId, spotify, workoutSessionId);
    return spotify;
  }
  const saved = await prisma.currentListening.findUnique({ where: { userId } });
  if (!saved || Date.now() - saved.updatedAt.getTime() > 90_000 || !saved.isPlaying) return null;
  return {
    provider: saved.provider as MusicProvider, trackId: saved.trackId, title: saved.title,
    artist: saved.artist, album: saved.album, artworkUrl: saved.artworkUrl,
    externalUrl: saved.externalUrl, isPlaying: saved.isPlaying,
  };
}

export async function musicDashboard(userId: string) {
  if (!MUSIC_ENABLED) {
    return {
      enabled: false,
      configured: { spotify: false, appleMusic: false },
      connected: [] as string[],
      playlists: [],
    };
  }
  const [connections, playlists] = await Promise.all([
    prisma.musicConnection.findMany({ where: { userId }, select: { provider: true } }),
    prisma.musicPlaylist.findMany({ where: { userId }, orderBy: [{ isSelected: "desc" }, { name: "asc" }] }),
  ]);
  return {
    enabled: true,
    configured: { spotify: spotifyConfigured(), appleMusic: appleMusicConfigured() },
    connected: connections.map((c) => c.provider),
    playlists,
  };
}
