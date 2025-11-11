// Local authentication configuration
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import createMemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage/index.js";
import type { User } from "../shared/schema.js";
import { pool } from "./db.js";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  // Prefer Postgres session store using the same pool as the app.
  // If that isn't possible (missing DB envs in local dev), fall back to MemoryStore
  // so the UI can at least load and allow login for the current process lifetime.
  let sessionStore: session.Store;
  try {
    sessionStore = new pgStore({
      pool,
      createTableIfMissing: true,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  } catch {
    const MemoryStore = createMemoryStore(session);
    sessionStore = new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 });
    console.warn("Falling back to in-memory session store. Configure DATABASE_URL to enable persistent sessions.");
  }

  const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-temporary-session-secret' : undefined);
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
