/**
 * WordPress import, the pure half: turn the export written by
 * `wordpress/export-scripts-manager.php` (or the drop-in's own registry
 * export) into a plan. The server half resolves entries and writes.
 *
 * Mapping:
 *   option marketers_delight → settings.header_scripts   → global head
 *   option marketers_delight → settings.footer_scripts   → global footer
 *   post meta marketers_delight → scripts.header_scripts → entry Head HTML
 *   post meta marketers_delight → scripts.footer_scripts → entry Footer HTML
 *   post meta marketers_delight → scripts.body_class     → entry Body classes
 *   option md_scripts_manager → items                    → site-wide records
 *
 * Not carried over (counted in `skipped`): term scripts, per-post dequeue
 * choices, built-in integrations and editor-preview switches.
 */
import { EMPTY_ENTRY, LIMITS } from "./defaults.js";
import { normalizeRecord } from "./records.js";
import { cleanId, obj, str, toBool } from "./text.js";
import type { EntryScripts, GlobalScripts, ScriptRecord } from "./types.js";

export const EXPORT_FORMAT = "md-scripts-manager-export";
export const REGISTRY_FORMAT = "md-scripts-manager";

export interface ImportOptions {
	/** WordPress post type → EmDash collection slug, over the defaults. */
	collections?: Record<string, string>;
}

export interface PlannedEntry {
	wpId: number;
	postType: string;
	slug: string;
	path: string;
	status: string;
	collection: string;
	scripts: EntryScripts;
}

export interface ImportPlan {
	global: Partial<GlobalScripts>;
	entries: PlannedEntry[];
	records: ScriptRecord[];
	skipped: {
		terms: number;
		dequeues: number;
		emptyPosts: number;
		records: number;
		integrations: string[];
	};
	warnings: string[];
}

/** EmDash's WordPress importer names collections this way (emdash/src/import/utils.ts). */
const POST_TYPE_TO_COLLECTION: Record<string, string> = {
	post: "posts",
	page: "pages",
	attachment: "media",
	product: "products",
	portfolio: "portfolio",
	testimonial: "testimonials",
	team: "team",
	event: "events",
	faq: "faqs",
};

export function collectionFor(postType: string, overrides: Record<string, string> = {}): string {
	const override = overrides[postType];
	if (typeof override === "string" && override.trim()) return override.trim();
	const known = POST_TYPE_TO_COLLECTION[postType];
	if (known) return known;
	return postType.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "") || "imported";
}

export class ImportFormatError extends Error {}

/** Throws ImportFormatError when `payload` is neither export format. */
export function planImport(payload: unknown, options: ImportOptions = {}, meta: { now?: string } = {}): ImportPlan {
	const data = obj(payload);
	const plan: ImportPlan = {
		global: {},
		entries: [],
		records: [],
		skipped: { terms: 0, dequeues: 0, emptyPosts: 0, records: 0, integrations: [] },
		warnings: [],
	};

	if (data.format === REGISTRY_FORMAT) {
		const registry = obj(data.data);
		if (!registry.items || typeof registry.items !== "object") throw new ImportFormatError("This is not a valid Scripts Manager export.");
		planRecords(plan, registry.items, meta);
		return plan;
	}
	if (data.format !== EXPORT_FORMAT) {
		throw new ImportFormatError(`Expected an export from wordpress/export-scripts-manager.php (format "${EXPORT_FORMAT}") or the drop-in's own export (format "${REGISTRY_FORMAT}").`);
	}

	const global = obj(data.global);
	if (str(global.header_scripts)) plan.global.head = str(global.header_scripts);
	if (str(global.footer_scripts)) plan.global.footer = str(global.footer_scripts);

	for (const raw of Array.isArray(data.posts) ? data.posts : []) {
		const post = obj(raw);
		const scripts = obj(post.scripts);
		const dequeues = Array.isArray(scripts.scripts_manager) ? scripts.scripts_manager.length : Object.keys(obj(scripts.scripts_manager)).length;
		plan.skipped.dequeues += dequeues;
		const entry: EntryScripts = {
			...EMPTY_ENTRY,
			headHtml: str(scripts.header_scripts),
			footerHtml: str(scripts.footer_scripts),
			bodyClass: str(scripts.body_class),
		};
		if (!entry.headHtml && !entry.footerHtml && !entry.bodyClass.trim()) {
			plan.skipped.emptyPosts++;
			continue;
		}
		const postType = str(post.post_type) || "post";
		plan.entries.push({
			wpId: Number(post.id) || 0,
			postType,
			slug: str(post.slug),
			path: str(post.path),
			status: str(post.status),
			collection: collectionFor(postType, options.collections),
			scripts: entry,
		});
	}

	for (const raw of Array.isArray(data.terms) ? data.terms : []) {
		const scripts = obj(obj(raw).scripts);
		if (str(scripts.header_scripts) || str(scripts.footer_scripts)) plan.skipped.terms++;
	}
	if (plan.skipped.terms) plan.warnings.push(`${plural(plan.skipped.terms, "taxonomy term has", "taxonomy terms have")} header or footer scripts. EmDash term archives aren't content entries, so add that code to the archive template or as a site-wide record.`);

	plan.skipped.integrations = (Array.isArray(data.integrations) ? data.integrations : []).filter((v): v is string => typeof v === "string");
	if (plan.skipped.integrations.length) plan.warnings.push(`Built-in integrations aren't migrated: ${plan.skipped.integrations.join(", ")}. Add their tags as site-wide records or global code.`);
	if (plan.skipped.dequeues) plan.warnings.push("Per-post \"Scripts Optimization\" dequeue choices have no EmDash equivalent and were skipped.");

	const registry = obj(data.registry);
	if (registry.items && typeof registry.items === "object") planRecords(plan, registry.items, meta);
	return plan;
}

function planRecords(plan: ImportPlan, items: unknown, meta: { now?: string }): void {
	const list = Array.isArray(items) ? items : Object.values(obj(items));
	if (list.length > LIMITS.records) plan.skipped.records += list.length - LIMITS.records;
	for (const raw of list.slice(0, LIMITS.records)) {
		const item = obj(raw);
		if (!Object.keys(item).length) continue;
		const consent = str(item.consent) || "essential";
		const conditions = obj(item.conditions);
		const rules = Array.isArray(conditions.rules) ? conditions.rules : [];
		const dependencies = (Array.isArray(item.dependencies) ? item.dependencies : []).filter((d): d is string => typeof d === "string" && d !== "");
		const notes: string[] = [];
		let gated = false;
		if (consent !== "essential") {
			gated = true;
			notes.push(`In WordPress this waited for the visitor's "${consent}" consent. EmDash has no consent gate, so it was imported disabled.`);
		}
		if (rules.length) {
			gated = true;
			notes.push(`In WordPress it loaded only where its ${plural(rules.length, "visibility condition", "visibility conditions")} matched. Records here load on every page, so it was imported disabled.`);
		}
		if (dependencies.length) notes.push(`It depended on WordPress script handles (${dependencies.join(", ")}), which don't exist here.`);

		const { record, problems } = normalizeRecord(
			{
				...item,
				id: "",
				enabled: (item.enabled === undefined || toBool(item.enabled)) && !gated,
				legacyId: cleanId(item.id),
				note: notes.join(" "),
				legacy: { consent, conditions: rules.length ? conditions : undefined, dependencies: dependencies.length ? dependencies : undefined },
			},
			undefined,
			{ user: "import", now: meta.now },
		);
		for (const problem of problems) plan.warnings.push(`Record "${record.name || record.legacyId}": ${problem.message}`);
		plan.records.push(record);
	}
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
