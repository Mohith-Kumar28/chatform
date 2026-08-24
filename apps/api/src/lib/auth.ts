import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import type { Bindings } from "../env.js";

export function createAuth(env: Bindings) {
  const db = createDb(env.DB);
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema, usePlural: true }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    trustedOrigins: (request) => {
      const origin = request?.headers.get("origin");
      return origin ? [origin, env.APP_ORIGIN] : [env.APP_ORIGIN];
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
