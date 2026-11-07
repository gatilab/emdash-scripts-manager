/**
 * Astro components for themes that don't render EmDash's own
 * `<EmDashHead>`, `<EmDashBodyStart>` and `<EmDashBodyEnd>` (those already
 * print this plugin's code). Each takes the page's `PublicPageContext`;
 * include `content: { collection, id }` so the entry's code is added.
 *
 * ```astro
 * ---
 * import { createPublicPageContext } from "emdash/page";
 * import { ScriptsHead, ScriptsBodyStart, ScriptsBodyEnd } from "@gatilab/emdash-scripts-manager/astro";
 * const page = createPublicPageContext({ Astro, kind: "content", content: { collection: "posts", id: post.id } });
 * ---
 * <html>
 *   <head><ScriptsHead page={page} /></head>
 *   <body>
 *     <ScriptsBodyStart page={page} />
 *     <slot />
 *     <ScriptsBodyEnd page={page} />
 *   </body>
 * </html>
 * ```
 */
import ScriptsBodyEnd from "./ScriptsBodyEnd.astro";
import ScriptsBodyStart from "./ScriptsBodyStart.astro";
import ScriptsHead from "./ScriptsHead.astro";

export { ScriptsBodyEnd, ScriptsBodyStart, ScriptsHead };
export { scriptsFor } from "./collect.js";
