/**
 * Server-side helper for the Astro components: ask EmDash for this page's
 * fragments (which runs this plugin's `page:fragments` hook) and keep only
 * the ones this plugin contributed, for one placement.
 */
import type { PublicPageContext } from "emdash";

import { ownFragments, renderPlacement } from "../core/render.js";
import type { Placement } from "../core/types.js";

type Collect = (page: PublicPageContext) => Promise<readonly { kind: string; placement: string; key?: string; html?: string }[]>;

export async function scriptsFor(locals: unknown, page: PublicPageContext, placement: Placement): Promise<string> {
	const collect = (locals as { emdash?: { collectPageFragments?: Collect } } | undefined)?.emdash?.collectPageFragments;
	if (typeof collect !== "function") return "";
	try {
		return renderPlacement(ownFragments(await collect(page), placement), placement);
	} catch (error) {
		console.warn("[scripts-manager] could not collect page fragments", error);
		return "";
	}
}
