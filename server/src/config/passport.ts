import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import AppleStrategy from "passport-apple";
import jwt from "jsonwebtoken";
import { prisma } from "../app.js";
import { APPLE_SIGNIN_ENABLED } from "./features.js";

passport.serializeUser((user: any, done) => {
  done(null, user.userId);
});

passport.deserializeUser(async (userId: string, done) => {
  try {
    const user = await prisma.userProfile.findUnique({ where: { userId } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ["openid", "profile", "email"],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const userId = profile.emails?.[0]?.value ?? profile.id;
        const displayName = profile.displayName ?? userId;
        const pictureUrl = profile.photos?.[0]?.value ?? null;

        const user = await prisma.userProfile.upsert({
          where: { userId },
          update: { pictureUrl },
          create: { userId, displayName, pictureUrl },
        });

        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);

if (APPLE_SIGNIN_ENABLED) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_SIGNIN_CLIENT_ID!,
        teamID: process.env.APPLE_SIGNIN_TEAM_ID!,
        keyID: process.env.APPLE_SIGNIN_KEY_ID!,
        privateKeyString: process.env.APPLE_SIGNIN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        callbackURL: process.env.APPLE_SIGNIN_CALLBACK_URL!,
        passReqToCallback: true,
      },
      async (req: any, _accessToken, _refreshToken, idToken, _profile, done) => {
        try {
          const claims = jwt.decode(idToken) as { sub: string; email?: string } | null;
          if (!claims?.sub) throw new Error("Apple id_token missing sub claim");

          const userId = claims.email ?? claims.sub;
          const namePart = req.appleProfile?.name;
          const displayName = namePart
            ? [namePart.firstName, namePart.lastName].filter(Boolean).join(" ")
            : undefined;

          const user = await prisma.userProfile.upsert({
            where: { userId },
            update: {},
            create: { userId, displayName: displayName ?? userId },
          });

          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
}
