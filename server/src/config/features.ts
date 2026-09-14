/**
 * Runtime feature flags. All flags default to off; opt in via environment.
 *
 * WORKOUT_GROUPS_ENABLED — multiplayer group workouts (rooms, share codes,
 * joining a friend's session). Solo workouts are unaffected: they run through
 * the same 1-person GroupSession flow as before.
 *
 * MUSIC_ENABLED — Spotify/Apple Music connections, workout playback, live
 * listening presence, published playlists, and PR soundtracks.
 *
 * APPLE_SIGNIN_ENABLED — "Sign in with Apple" login option, required by App
 * Store guideline 4.8 since the app also offers Google sign-in. Turns on
 * automatically once its Apple credentials are configured, since the
 * passport-apple strategy throws at construction time if clientID is missing.
 */
export const GROUP_WORKOUTS_ENABLED = process.env.WORKOUT_GROUPS_ENABLED === "true";
export const MUSIC_ENABLED = process.env.MUSIC_ENABLED === "true";
export const APPLE_SIGNIN_ENABLED = Boolean(
  process.env.APPLE_SIGNIN_CLIENT_ID &&
    process.env.APPLE_SIGNIN_TEAM_ID &&
    process.env.APPLE_SIGNIN_KEY_ID &&
    process.env.APPLE_SIGNIN_PRIVATE_KEY &&
    process.env.APPLE_SIGNIN_CALLBACK_URL
);
