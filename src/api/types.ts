import type { RequestIdVariables } from "hono/request-id";

/** Hono environment shared by the app, its routers and handlers. */
export type AppEnv = { Variables: RequestIdVariables };
