import { Hono } from "hono";
import type { Bindings } from "../../env.js";
import { requirePlatformAdmin, type PlatformAdminVars } from "../../lib/platform-admin.js";
import { coreRouter } from "./core.js";
import { productRouter } from "./product.js";
import { revenueRouter } from "./revenue.js";
import { aiRouter } from "./ai.js";
import { healthRouter } from "./health.js";
import { opsRouter } from "./ops.js";

/**
 * The platform console — the founders' view of the whole business.
 *
 * Every other router in this tree narrows to one organization before it touches
 * the database. This one deliberately does not, which makes it the single most
 * dangerous surface in the product and explains four things about it:
 *
 *   - The guard is declared **once, here**, on `/admin/*`. Sub-routers carry no
 *     guard of their own, so a new file added to this directory cannot ship
 *     ungated by forgetting a line — the only way to reach any of it is through
 *     this mount.
 *   - `requirePlatformAdmin` answers 404, not 403, so a signed-in customer
 *     poking at these paths cannot even learn that the console exists.
 *   - It never mounts `requireOrg`. Not an oversight: an org-scoped guard here
 *     would silently narrow the very queries whose job is to be global.
 *   - It reads form *structure* and never form *content* — block types, sizes
 *     and question wording, never an answer and never a respondent. What people
 *     build is a product signal; what their customers typed is not ours to
 *     browse.
 *
 * Mounted under `/api`, so `INTERNAL_PREFIXES` in `lib/openapi.ts` already
 * stamps every operation `x-internal: true` and the public spec and docs never
 * mention it. The committed `openapi.json` still carries them, which is what
 * lets orval generate the console's typed client.
 */
export const adminRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

adminRouter.use("/admin/*", requirePlatformAdmin);

adminRouter.route("/", coreRouter);
adminRouter.route("/", productRouter);
adminRouter.route("/", revenueRouter);
adminRouter.route("/", aiRouter);
adminRouter.route("/", healthRouter);
adminRouter.route("/", opsRouter);
