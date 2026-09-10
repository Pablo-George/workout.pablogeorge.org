import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { badRequest, handler, intParam, notFound, sendData } from "../lib/respond.js";
import {
  appleDeveloperToken,
  currentTrack,
  musicDashboard,
  saveAppleConnection,
  startSelectedPlaylist,
  syncApplePlaylists,
  syncSpotifyPlaylists,
  updateListening,
  type MusicProvider,
} from "../services/musicService.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  handler(async (req, res) => sendData(res, await musicDashboard(currentUser(req).userId))),
);

router.get(
  "/apple/developer-token",
  requireAuth,
  handler(async (_req, res) => sendData(res, { developerToken: appleDeveloperToken() })),
);

router.post(
  "/apple/connect",
  requireAuth,
  handler(async (req, res) => {
    const musicUserToken = String(req.body?.musicUserToken ?? "");
    if (musicUserToken.length < 20 || musicUserToken.length > 4096) throw badRequest("Invalid Apple Music token");
    const userId = currentUser(req).userId;
    await saveAppleConnection(userId, musicUserToken);
    const playlists = await syncApplePlaylists(userId);
    sendData(res, { provider: "APPLE_MUSIC", playlists }, 201);
  }),
);

router.post(
  "/:provider/sync",
  requireAuth,
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const provider = req.params.provider.toUpperCase();
    const playlists = provider === "SPOTIFY"
      ? await syncSpotifyPlaylists(userId)
      : provider === "APPLE_MUSIC"
        ? await syncApplePlaylists(userId)
        : (() => { throw badRequest("Unknown music provider"); })();
    sendData(res, playlists);
  }),
);

router.put(
  "/playlists/:playlistId/select",
  requireAuth,
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.playlistId, "playlistId");
    const playlist = await prisma.musicPlaylist.findFirst({ where: { id, userId } });
    if (!playlist) throw notFound("Playlist not found");
    await prisma.$transaction([
      prisma.musicPlaylist.updateMany({ where: { userId }, data: { isSelected: false } }),
      prisma.musicPlaylist.update({ where: { id }, data: { isSelected: true } }),
    ]);
    sendData(res, { ...playlist, isSelected: true });
  }),
);

router.put(
  "/playlists/:playlistId/publish",
  requireAuth,
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const id = intParam(req.params.playlistId, "playlistId");
    const playlist = await prisma.musicPlaylist.findFirst({ where: { id, userId } });
    if (!playlist) throw notFound("Playlist not found");
    const isPublished = typeof req.body?.isPublished === "boolean" ? req.body.isPublished : !playlist.isPublished;
    const updated = await prisma.musicPlaylist.update({ where: { id }, data: { isPublished } });
    sendData(res, updated);
  }),
);

router.post(
  "/start",
  requireAuth,
  handler(async (req, res) => {
    const rawSessionId = req.body?.workoutSessionId;
    const workoutSessionId = rawSessionId === undefined ? undefined : Number(rawSessionId);
    if (workoutSessionId !== undefined && !Number.isInteger(workoutSessionId)) throw badRequest("Invalid workout session");
    sendData(res, await startSelectedPlaylist(currentUser(req).userId, workoutSessionId));
  }),
);

router.get(
  "/now-playing",
  requireAuth,
  handler(async (req, res) => {
    const sessionId = req.query.workoutSessionId ? Number(req.query.workoutSessionId) : undefined;
    sendData(res, await currentTrack(currentUser(req).userId, sessionId));
  }),
);

router.put(
  "/now-playing",
  requireAuth,
  handler(async (req, res) => {
    const provider = String(req.body?.provider ?? "") as MusicProvider;
    const trackId = String(req.body?.trackId ?? "").slice(0, 200);
    const title = String(req.body?.title ?? "").trim().slice(0, 300);
    const artist = String(req.body?.artist ?? "").trim().slice(0, 300);
    if (provider !== "APPLE_MUSIC" || !trackId || !title || !artist) throw badRequest("Invalid track");
    const row = await updateListening(currentUser(req).userId, {
      provider,
      trackId,
      title,
      artist,
      album: req.body?.album ? String(req.body.album).slice(0, 300) : null,
      artworkUrl: req.body?.artworkUrl ? String(req.body.artworkUrl).slice(0, 1000) : null,
      externalUrl: req.body?.externalUrl ? String(req.body.externalUrl).slice(0, 1000) : null,
      isPlaying: Boolean(req.body?.isPlaying),
    }, req.body?.workoutSessionId ? Number(req.body.workoutSessionId) : null);
    sendData(res, { updatedAt: row.updatedAt });
  }),
);

router.delete(
  "/:provider",
  requireAuth,
  handler(async (req, res) => {
    const userId = currentUser(req).userId;
    const provider = req.params.provider.toUpperCase();
    if (provider !== "SPOTIFY" && provider !== "APPLE_MUSIC") throw badRequest("Unknown music provider");
    await prisma.$transaction([
      prisma.musicPlaylist.deleteMany({ where: { userId, provider } }),
      prisma.musicConnection.deleteMany({ where: { userId, provider } }),
      prisma.currentListening.deleteMany({ where: { userId, provider } }),
    ]);
    res.status(204).end();
  }),
);

export default router;
