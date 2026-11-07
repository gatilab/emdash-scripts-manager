/**
 * The Scripts admin page (Plugins › Scripts Manager): what has code, the
 * site-wide records, and the WordPress import.
 */
import { RECORD_LOCATION_LABELS, RECORD_STRATEGY_LABELS, RECORD_TYPE_LABELS } from "../core/records.js";
import type { GlobalScripts, SaveProblem, ScriptRecord } from "../core/types.js";
import { clip, select, textInput, type Block, type FormField } from "./blocks.js";

export const PAGE_ACTIONS = {
	entriesPage: "entries_page",
	recordsPage: "records_page",
	recordNew: "record_new",
	recordEdit: "record_edit",
	recordToggle: "record_toggle",
	recordDelete: "record_delete",
	recordSave: "record_save",
	cancel: "cancel",
	import: "import",
} as const;

export interface EntryRow {
	collection: string;
	id: string;
	title: string;
	fields: string[];
	updatedAt: string;
}

export interface RecordRow {
	record: ScriptRecord;
	warnings: string[];
}

export interface PageModel {
	global: GlobalScripts;
	entryCount: number;
	entries: EntryRow[];
	entriesCursor?: string;
	records: RecordRow[];
	/** Show the record form: a record to edit, or `{}` for a new one. */
	editing?: Partial<ScriptRecord> | null;
	recordProblems?: SaveProblem[];
	importReport?: { title: string; lines: { label: string; value: string }[]; warnings: string[]; ok: boolean } | null;
}

function globalSummary(global: GlobalScripts): string {
	const set = [global.head.trim() && "Head", global.bodyStart.trim() && "Body start", global.footer.trim() && "Footer"].filter(Boolean);
	return set.length ? set.join(", ") : "None";
}

export function recordForm(editing: Partial<ScriptRecord>, problems: SaveProblem[] = []): Block[] {
	const fields: FormField[] = [
		textInput("name", "Name", editing.name ?? "", { placeholder: "Plausible analytics" }),
		select("type", "Type", RECORD_TYPE_LABELS, editing.type ?? "external_js"),
		textInput("url", "URL (external types)", editing.url ?? "", { placeholder: "https://cdn.example.com/script.js" }),
		textInput("code", "Code (inline and raw HTML types)", editing.code ?? "", { multiline: true }),
		select("location", "Location", RECORD_LOCATION_LABELS, editing.location ?? "footer"),
		select("strategy", "Loading (external JavaScript)", RECORD_STRATEGY_LABELS, editing.strategy ?? "defer"),
		{ type: "number_input", action_id: "priority", label: "Priority (lower runs first)", initial_value: editing.priority ?? 10, min: 0, max: 999 },
		{ type: "toggle", action_id: "enabled", label: "Enabled", initial_value: editing.enabled ?? true },
		textInput("description", "Notes", editing.description ?? "", { multiline: true }),
	];
	const blocks: Block[] = [];
	if (problems.length) blocks.push({ type: "banner", variant: "error", title: "Not saved", description: problems.map((p) => p.message).join(" ") });
	blocks.push({
		type: "form",
		block_id: "record-form",
		fields,
		submit: { label: editing.id ? "Save record" : "Add record", action_id: editing.id ? `${PAGE_ACTIONS.recordSave}:${editing.id}` : PAGE_ACTIONS.recordSave },
	});
	blocks.push({ type: "actions", elements: [{ type: "button", action_id: PAGE_ACTIONS.cancel, label: "Cancel", style: "secondary" }] });
	return blocks;
}

export function importBlocks(report: PageModel["importReport"]): Block[] {
	const blocks: Block[] = [];
	if (report) {
		const description = report.warnings.join(" ");
		blocks.push({ type: "banner", variant: report.ok ? "default" : "error", title: report.title, ...(description ? { description } : {}) });
		if (report.lines.length) blocks.push({ type: "fields", fields: report.lines });
	}
	blocks.push(
		{
			type: "context",
			text: "Run wordpress/export-scripts-manager.php with WP-CLI (wp eval-file export-scripts-manager.php > scripts.json) and paste the file here. The drop-in's own Scripts Manager export works too. Posts are matched to entries by slug; larger files can be posted to the plugin's import route instead.",
		},
		{
			type: "form",
			block_id: "import-form",
			fields: [
				textInput("payload", "Export JSON", "", { multiline: true }),
				textInput("collections", "Post type → collection (optional)", "", { placeholder: "post=posts, page=pages, product=products" }),
				textInput("entries", "WordPress id → entry (optional)", "", { placeholder: "42=pages:01JABC…, 57=posts:01JDEF…" }),
				{ type: "toggle", action_id: "overwrite", label: "Replace code that already exists here", initial_value: false },
			],
			submit: { label: "Import", action_id: PAGE_ACTIONS.import },
		},
	);
	return blocks;
}

