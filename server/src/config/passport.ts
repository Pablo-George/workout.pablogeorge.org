import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "../app.js";

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
          update: { displayName, pictureUrl },
          create: { userId, displayName, pictureUrl },
        });

        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    }
  )
);
