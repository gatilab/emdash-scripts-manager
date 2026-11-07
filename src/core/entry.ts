/**
 * Per-entry code: input validation and diagnostics.
 *
 * Validation never edits code. A value is either stored exactly as entered
 * or the whole save is refused with a reason.
 */
import { EMPTY_ENTRY, FIELD_LABELS, LIMITS } from "./defaults.js";
import { classTokens, isBlank, utf8Bytes } from "./text.js";
import { ENTRY_TEXT_FIELDS, JS_MODES, JS_PLACEMENTS, type EntryScripts, type JsMode, type JsPlacement, type SaveProblem } from "./types.js";

const has = (input: Record<string, unknown>, key: string) => Object.hasOwn(input, key);

/**
 * Merge `input` over `existing`. Fields missing from `input` keep their
 * current value; a field set to `null` is cleared.
 */
export function normalizeEntry(input: Record<string, unknown>, existing: EntryScripts = EMPTY_ENTRY): { scripts: EntryScripts; problems: SaveProblem[] } {
	const problems: SaveProblem[] = [];
	const scripts: EntryScripts = { ...EMPTY_ENTRY, ...pickEntry(existing) };

	for (const field of ENTRY_TEXT_FIELDS) {
		if (!has(input, field)) continue;
		const value = input[field];
		if (value === null || value === undefined) scripts[field] = "";
		else if (typeof value === "string") scripts[field] = value;
		else problems.push({ field, message: `${FIELD_LABELS[field]} must be text.` });
	}

	if (has(input, "jsMode")) {
		const mode = input.jsMode;
		if ((JS_MODES as readonly unknown[]).includes(mode)) scripts.jsMode = mode as JsMode;
		else problems.push({ field: "jsMode", message: `JavaScript type must be one of: ${JS_MODES.join(", ")}.` });
	}
	if (has(input, "jsPlacement")) {
		const placement = input.jsPlacement;
		if ((JS_PLACEMENTS as readonly unknown[]).includes(placement)) scripts.jsPlacement = placement as JsPlacement;
		else problems.push({ field: "jsPlacement", message: `JavaScript placement must be one of: ${JS_PLACEMENTS.join(", ")}.` });
	}

	let total = 0;
	for (const field of ENTRY_TEXT_FIELDS) {
		const bytes = utf8Bytes(scripts[field]);
		total += bytes;
		if (bytes > LIMITS.fieldBytes) problems.push({ field, message: `${FIELD_LABELS[field]} is ${kib(bytes)}; the limit is ${kib(LIMITS.fieldBytes)}.` });
	}
	if (total > LIMITS.entryBytes) problems.push({ field: "*", message: `All fields together are ${kib(total)}; the limit is ${kib(LIMITS.entryBytes)}.` });

	return { scripts, problems };
}

/** Only the EntryScripts keys of a stored row. */
export function pickEntry(value: Partial<EntryScripts>): EntryScripts {
	return {
		css: value.css ?? "",
		js: value.js ?? "",
		jsMode: value.jsMode ?? "classic",
		jsPlacement: value.jsPlacement ?? "footer",
		headHtml: value.headHtml ?? "",
		footerHtml: value.footerHtml ?? "",
		bodyClass: value.bodyClass ?? "",
	};
}

/** True when nothing would be emitted for the entry. */
export function isEmptyEntry(scripts: EntryScripts): boolean {
	return ENTRY_TEXT_FIELDS.every((field) => isBlank(scripts[field]));
}

/** Which fields hold something, for lists and summaries. */
export function filledFields(scripts: EntryScripts): string[] {
	return ENTRY_TEXT_FIELDS.filter((field) => !isBlank(scripts[field])).map((field) => FIELD_LABELS[field]);
}

/** Warnings shown next to the fields: nothing here blocks a save. */
export function entryDiagnostics(scripts: EntryScripts): string[] {
	const warnings: string[] = [];
	if (/<\/?style\b/i.test(scripts.css)) warnings.push("Custom CSS: remove the surrounding <style> tag. Any </style> inside is written as <\\/style> so it can't close the element.");
	if (/<\/?script\b/i.test(scripts.js)) warnings.push("JavaScript: remove the surrounding <script> tag. Any </script> inside is written as <\\/script> so it can't close the element.");
	for (const [label, code] of [["JavaScript", scripts.js], ["Head HTML", scripts.headHtml], ["Footer HTML", scripts.footerHtml]] as const) {
		if (/document\.write\s*\(/.test(code)) warnings.push(`${label}: document.write() can block rendering or replace the document.`);
	}
	if (/<(?:body|html)\b/i.test(scripts.headHtml) || /<(?:body|html)\b/i.test(scripts.footerHtml)) warnings.push("Head or Footer HTML contains an <html> or <body> tag, which belongs to the theme.");
	if (!isBlank(scripts.js) && scripts.jsMode === "defer") warnings.push("Deferred inline JavaScript loads from a data: URL. A Content-Security-Policy must allow data: in script-src.");
	const { invalid } = classTokens(scripts.bodyClass);
	if (invalid.length) warnings.push(`Body classes: ${invalid.join(", ")} ${invalid.length === 1 ? "isn't a valid class name and is" : "aren't valid class names and are"} left out.`);
	return warnings;
}

const kib = (bytes: number) => `${Math.ceil(bytes / 1024)} KiB`;