export function pageBlocks(model: PageModel): Block[] {
	const enabled = model.records.filter((r) => r.record.enabled).length;
	const blocks: Block[] = [
		{ type: "header", text: "Scripts Manager" },
		{
			type: "stats",
			items: [
				{ label: "Entries with code", value: model.entryCount },
				{ label: "Site-wide records", value: `${enabled} of ${model.records.length} on` },
				{ label: "Global code", value: globalSummary(model.global) },
			],
		},
		{
			type: "section",
			text: "Global head, body-start and footer code is in the plugin settings. Per-entry code is in the Scripts panel beside each saved entry.",
			accessory: { type: "link", label: "Edit global code", target: { kind: "plugin-settings" }, appearance: "secondary" },
		},
		{ type: "divider" },
		{ type: "header", text: "Entries with custom code" },
		{
			type: "table",
			block_id: "entries",
			columns: [
				{ key: "entry", label: "Entry", format: "element" },
				{ key: "collection", label: "Collection" },
				{ key: "fields", label: "Code" },
				{ key: "updated", label: "Updated", format: "relative_time" },
			],
			rows: model.entries.map((e) => ({
				entry: { type: "link", label: clip(e.title || e.id, 80), target: { kind: "content", collection: e.collection, id: e.id } },
				collection: e.collection,
				fields: e.fields.join(", "),
				updated: e.updatedAt,
			})),
			...(model.entriesCursor ? { next_cursor: model.entriesCursor } : {}),
			page_action_id: PAGE_ACTIONS.entriesPage,
			empty_text: "No entry has custom code yet.",
		},
		{ type: "divider" },
		{ type: "header", text: "Site-wide records" },
		{ type: "context", text: "Named snippets that load on every page, lowest priority first, after the global code. Imported WordPress records that were consent-gated or conditional arrive disabled." },
	];

	if (model.editing) blocks.push(...recordForm(model.editing, model.recordProblems));
	else blocks.push({ type: "actions", elements: [{ type: "button", action_id: PAGE_ACTIONS.recordNew, label: "Add record", style: "primary" }] });

	blocks.push({
		type: "table",
		block_id: "records",
		columns: [
			{ key: "name", label: "Name" },
			{ key: "type", label: "Type" },
			{ key: "location", label: "Location" },
			{ key: "priority", label: "Priority", format: "number" },
			{ key: "status", label: "Status", format: "badge" },
			{ key: "warnings", label: "Warnings" },
			{ key: "edit", label: "", format: "element" },
			{ key: "toggle", label: "", format: "element" },
			{ key: "delete", label: "", format: "element" },
		],
		rows: model.records.map(({ record, warnings }) => ({
			name: clip(record.name || record.id, 80),
			type: RECORD_TYPE_LABELS[record.type],
			location: RECORD_LOCATION_LABELS[record.location],
			priority: record.priority,
			status: record.enabled ? "On" : "Off",
			warnings: clip(warnings.join(" "), 160),
			edit: { type: "button", action_id: PAGE_ACTIONS.recordEdit, label: "Edit", value: record.id },
			toggle: { type: "button", action_id: PAGE_ACTIONS.recordToggle, label: record.enabled ? "Turn off" : "Turn on", value: record.id },
			delete: {
				type: "button",
				action_id: PAGE_ACTIONS.recordDelete,
				label: "Delete",
				style: "danger",
				value: record.id,
				confirm: { title: `Delete "${clip(record.name || record.id, 60)}"?`, text: "The record stops loading on every page and can't be restored.", confirm: "Delete", deny: "Cancel", style: "danger" },
			},
		})),
		page_action_id: PAGE_ACTIONS.recordsPage,
		empty_text: "No site-wide records.",
	});

	blocks.push({ type: "divider" }, { type: "accordion", label: "Import from WordPress", default_open: Boolean(model.importReport), blocks: importBlocks(model.importReport) });
	return blocks;
}
