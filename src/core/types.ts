/**
 * Shared shapes. Framework-free: nothing here imports EmDash or Astro.
 */

/** How an entry's JavaScript is emitted. */
export const JS_MODES = ["classic", "defer", "module"] as const;
export type JsMode = (typeof JS_MODES)[number];

/** Where an entry's JavaScript goes: in `<head>` or before `</body>`. */
export const JS_PLACEMENTS = ["footer", "head"] as const;
export type JsPlacement = (typeof JS_PLACEMENTS)[number];

/** Code attached to one content entry. Every string is stored exactly as entered. */
export interface EntryScripts {
	/** CSS without a `<style>` wrapper. */
	css: string;
	/** JavaScript without a `<script>` wrapper. */
	js: string;
	jsMode: JsMode;
	jsPlacement: JsPlacement;
	/** Raw HTML for `<head>`. */
	headHtml: string;
	/** Raw HTML before `</body>`. */
	footerHtml: string;
	/** Space-separated classes added to `<body>`. */
	bodyClass: string;
}

/** The fields of {@link EntryScripts} that hold free text. */
export const ENTRY_TEXT_FIELDS = ["css", "js", "headHtml", "footerHtml", "bodyClass"] as const;
export type EntryTextField = (typeof ENTRY_TEXT_FIELDS)[number];

/** An entry's code as stored, keyed by `collection:id`. */
export interface StoredEntryScripts extends EntryScripts {
	collection: string;
	entryId: string;
	/** ISO time of the last save. */
	updatedAt: string;
	/** User id of the last editor, or "import". */
	updatedBy: string;
	/** WordPress post id this code came from, when imported. */
	legacyWpId?: number;
}

/** Site-wide code from the plugin settings. */
export interface GlobalScripts {
	head: string;
	bodyStart: string;
	footer: string;
}

export const RECORD_TYPES = ["external_js", "external_css", "inline_js", "inline_css", "raw_html"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_LOCATIONS = ["head", "body_open", "footer"] as const;
export type RecordLocation = (typeof RECORD_LOCATIONS)[number];

export const RECORD_STRATEGIES = ["blocking", "defer", "async", "module"] as const;
export type RecordStrategy = (typeof RECORD_STRATEGIES)[number];

/**
 * A named site-wide record: the WordPress drop-in's Scripts Manager 3
 * registry item, minus the parts EmDash has no equivalent for (consent
 * gating, visibility conditions, WordPress dependency handles). Those are
 * kept in `legacy` for reference when imported.
 */
export interface ScriptRecord {
	id: string;
	name: string;
	description: string;
	enabled: boolean;
	type: RecordType;
	url: string;
	code: string;
	location: RecordLocation;
	priority: number;
	strategy: RecordStrategy;
	updatedAt: string;
	updatedBy: string;
	/** Id of the WordPress record this came from; re-imports skip it. */
	legacyId?: string;
	/** Why an imported record needs review, shown in the admin. */
	note?: string;
	legacy?: {
		consent?: string;
		conditions?: unknown;
		dependencies?: string[];
	};
}

/** EmDash's fragment placements. */
export type Placement = "head" | "body:start" | "body:end";

/** Structurally an EmDash `PageFragmentContribution` of kind `html`. */
export interface Fragment {
	kind: "html";
	placement: Placement;
	html: string;
	key: string;
}

export interface SaveProblem {
	field: string;
	message: string;
}
