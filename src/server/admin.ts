/**
 * Administrator routes: the Block Kit admin page (`admin`) and a JSON API
 * for scripts, backups and the WordPress import. Every handler calls
 * requireAdmin() itself, on top of the `plugins:manage` permission EmDash
 * checks before dispatch.
 */
import { PluginRouteError } from "emdash";
import type { RouteContext } from "emdash";

import { parseInteraction, type BlockResponse } from "../admin/blocks.js";
import { PAGE_ACTIONS, pageBlocks, type EntryRow, type PageModel } from "../admin/page.js";
import { filledFields, pickEntry } from "../core/entry.js";
import { EXPORT_FORMAT, ImportFormatError } from "../core/importer.js";
import { recordDiagnostics } from "../core/records.js";
import { obj, str } from "../core/text.js";
import type { ScriptRecord, StoredEntryScripts } from "../core/types.js";
import { deleteEntryScripts, getEntryScripts, listEntryScripts, saveEntryScripts } from "./entries.js";
import { applyImport, type ImportResult } from "./importer.js";
import { deleteRecord, saveRecord, setRecordEnabled } from "./records.js";
import { allRecords, entries, readGlobal, records, requireAdmin } from "./storage.js";

type Ctx = RouteContext<unknown>;

const PLUGIN_VERSION_FORMAT = 1;

function target(input: Record<string, unknown>): { collection: string; id: string } {
	const collection = str(input.collection).trim();
	const id = str(input.id).trim();
	if (!collection || !id) throw new PluginRouteError("VALIDATION_ERROR", "Pass the entry's collection and id.", 400);
	return { collection, id };
}

/** "a=b, c=d" → { a: "b", c: "d" } */
export function parsePairs(value: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	for (const pair of str(value).split(/[,\n]/)) {
		const at = pair.indexOf("=");
		if (at <= 0) continue;
		const key = pair.slice(0, at).trim();
		const val = pair.slice(at + 1).trim();
		if (key && val) out[key] = val;
	}
	return out;
}

async function entryTitle(ctx: Ctx, row: StoredEntryScripts): Promise<string> {
	if (!ctx.content) return row.entryId;
	try {
		const item = await ctx.content.get(row.collection, row.entryId);
		if (!item) return `${row.entryId} (not found)`;
		const title = item.data?.title;
		return typeof title === "string" && title.trim() ? title : (item.slug ?? row.entryId);
	} catch {
		return row.entryId;
	}
}

function importReport(result: ImportResult): NonNullable<PageModel["importReport"]> {
	return {
		ok: true,
		title: `Imported ${result.entries.imported} ${result.entries.imported === 1 ? "entry" : "entries"} and ${result.records.imported} ${result.records.imported === 1 ? "record" : "records"}.`,
		lines: [
			{ label: "Global head", value: result.global.head },
			{ label: "Global footer", value: result.global.footer },
			{ label: "Entries kept (already had code)", value: String(result.entries.kept) },
			{ label: "Posts without a matching entry", value: result.entries.unmatched.map((u) => `${u.wpId} (${u.postType}/${u.slug || "no slug"})`).join(", ") || "None" },
			{ label: "Records kept (already imported)", value: String(result.records.kept) },
		],
		warnings: result.warnings,
	};
}

