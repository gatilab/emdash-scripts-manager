/**
 * Site-wide records: a port of MD_Scripts_Registry's sanitize_item(),
 * diagnostics(), active_items() ordering and md_scripts::item_markup().
 */
import { LIMITS } from "./defaults.js";
import { cleanId, escapeHtml, escapeScriptClose, escapeStyleClose, isBlank, safeAssetUrl, sanitizeText, sanitizeTextarea, str, toBool, utf8Bytes } from "./text.js";
import { RECORD_LOCATIONS, RECORD_STRATEGIES, RECORD_TYPES, type RecordLocation, type RecordStrategy, type RecordType, type SaveProblem, type ScriptRecord } from "./types.js";

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
	external_js: "External JavaScript",
	external_css: "External stylesheet",
	inline_js: "Inline JavaScript",
	inline_css: "Inline CSS",
	raw_html: "Raw HTML",
};

export const RECORD_LOCATION_LABELS: Record<RecordLocation, string> = {
	head: "Head",
	body_open: "Body start",
	footer: "Footer",
};

export const RECORD_STRATEGY_LABELS: Record<RecordStrategy, string> = {
	blocking: "Blocking",
	defer: "Defer",
	async: "Async",
	module: "Module",
};

const BLANK = { enabled: true, type: "external_js", location: "footer", priority: 10, strategy: "defer" } as const;

export const generateRecordId = (): string => `script-${crypto.randomUUID()}`;

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => ((list as readonly unknown[]).includes(value) ? (value as T) : fallback);

/**
 * Normalize a record the way WordPress did: unknown types fall back to
 * external JavaScript, external stylesheets always load in the head, and a
 * loading strategy only applies to external JavaScript. Code is kept exactly.
 */
export function normalizeRecord(input: Record<string, unknown>, existing?: ScriptRecord, meta: { user: string; now?: string } = { user: "" }): { record: ScriptRecord; problems: SaveProblem[] } {
	// blank_item() defaults, then the stored record, then the input.
	const merged: Record<string, unknown> = { ...BLANK, ...(existing ?? {}), ...input };
	const problems: SaveProblem[] = [];

	const id = existing?.id || cleanId(merged.id) || generateRecordId();
	const type = oneOf(RECORD_TYPES, merged.type, "external_js");
	let location = oneOf(RECORD_LOCATIONS, merged.location, "footer");
	if (type === "external_css") location = "head";
	let strategy = oneOf(RECORD_STRATEGIES, merged.strategy, "blocking");
	if (type !== "external_js") strategy = "blocking";

	const rawCode = merged.code;
	const code = typeof rawCode === "string" ? rawCode : typeof rawCode === "number" || typeof rawCode === "boolean" ? String(rawCode) : "";
	if (utf8Bytes(code) > LIMITS.recordBytes) problems.push({ field: "code", message: `Code is over the ${LIMITS.recordBytes / 1024} KiB limit.` });

	const rawUrl = str(merged.url).trim();
	const url = safeAssetUrl(rawUrl);
	if (rawUrl && !url) problems.push({ field: "url", message: "The URL must start with https://, http:// or /." });

	// absint(), then clamped to 0-999.
	const priority = Math.min(999, Math.trunc(Math.abs(Number(merged.priority))) || 0);

	const record: ScriptRecord = {
		id,
		name: sanitizeText(merged.name),
		description: sanitizeTextarea(merged.description),
		enabled: toBool(merged.enabled),
		type,
		url,
		code,
		location,
		priority,
		strategy,
		updatedAt: meta.now ?? new Date().toISOString(),
		updatedBy: meta.user,
	};
	for (const key of ["legacyId", "note"] as const) {
		const value = merged[key];
		if (typeof value === "string" && value) record[key] = value;
	}
	if (merged.legacy && typeof merged.legacy === "object") record.legacy = merged.legacy as ScriptRecord["legacy"];
	return { record, problems };
}

/** Enabled records, lowest priority first; ties keep a stable name, then id, order. */
export function activeRecords(records: readonly ScriptRecord[]): ScriptRecord[] {
	return records
		.filter((r) => r.enabled)
		.toSorted((a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The exact output for one administrator-owned record, or "" when there is nothing to print. */
export function recordMarkup(record: ScriptRecord): string {
	const id = escapeHtml(`md-script-${cleanId(record.id)}`);
	switch (record.type) {
		case "external_js": {
			if (!record.url) return "";
			const attr = record.strategy === "defer" ? " defer" : record.strategy === "async" ? " async" : record.strategy === "module" ? ' type="module"' : "";
			return `<script id="${id}" src="${escapeHtml(record.url)}"${attr}></script>`;
		}
		case "external_css":
			return record.url ? `<link id="${id}" rel="stylesheet" href="${escapeHtml(record.url)}" />` : "";
		case "inline_js":
			return isBlank(record.code) ? "" : `<script id="${id}">${escapeScriptClose(record.code)}</script>`;
		case "inline_css":
			return isBlank(record.code) ? "" : `<style id="${id}">${escapeStyleClose(record.code)}</style>`;
		case "raw_html":
			return isBlank(record.code) ? "" : `<!-- MD Script: ${escapeHtml(record.name)} -->\n${record.code}`;
	}
}

/** The registry's diagnostics(), with the WordPress-only dependency check dropped. */
export function recordDiagnostics(record: ScriptRecord, all: readonly ScriptRecord[] = []): string[] {
	const warnings: string[] = [];
	const url = record.url.trim();
	const code = record.code;
	if (record.type.startsWith("external_") && !url) warnings.push("External asset URL is missing.");
	if (record.type.startsWith("inline_") && isBlank(code)) warnings.push("Inline code is empty.");
	if (url && /^http:\/\//i.test(url)) warnings.push("The URL uses insecure HTTP.");
	if (record.type === "external_js" && record.location === "head" && record.strategy === "blocking") warnings.push("A blocking script in the head can delay rendering.");
	if (/document\.write/i.test(code)) warnings.push("document.write() can block rendering or replace the document.");
	if (record.type === "inline_js" && /<\/?script\b/i.test(code)) warnings.push("Remove the surrounding script tag from inline JavaScript.");
	if (record.type === "inline_css" && /<\/?style\b/i.test(code)) warnings.push("Remove the surrounding style tag from inline CSS.");
	if (url && all.some((other) => other.id !== record.id && other.url === url)) warnings.push("Another record uses the same asset URL.");
	if (record.note) warnings.push(record.note);
	return [...new Set(warnings)];
}
