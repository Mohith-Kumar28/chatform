import type { Bindings } from "./env.js";
import { createApp } from "./app.js";
import { SessionDO } from "./do/session-do.js";

export { SessionDO };

const app = createApp();

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(_batch: MessageBatch, _env: Bindings, _ctx: ExecutionContext): Promise<void> {
    // queue consumers wired in M6/M8
  },
  async scheduled(_controller: ScheduledController, _env: Bindings, _ctx: ExecutionContext): Promise<void> {
    // cron sweeps wired in M6/M9
  },
} satisfies ExportedHandler<Bindings>;