/** Build the page, with optional overrides for the record form and import report. */
async function renderPage(ctx: Ctx, extra: Partial<PageModel> = {}, entriesCursor?: string): Promise<BlockResponse["blocks"]> {
	const [global, recordList, entryPage, entryCount] = await Promise.all([readGlobal(ctx), allRecords(ctx), listEntryScripts(ctx, { cursor: entriesCursor }), entries(ctx).count()]);
	const rows: EntryRow[] = await Promise.all(
		entryPage.items.map(async (row) => ({ collection: row.collection, id: row.entryId, title: await entryTitle(ctx, row), fields: filledFields(pickEntry(row)), updatedAt: row.updatedAt })),
	);
	const sorted = recordList.toSorted((a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
	return pageBlocks({
		global,
		entryCount,
		entries: rows,
		entriesCursor: entryPage.cursor,
		records: sorted.map((record) => ({ record, warnings: recordDiagnostics(record, recordList) })),
		...extra,
	});
}

/** The Block Kit admin page. */
export async function adminPage(ctx: Ctx): Promise<BlockResponse> {
	const user = requireAdmin(ctx.user);
	const interaction = parseInteraction(ctx.input);

	if (interaction.type === "block_action") {
		const value = typeof interaction.value === "string" ? interaction.value : "";
		switch (interaction.action_id) {
			case PAGE_ACTIONS.entriesPage:
				return { blocks: await renderPage(ctx, {}, value || undefined) };
			case PAGE_ACTIONS.recordNew:
				return { blocks: await renderPage(ctx, { editing: {} }) };
			case PAGE_ACTIONS.recordEdit: {
				const record = value ? await records(ctx).get(value) : null;
				if (!record) return { blocks: await renderPage(ctx), toast: { message: "That record no longer exists.", type: "error" } };
				return { blocks: await renderPage(ctx, { editing: record }) };
			}
			case PAGE_ACTIONS.recordToggle: {
				const current = value ? await records(ctx).get(value) : null;
				const updated = current ? await setRecordEnabled(ctx, value, !current.enabled, user.id) : null;
				return { blocks: await renderPage(ctx), toast: updated ? { message: `"${updated.name}" is ${updated.enabled ? "on" : "off"}.`, type: "success" } : { message: "That record no longer exists.", type: "error" } };
			}
			case PAGE_ACTIONS.recordDelete: {
				const removed = value ? await deleteRecord(ctx, value) : false;
				return { blocks: await renderPage(ctx), toast: { message: removed ? "Record deleted." : "That record no longer exists.", type: removed ? "success" : "error" } };
			}
			default:
				return { blocks: await renderPage(ctx) };
		}
	}

	if (interaction.type === "form_submit") {
		const { action_id: action, values } = interaction;
		if (action === PAGE_ACTIONS.recordSave || action.startsWith(`${PAGE_ACTIONS.recordSave}:`)) {
			const id = action.slice(PAGE_ACTIONS.recordSave.length + 1);
			const input = { ...values, ...(id ? { id } : {}) };
			const result = await saveRecord(ctx, input, user.id);
			if (!result.record) {
				return { blocks: await renderPage(ctx, { editing: { ...(values as Partial<ScriptRecord>), ...(id ? { id } : {}) }, recordProblems: result.problems }), toast: { message: "Not saved.", type: "error" } };
			}
			const note = result.warnings.length ? ` Check: ${result.warnings.join(" ")}` : "";
			return { blocks: await renderPage(ctx), toast: { message: `Saved "${result.record.name}".${note}`, type: result.warnings.length ? "info" : "success" } };
		}
		if (action === PAGE_ACTIONS.import) {
			let payload: unknown;
			try {
				payload = JSON.parse(str(values.payload));
			} catch {
				return { blocks: await renderPage(ctx, { importReport: { ok: false, title: "That isn't valid JSON.", lines: [], warnings: [] } }), toast: { message: "Import failed.", type: "error" } };
			}
			try {
				const result = await applyImport(ctx, { payload, overwrite: values.overwrite === true, collections: parsePairs(values.collections), entries: parsePairs(values.entries) });
				return { blocks: await renderPage(ctx, { importReport: importReport(result) }), toast: { message: "Import finished.", type: "success" } };
			} catch (error) {
				if (!(error instanceof ImportFormatError)) throw error;
				return { blocks: await renderPage(ctx, { importReport: { ok: false, title: error.message, lines: [], warnings: [] } }), toast: { message: "Import failed.", type: "error" } };
			}
		}
	}

	return { blocks: await renderPage(ctx) };
}

/** JSON API. All bodies are JSON objects; all answers are JSON. */
export const adminRoutes: Record<string, (ctx: Ctx) => Promise<unknown>> = {
	/** `{ collection, id }` → the entry's code, or null. */
	"entries/get": async (ctx) => {
		requireAdmin(ctx.user);
		const { collection, id } = target(obj(ctx.input));
		const stored = await getEntryScripts(ctx, collection, id);
		return { scripts: stored };
	},

	/** `{ collection, id, css?, js?, jsMode?, jsPlacement?, headHtml?, footerHtml?, bodyClass? }`. Omitted fields keep their value. */
	"entries/save": async (ctx) => {
		const user = requireAdmin(ctx.user);
		const input = obj(ctx.input);
		const { collection, id } = target(input);
		const { collection: _c, id: _i, ...fields } = input;
		const result = await saveEntryScripts(ctx, collection, id, fields, user.id);
		if (!result.saved) throw new PluginRouteError("VALIDATION_ERROR", result.problems.map((p) => p.message).join(" "), 400, { problems: result.problems });
		return { scripts: result.scripts, cleared: result.cleared, warnings: result.warnings };
	},

	"entries/delete": async (ctx) => {
		requireAdmin(ctx.user);
		const { collection, id } = target(obj(ctx.input));
		return { removed: await deleteEntryScripts(ctx, collection, id) };
	},

	/** `{ collection?, cursor?, limit? }` → entries with code, newest change first. */
	"entries/list": async (ctx) => {
		requireAdmin(ctx.user);
		const input = obj(ctx.input);
		return listEntryScripts(ctx, { collection: str(input.collection) || undefined, cursor: str(input.cursor) || undefined, limit: Number(input.limit) || undefined });
	},

	"records/list": async (ctx) => {
		requireAdmin(ctx.user);
		const list = await allRecords(ctx);
		return { items: list.map((record) => ({ ...record, warnings: recordDiagnostics(record, list) })) };
	},

	/** A record without `id` (or with an unknown one) is created. */
	"records/save": async (ctx) => {
		const user = requireAdmin(ctx.user);
		const result = await saveRecord(ctx, obj(ctx.input), user.id);
		if (!result.record) throw new PluginRouteError("VALIDATION_ERROR", result.problems.map((p) => p.message).join(" "), 400, { problems: result.problems });
		return result;
	},

	"records/delete": async (ctx) => {
		requireAdmin(ctx.user);
		return { removed: await deleteRecord(ctx, str(obj(ctx.input).id)) };
	},

	/** Everything this plugin stores, as one JSON document. */
	export: async (ctx) => {
		requireAdmin(ctx.user);
		const all: StoredEntryScripts[] = [];
		let cursor: string | undefined;
		do {
			const page = await entries(ctx).query({ limit: 100, cursor });
			for (const item of page.items) all.push(item.data);
			cursor = page.hasMore ? page.cursor : undefined;
		} while (cursor);
		return { format: "emdash-scripts-manager", version: PLUGIN_VERSION_FORMAT, exportedAt: new Date().toISOString(), global: await readGlobal(ctx), records: await allRecords(ctx), entries: all };
	},

	/**
	 * WordPress import: `{ payload, overwrite?, collections?, entries? }`, or
	 * the export file itself as the body.
	 */
	import: async (ctx) => {
		requireAdmin(ctx.user);
		const input = obj(ctx.input);
		const payload = input.format === EXPORT_FORMAT || input.format === "md-scripts-manager" ? input : input.payload;
		try {
			return await applyImport(ctx, { payload, overwrite: input.overwrite === true, collections: obj(input.collections) as Record<string, string>, entries: obj(input.entries) });
		} catch (error) {
			if (error instanceof ImportFormatError) throw new PluginRouteError("VALIDATION_ERROR", error.message, 400);
			throw error;
		}
	},
};
