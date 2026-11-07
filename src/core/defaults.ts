import type { EntryScripts, GlobalScripts } from "./types.js";

/** Every fragment this plugin contributes carries a key with this prefix. */
export const KEY_PREFIX = "scripts-manager:";

/** EmDash's administrator role level. */
export const ADMIN_ROLE = 50;

export const LIMITS = {
	/**
	 * Per code field, in UTF-8 bytes. Block Kit caps a single string at
	 * 64 KiB and a whole panel response at 256 KiB, so five full fields
	 * must still fit in one editor panel.
	 */
	fieldBytes: 48 * 1024,
	/** All of one entry's fields together. */
	entryBytes: 192 * 1024,
	/** One site-wide record's code. */
	recordBytes: 48 * 1024,
	/** Records, as in WordPress (import and registry cap). */
	records: 500,
	/** Rows per page in admin tables. */
	pageSize: 25,
} as const;

export const EMPTY_ENTRY: EntryScripts = {
	css: "",
	js: "",
	jsMode: "classic",
	jsPlacement: "footer",
	headHtml: "",
	footerHtml: "",
	bodyClass: "",
};

export const EMPTY_GLOBAL: GlobalScripts = { head: "", bodyStart: "", footer: "" };

/** Plugin settings keys for the site-wide code (`admin.settingsSchema`). */
export const SETTING_KEYS = {
	head: "global_head",
	bodyStart: "global_body_start",
	footer: "global_footer",
} as const satisfies Record<keyof GlobalScripts, string>;

export const FIELD_LABELS: Record<keyof EntryScripts, string> = {
	css: "Custom CSS",
	js: "JavaScript",
	jsMode: "JavaScript type",
	jsPlacement: "JavaScript placement",
	headHtml: "Head HTML",
	footerHtml: "Footer HTML",
	bodyClass: "Body classes",
};
