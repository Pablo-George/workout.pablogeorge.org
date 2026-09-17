# WORKOUT — Native iOS App

This is a from-scratch native SwiftUI rewrite, replacing the Capacitor/WebView
app in `../ios/`. It talks to the same Express backend over a new JSON API
(`server/src/api/*`) instead of rendering server-side HTML in a WebView.

**I could not compile or run any of this** — there's no Mac/Xcode available
in the environment that wrote it. Treat everything here as a first draft that
needs a real build-and-fix pass in Xcode, not finished code. This file exists
because there's no `.xcodeproj` yet: hand-editing a Capacitor-generated
project file blind was too risky, so instead this is a plain folder of
`.swift` files for you to drop into a fresh project.

## What's implemented

- **Auth**: Google / Sign in with Apple, via the existing web OAuth flow
  (`ASWebAuthenticationSession`), bridged to a bearer token for API calls.
- **Lifting**: lift list, 5/3/1 week plan with plate math, training-max setup,
  complete-workout flow with PR detection.
- **Calisthenics**: exercises, daily rep totals, quick add/subtract.
- **Running**: this is the flagship piece — native `CLLocationManager`
  tracking (works with the phone locked/backgrounded, unlike the old
  Capacitor plugin), a live `MapKit` route, Start/Pause/Stop, and a Lock
  Screen + Dynamic Island Live Activity.
- **Social**: feed, post composer (text only), friend requests, invite link
  sharing.
- **Profile**: dashboard stats, weight logging, goal card, Swift Charts for
  weight and running history.

## What's NOT implemented (deferred, not silently dropped)

- **Music integration** (Spotify/Apple Music) — stays web-only for now.
- **Group live workout rooms** — the real-time multi-person session feature
  stays web-only.
- **Admin panel** — web-only.
- **Calorie photo logging UI** — the backend API (`/api/cals`) fully
  supports photo upload + Gemini estimation, but no camera/photo-picker
  screen was built for it here. Text-based logging would be a small
  follow-up; the API is ready.
- Social post images (photo attachment) — same story as calorie photos.

## One-time setup in Xcode

1. **Create the project**: File > New > Project > iOS > App. Interface:
   SwiftUI. Language: Swift. Suggest a fresh bundle ID (don't reuse
   `org.pablogeorge.fivethreeone` while the Capacitor app still exists, or
   App Store Connect will see them as the same app).
2. **Deployment target: iOS 17.0.** The Running screen uses the iOS 17
   `Map(position:)` / `MapPolyline` API and ActivityKit's Dynamic Island
   APIs (16.1+); 17.0 covers both with room to spare.
3. Delete the generated `ContentView.swift` and default `App.swift`, then
   drag this folder's contents (`App/`, `Auth/`, `Networking/`, `Models/`,
   `Features/`) into the project, keeping folder references, added to the
   main app target.
4. **`Features/Running/RunLocationManager.swift`, `RunLiveActivityController.swift`,
   `RunTrackingView.swift`, `RunningView.swift`** and the rest of `Features/`,
   `App/`, `Auth/`, `Networking/`, `Models/` all belong to the **main app
   target**.
5. **`RunActivityWidget/RunActivityWidget.swift`** belongs to a **Widget
   Extension target** you create via File > New > Target > Widget Extension
   (uncheck "Include Configuration Intent"; delete its generated Swift
   file). **`RunActivityWidget/RunActivityAttributes.swift`** must be added
   to **both** targets — select it in the File Inspector and check both
   target-membership boxes, or the widget extension won't see the same type
   the app uses to start the activity.
6. **Info.plist** (main app target) — add:
   ```xml
   <key>NSLocationWhenInUseUsageDescription</key>
   <string>WORKOUT uses your location to track distance during a run.</string>
   <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
   <string>WORKOUT uses your location to keep tracking your run while your phone is locked or you're in another app.</string>
   <key>UIBackgroundModes</key>
   <array>
     <string>location</string>
   </array>
   <key>NSSupportsLiveActivities</key>
   <true/>
   ```
7. **URL Scheme** (main app target, Info tab > URL Types): add a URL scheme
   `workoutapp` — this is what `AuthManager` listens for after sign-in
   completes (`workoutapp://auth?token=...`). It must match exactly what
   `routes/auth.ts`'s `finishAuth` redirects to.
8. **Signing & Capabilities** (main app target): add **Background Modes**,
   check **Location updates** (this is the same thing as the Info.plist
   `UIBackgroundModes` array — Xcode manages both together once you add the
   capability).
9. **`Networking/APIClient.swift`**: `baseURL` is hardcoded to
   `https://workout.pablogeorge.org/api`. Point it at a debug server if you
   want to test against something other than production.

## Testing notes

- **Background location tracking cannot be tested in the Simulator** — it
  needs a real device. Foreground tracking (map + live stats while the app
  is open) should work in the Simulator with a simulated location (Debug >
  Location in Xcode / the Simulator menu).
- The Live Activity similarly needs a real device running iOS 16.1+ to see
  on the Lock Screen; the Dynamic Island specifically needs iPhone 14 Pro or
  newer (or the Simulator's Dynamic Island-capable device models).
- Sign-in requires the backend's `/login`, `/auth/google`, `/auth/apple`
  routes to actually redirect to `workoutapp://auth?token=...` for
  `?client=ios` requests — this is already wired up in
  `server/src/routes/auth.ts` (already pushed to the server).
