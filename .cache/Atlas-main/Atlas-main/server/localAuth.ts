// Local authentication configuration
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import type { User } from "@shared/schema";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET must be configured');
  }
  const secureCookies = process.env.NODE_ENV === 'production';
  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: secureCookies,
      maxAge: sessionTtl,
      sameSite: 'lax',
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Passport Local Strategy with email as username
  passport.use(
    new LocalStrategy(
      {
        usernameField: "identifier",
        passwordField: "password",
      },
      async (identifier, password, done) => {
        try {
          const trimmed = identifier.trim();
          if (!trimmed) {
            return done(null, false, { message: "Invalid email or username" });
          }

          const possibleEmail = trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;

          let user: User | undefined = undefined;
          if (trimmed.includes("@")) {
            user = await storage.getUserByEmail(possibleEmail);
            if (!user) {
              user = await storage.getUserByUsername(trimmed);
            }
          } else {
            user = await storage.getUserByUsername(trimmed);
            if (!user) {
              user = await storage.getUserByEmail(possibleEmail.toLowerCase());
            }
          }

          if (!user) {
            return done(null, false, { message: "Invalid email/username or password" });
          }

          const bcrypt = await import("bcryptjs");
          if (!user.password) {
            return done(null, false, { message: "Password authentication is not enabled for this account" });
          }

          const isValid = bcrypt.compareSync(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid email/username or password" });
          }

          const status = user.status ?? 'active';
          if (status !== 'active') {
            return done(null, false, {
              message: status === 'suspended'
                ? 'Account suspended. Please contact support.'
                : 'Account is inactive. Please contact support.',
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Serialize user to session (store only user ID)
  passport.serializeUser((user: any, cb) => {
    cb(null, user.id);
  });

  // Deserialize user from session (load full user object)
  passport.deserializeUser(async (id: string, cb) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return cb(new Error("User not found"));
      }
      cb(null, user);
    } catch (error) {
      cb(error);
    }
  });
}

// Middleware to check if user is authenticated
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
