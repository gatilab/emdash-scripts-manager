/**
 * Output order. One function decides what a page gets and in which order,
 * so the `page:fragments` hook and the Astro components can't disagree.
 *
 * Rule: site-wide before entry-specific, and within an entry, markup first,
 * then the entry's CSS, then its JavaScript. So an entry's CSS overrides
 * stylesheets linked above it, and its script runs after markup it may use.
 *
 *   head        global head → records (head) → entry head HTML → entry CSS → entry JS (placement "head")
 *   body:start  entry body classes → global body start → records (body start)
 *   body:end    global footer → records (footer) → entry footer HTML → entry JS (placement "footer")
 *
 * Records run lowest priority first. Empty fields print nothing.
 */
import { KEY_PREFIX } from "./defaults.js";
import { activeRecords, recordMarkup } from "./records.js";
import { base64Utf8, classTokens, escapeScriptClose, escapeStyleClose, isBlank } from "./text.js";
import type { EntryScripts, Fragment, GlobalScripts, Placement, RecordLocation, ScriptRecord } from "./types.js";

export interface FragmentInput {
	global: GlobalScripts;
	records?: readonly ScriptRecord[];
	/** The current entry's code, or null on pages that aren't an entry. */
	entry?: EntryScripts | null;
}

const RECORD_PLACEMENT: Record<RecordLocation, Placement> = {
	head: "head",
	body_open: "body:start",
	footer: "body:end",
};

export function entryCssTag(css: string): string {
	return isBlank(css) ? "" : `<style id="scripts-manager-entry-css">${escapeStyleClose(css)}</style>`;
}

/**
 * `classic` runs in place; `module` is `type="module"` (deferred, strict,
 * own scope). Inline scripts ignore `defer`, so `defer` loads the code from
 * a `data:` URL, which a script with `src` can defer.
 */
export function entryJsTag(js: string, mode: EntryScripts["jsMode"]): string {
	if (isBlank(js)) return "";
	if (mode === "defer") return `<script id="scripts-manager-entry-js" defer src="data:text/javascript;base64,${base64Utf8(js)}"></script>`;
	const type = mode === "module" ? ' type="module"' : "";
	return `<script id="scripts-manager-entry-js"${type}>${escapeScriptClose(js)}</script>`;
}

/** Classes go on `<body>` from a one-line script at the very start of the body. */
export function bodyClassTag(bodyClass: string): string {
	const { valid } = classTokens(bodyClass);
	if (!valid.length) return "";
	return `<script id="scripts-manager-body-class">document.body.classList.add(${valid.map((c) => JSON.stringify(c)).join(",")})</script>`;
}

export function buildFragments({ global, records = [], entry = null }: FragmentInput): Fragment[] {
	const out: Fragment[] = [];
	const push = (placement: Placement, key: string, html: string) => {
		if (!isBlank(html)) out.push({ kind: "html", placement, key: `${KEY_PREFIX}${key}`, html });
	};
	const active = activeRecords(records);
	const pushRecords = (location: RecordLocation) => {
		for (const record of active) if (record.location === location) push(RECORD_PLACEMENT[location], `record:${record.id}`, recordMarkup(record));
	};

	push("head", "global:head", global.head);
	pushRecords("head");
	if (entry) {
		push("head", "entry:head-html", entry.headHtml);
		push("head", "entry:css", entryCssTag(entry.css));
		if (entry.jsPlacement === "head") push("head", "entry:js", entryJsTag(entry.js, entry.jsMode));
	}

	if (entry) push("body:start", "entry:body-class", bodyClassTag(entry.bodyClass));
	push("body:start", "global:body-start", global.bodyStart);
	pushRecords("body_open");

	push("body:end", "global:footer", global.footer);
	pushRecords("footer");
	if (entry) {
		push("body:end", "entry:footer-html", entry.footerHtml);
		if (entry.jsPlacement !== "head") push("body:end", "entry:js", entryJsTag(entry.js, entry.jsMode));
	}
	return out;
}

/** Fragments this plugin contributed (by key prefix), for one placement, in order. */
export function ownFragments(fragments: readonly { kind: string; placement: string; key?: string; html?: string }[], placement: Placement): Fragment[] {
	return fragments.filter((f): f is Fragment => f.kind === "html" && f.placement === placement && typeof f.html === "string" && typeof f.key === "string" && f.key.startsWith(KEY_PREFIX));
}

/** Join fragments the way EmDash's renderer does: one per line. */
export function renderPlacement(fragments: readonly Fragment[], placement: Placement): string {
	return fragments
		.filter((f) => f.placement === placement)
		.map((f) => f.html)
		.join("\n");
}
