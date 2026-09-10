/**
 * Runtime feature flags. All flags default to off; opt in via environment.
 *
 * WORKOUT_GROUPS_ENABLED — multiplayer group workouts (rooms, share codes,
 * joining a friend's session). Solo workouts are unaffected: they run through
 * the same 1-person GroupSession flow as before.
 *
 * MUSIC_ENABLED — Spotify/Apple Music connections, workout playback, live
 * listening presence, published playlists, and PR soundtracks.
 */
export const GROUP_WORKOUTS_ENABLED = process.env.WORKOUT_GROUPS_ENABLED === "true";
export const MUSIC_ENABLED = process.env.MUSIC_ENABLED === "true";
