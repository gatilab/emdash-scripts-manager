/**
 * Hooks: `page:fragments` puts the code on pages; `content:afterDelete`
 * drops an entry's code when the entry is permanently deleted.
 */
import type { ContentDeleteEvent, PageFragmentEvent, PluginContext } from "emdash";

import { pickEntry } from "../core/entry.js";
import { buildFragments } from "../core/render.js";
import type { Fragment } from "../core/types.js";
import { getEntryScripts } from "./entries.js";
import { enabledRecords, entries, entryKey, readGlobal } from "./storage.js";

/**
 * Global code, enabled records, and the rendered entry's code when the page
 * context names one (`page.content`). EmDash renders these through
 * `<EmDashHead>`, `<EmDashBodyStart>` and `<EmDashBodyEnd>`.
 */
export async function pageFragments(event: PageFragmentEvent, ctx: PluginContext): Promise<Fragment[]> {
	const content = event.page.content;
	const [global, records, stored] = await Promise.all([readGlobal(ctx), enabledRecords(ctx), content ? getEntryScripts(ctx, content.collection, content.id) : Promise.resolve(null)]);
	return buildFragments({ global, records, entry: stored ? pickEntry(stored) : null });
}

export async function afterDelete(event: ContentDeleteEvent, ctx: PluginContext): Promise<void> {
	// Trashed entries can be restored with their code; only a permanent delete drops it.
	if (!event.permanent) return;
	await entries(ctx).delete(entryKey(event.collection, event.id));
}
