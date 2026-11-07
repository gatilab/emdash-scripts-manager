/** Per-entry code: read, save, clear, list. */
import type { PluginContext } from "emdash";

import { EMPTY_ENTRY, LIMITS } from "../core/defaults.js";
import { entryDiagnostics, isEmptyEntry, normalizeEntry, pickEntry } from "../core/entry.js";
import type { EntryScripts, SaveProblem, StoredEntryScripts } from "../core/types.js";
import { entries, entryKey } from "./storage.js";

type Ctx = Pick<PluginContext, "storage">;

export async function getEntryScripts(ctx: Ctx, collection: string, id: string): Promise<StoredEntryScripts | null> {
	if (!collection || !id) return null;
	return entries(ctx).get(entryKey(collection, id));
}

export interface SaveResult {
	saved: boolean;
	/** True when the save emptied every field and the row was removed. */
	cleared: boolean;
	scripts: EntryScripts;
	problems: SaveProblem[];
	warnings: string[];
}

/**
 * Merge `input` into the entry's code and store it, or refuse the whole save
 * when a field is invalid. An all-empty result deletes the row.
 */
export async function saveEntryScripts(ctx: Ctx, collection: string, id: string, input: Record<string, unknown>, user: string, now = new Date().toISOString()): Promise<SaveResult> {
	const current = await getEntryScripts(ctx, collection, id);
	const { scripts, problems } = normalizeEntry(input, current ? pickEntry(current) : EMPTY_ENTRY);
	if (problems.length) return { saved: false, cleared: false, scripts, problems, warnings: [] };

	if (isEmptyEntry(scripts)) {
		await entries(ctx).delete(entryKey(collection, id));
		return { saved: true, cleared: true, scripts: { ...EMPTY_ENTRY, jsMode: scripts.jsMode, jsPlacement: scripts.jsPlacement }, problems, warnings: [] };
	}

	const row: StoredEntryScripts = { ...scripts, collection, entryId: id, updatedAt: now, updatedBy: user };
	if (current?.legacyWpId) row.legacyWpId = current.legacyWpId;
	await entries(ctx).put(entryKey(collection, id), row);
	return { saved: true, cleared: false, scripts, problems, warnings: entryDiagnostics(scripts) };
}

export async function deleteEntryScripts(ctx: Ctx, collection: string, id: string): Promise<boolean> {
	return entries(ctx).delete(entryKey(collection, id));
}

/** One page of entries with code, most recently changed first. */
export async function listEntryScripts(ctx: Ctx, options: { collection?: string; cursor?: string; limit?: number } = {}) {
	const page = await entries(ctx).query({
		where: options.collection ? { collection: options.collection } : undefined,
		orderBy: { updatedAt: "desc" },
		limit: Math.min(100, Math.max(1, options.limit ?? LIMITS.pageSize)),
		cursor: options.cursor || undefined,
	});
	return { items: page.items.map((i) => i.data), cursor: page.hasMore ? page.cursor : undefined };
}
