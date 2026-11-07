/**
 * WordPress import, the writing half. Resolves each WordPress post to an
 * EmDash entry (an explicit map first, then the post's slug in its mapped
 * collection, as EmDash's own WordPress importer keeps slugs), then writes.
 *
 * Safe to run twice: entries that already have code, global fields that are
 * already set and records already imported (by WordPress id) are left alone
 * unless `overwrite` is true.
 */
import type { PluginContext } from "emdash";

import { LIMITS, SETTING_KEYS } from "../core/defaults.js";
import { pickEntry } from "../core/entry.js";
import { planImport, type ImportPlan } from "../core/importer.js";
import { isBlank, obj, str } from "../core/text.js";
import type { GlobalScripts, ScriptRecord, StoredEntryScripts } from "../core/types.js";
import { allRecords, entries, entryKey, readGlobal, records } from "./storage.js";

type Ctx = Pick<PluginContext, "storage" | "settings" | "content" | "log">;

export interface ImportInput {
	payload: unknown;
	overwrite?: boolean;
	/** WordPress post type → collection slug. */
	collections?: Record<string, string>;
	/** WordPress post id → `"collection:entryId"` (or `{ collection, id }`), over slug matching. */
	entries?: Record<string, unknown>;
}

export interface ImportResult {
	global: Record<"head" | "footer", "imported" | "kept" | "none">;
	entries: { imported: number; kept: number; unmatched: { wpId: number; postType: string; slug: string; collection: string }[] };
	records: { imported: number; kept: number };
	skipped: ImportPlan["skipped"];
	warnings: string[];
}

function explicitTarget(value: unknown): { collection: string; id: string } | null {
	if (typeof value === "string") {
		const at = value.indexOf(":");
		return at > 0 && at < value.length - 1 ? { collection: value.slice(0, at), id: value.slice(at + 1) } : null;
	}
	const o = obj(value);
	return str(o.collection) && str(o.id) ? { collection: str(o.collection), id: str(o.id) } : null;
}

/** slug → entry id for one collection, built once per import. */
async function slugIndex(ctx: Ctx, collection: string, warnings: string[]): Promise<Map<string, string>> {
	const index = new Map<string, string>();
	if (!ctx.content) return index;
	try {
		let cursor: string | undefined;
		for (let page = 0; page < 500; page++) {
			const res = await ctx.content.list(collection, { limit: 100, cursor });
			for (const item of res.items) if (item.slug && !index.has(item.slug)) index.set(item.slug, item.id);
			cursor = res.cursor;
			if (!cursor || !res.items.length) break;
		}
	} catch (error) {
		warnings.push(`Could not list the "${collection}" collection (${error instanceof Error ? error.message : String(error)}). Map its posts with "entries" or "collections".`);
	}
	return index;
}

export async function applyImport(ctx: Ctx, input: ImportInput, now = new Date().toISOString()): Promise<ImportResult> {
	const plan = planImport(input.payload, { collections: input.collections }, { now });
	const overwrite = input.overwrite === true;
	const warnings = [...plan.warnings];
	const result: ImportResult = {
		global: { head: "none", footer: "none" },
		entries: { imported: 0, kept: 0, unmatched: [] },
		records: { imported: 0, kept: 0 },
		skipped: plan.skipped,
		warnings,
	};

	// Global code.
	const current = await readGlobal(ctx);
	for (const field of ["head", "footer"] as const satisfies (keyof GlobalScripts)[]) {
		const incoming = plan.global[field];
		if (incoming === undefined) continue;
		if (!isBlank(current[field]) && !overwrite && current[field] !== incoming) {
			result.global[field] = "kept";
			warnings.push(`Global ${field} code is already set here and was kept. Import with overwrite to replace it.`);
			continue;
		}
		await ctx.settings.set(SETTING_KEYS[field], incoming);
		result.global[field] = "imported";
	}

	// Per-entry code.
	const explicit = obj(input.entries);
	const indexes = new Map<string, Map<string, string>>();
	for (const planned of plan.entries) {
		let target = explicitTarget(explicit[String(planned.wpId)]);
		if (!target && planned.slug) {
			let index = indexes.get(planned.collection);
			if (!index) {
				index = await slugIndex(ctx, planned.collection, warnings);
				indexes.set(planned.collection, index);
			}
			const id = index.get(planned.slug);
			if (id) target = { collection: planned.collection, id };
		}
		if (!target) {
			result.entries.unmatched.push({ wpId: planned.wpId, postType: planned.postType, slug: planned.slug, collection: planned.collection });
			continue;
		}
		const key = entryKey(target.collection, target.id);
		const existing = await entries(ctx).get(key);
		if (existing && !overwrite) {
			result.entries.kept++;
			continue;
		}
		const row: StoredEntryScripts = { ...pickEntry(planned.scripts), collection: target.collection, entryId: target.id, updatedAt: now, updatedBy: "import" };
		if (planned.wpId) row.legacyWpId = planned.wpId;
		await entries(ctx).put(key, row);
		result.entries.imported++;
	}
	if (result.entries.unmatched.length) warnings.push(`${result.entries.unmatched.length} WordPress ${result.entries.unmatched.length === 1 ? "post" : "posts"} with code had no matching entry. Pass an "entries" map (WordPress id → "collection:entryId") and import again.`);

	// Records: merge, keyed by their WordPress id.
	const existing = await allRecords(ctx);
	const byLegacy = new Map(existing.filter((r) => r.legacyId).map((r) => [r.legacyId!, r] as const));
	let count = existing.length;
	for (const record of plan.records) {
		const previous = record.legacyId ? byLegacy.get(record.legacyId) : undefined;
		if (previous && !overwrite) {
			result.records.kept++;
			continue;
		}
		if (!previous && count >= LIMITS.records) {
			warnings.push(`Stopped at ${LIMITS.records} records.`);
			break;
		}
		const row: ScriptRecord = previous ? { ...record, id: previous.id } : record;
		await records(ctx).put(row.id, row);
		if (!previous) count++;
		result.records.imported++;
	}
	return result;
}
