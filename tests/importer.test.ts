import { describe, expect, it } from "vitest";

import { collectionFor, ImportFormatError, planImport } from "../src/core/importer.js";
import { applyImport } from "../src/server/importer.js";
import { fakeContext } from "./fake-context.js";

const NOW = "2026-11-07T10:00:00.000Z";

/** What wordpress/export-scripts-manager.php writes. */
const EXPORT = {
	format: "md-scripts-manager-export",
	version: 1,
	site: "https://gauravtiwari.org",
	global: {
		header_scripts: '<meta name="google-site-verification" content="abc">',
		footer_scripts: "<script>window.siteFooter = true;</script>",
	},
	posts: [
		{ id: 42, post_type: "post", slug: "hello-world", status: "publish", path: "/hello-world/", scripts: { header_scripts: "<style>.hero{color:red}</style>", footer_scripts: "<script>hello()</script>", body_class: "landing", scripts_manager: ["contact-form"] } },
		{ id: 57, post_type: "page", slug: "about", status: "publish", path: "/about/", scripts: { header_scripts: '<link rel="preconnect" href="https://fonts.gstatic.com">', footer_scripts: "", body_class: "" } },
		{ id: 60, post_type: "page", slug: "missing", status: "draft", path: "/missing/", scripts: { header_scripts: "<!-- x -->" } },
		{ id: 61, post_type: "product", slug: "kit", status: "publish", path: "/product/kit/", scripts: { footer_scripts: "<script>kit()</script>" } },
		{ id: 70, post_type: "post", slug: "empty", status: "publish", path: "/empty/", scripts: { header_scripts: "", footer_scripts: "", body_class: "  ", scripts_manager: { gallery: 1 } } },
	],
	terms: [{ id: 3, taxonomy: "category", slug: "news", scripts: { header_scripts: "<script>news()</script>" } }],
	registry: {
		items: {
			"script-aaa": { id: "script-aaa", name: "Plausible", enabled: true, type: "external_js", url: "https://plausible.io/js/script.js", location: "head", priority: 10, strategy: "defer", consent: "essential", conditions: { logic: "all", rules: [] }, dependencies: [] },
			"script-bbb": { id: "script-bbb", name: "Meta Pixel", enabled: true, type: "raw_html", code: "<script>fbq('init','1')</script>", location: "footer", priority: 20, strategy: "blocking", consent: "marketing", conditions: { logic: "all", rules: [] }, dependencies: [] },
			"script-ccc": { id: "script-ccc", name: "Pages only", enabled: true, type: "inline_js", code: "pagesOnly();", location: "footer", priority: 30, consent: "essential", conditions: { logic: "all", rules: [{ type: "post_type", op: "in", value: ["page"] }] }, dependencies: ["jquery"] },
			"script-ddd": { id: "script-ddd", name: "Off already", enabled: false, type: "inline_css", code: "body{}", location: "head" },
		},
		settings: { consent_mode: false },
	},
	integrations: ["google_analytics"],
};

const CONTENT = {
	posts: [
		{ id: "01POST42", slug: "hello-world", title: "Hello world" },
		{ id: "01POSTXX", slug: "other" },
	],
	pages: [{ id: "01PAGE57", slug: "about", title: "About" }],
};

describe("planImport", () => {
	it("maps the drop-in's keys to EmDash fields", () => {
		const plan = planImport(EXPORT, {}, { now: NOW });
		expect(plan.global).toEqual({ head: EXPORT.global.header_scripts, footer: EXPORT.global.footer_scripts });
		expect(plan.entries.map((e) => [e.wpId, e.collection, e.slug])).toEqual([
			[42, "posts", "hello-world"],
			[57, "pages", "about"],
			[60, "pages", "missing"],
			[61, "products", "kit"],
		]);
		expect(plan.entries[0]!.scripts).toEqual({ css: "", js: "", jsMode: "classic", jsPlacement: "footer", headHtml: "<style>.hero{color:red}</style>", footerHtml: "<script>hello()</script>", bodyClass: "landing" });
		expect(plan.skipped).toEqual({ terms: 1, dequeues: 2, emptyPosts: 1, records: 0, integrations: ["google_analytics"] });
		expect(plan.warnings.join(" ")).toContain("google_analytics");
	});

	it("imports consent-gated and conditional records disabled, with a note", () => {
		const byLegacy = Object.fromEntries(planImport(EXPORT).records.map((r) => [r.legacyId, r]));
		expect(byLegacy["script-aaa"]).toMatchObject({ enabled: true, type: "external_js", location: "head", strategy: "defer", url: "https://plausible.io/js/script.js" });
		expect(byLegacy["script-bbb"]).toMatchObject({ enabled: false, legacy: { consent: "marketing" } });
		expect(byLegacy["script-bbb"]!.note).toContain('"marketing" consent');
		expect(byLegacy["script-ccc"]!.enabled).toBe(false);
		expect(byLegacy["script-ccc"]!.note).toContain("visibility condition");
		expect(byLegacy["script-ccc"]!.note).toContain("jquery");
		expect(byLegacy["script-ddd"]!.enabled).toBe(false);
		// New ids, not the WordPress ones.
		expect(byLegacy["script-aaa"]!.id).not.toBe("script-aaa");
	});

	it("accepts the drop-in's own registry export", () => {
		const plan = planImport({ format: "md-scripts-manager", data: { items: { a: { id: "a", name: "A", type: "inline_css", code: "p{}" } } } });
		expect(plan.records).toHaveLength(1);
		expect(plan.entries).toEqual([]);
	});

	it("rejects other files", () => {
		expect(() => planImport({ format: "md-lead-capture" })).toThrow(ImportFormatError);
		expect(() => planImport("nope")).toThrow(ImportFormatError);
	});

	it("names collections the way EmDash's WordPress importer does", () => {
		expect(collectionFor("post")).toBe("posts");
		expect(collectionFor("md-course")).toBe("md_course");
		expect(collectionFor("post", { post: "articles" })).toBe("articles");
	});
});

describe("applyImport", () => {
	it("matches posts by slug, writes global code, entries and records", async () => {
		const f = fakeContext({ content: CONTENT });
		const result = await applyImport(f.ctx as never, { payload: EXPORT }, NOW);

		expect(result.global).toEqual({ head: "imported", footer: "imported" });
		expect(f.settings.get("global_head")).toBe(EXPORT.global.header_scripts);
		expect(f.settings.get("global_footer")).toBe(EXPORT.global.footer_scripts);

		expect(result.entries.imported).toBe(2);
		expect(result.entries.unmatched.map((u) => u.wpId)).toEqual([60, 61]);
		expect(await f.storage.entries.get("posts:01POST42")).toMatchObject({ collection: "posts", entryId: "01POST42", headHtml: "<style>.hero{color:red}</style>", footerHtml: "<script>hello()</script>", bodyClass: "landing", legacyWpId: 42, updatedBy: "import" });
		expect(await f.storage.entries.get("pages:01PAGE57")).toMatchObject({ headHtml: '<link rel="preconnect" href="https://fonts.gstatic.com">' });

		expect(result.records.imported).toBe(4);
		expect(result.warnings.join(" ")).toContain('Could not list the "products" collection');
	});

	it("uses an explicit id map before slugs", async () => {
		const f = fakeContext({ content: CONTENT });
		const result = await applyImport(f.ctx as never, { payload: EXPORT, entries: { "61": "shop:01KIT", "60": { collection: "pages", id: "01DRAFT" } } }, NOW);
		expect(result.entries.unmatched).toEqual([]);
		expect(await f.storage.entries.get("shop:01KIT")).toMatchObject({ footerHtml: "<script>kit()</script>", legacyWpId: 61 });
		expect(await f.storage.entries.get("pages:01DRAFT")).toMatchObject({ headHtml: "<!-- x -->" });
	});

	it("is safe to run twice and only replaces with overwrite", async () => {
		const f = fakeContext({ content: CONTENT, settings: { global_head: "<!-- mine -->" } });
		await f.storage.entries.put("posts:01POST42", { collection: "posts", entryId: "01POST42", css: "keep{}", js: "", jsMode: "classic", jsPlacement: "footer", headHtml: "", footerHtml: "", bodyClass: "", updatedAt: NOW, updatedBy: "u1" });

		const first = await applyImport(f.ctx as never, { payload: EXPORT }, NOW);
		expect(first.global.head).toBe("kept");
		expect(f.settings.get("global_head")).toBe("<!-- mine -->");
		expect(first.entries.kept).toBe(1);
		expect((await f.storage.entries.get("posts:01POST42"))!.css).toBe("keep{}");

		const again = await applyImport(f.ctx as never, { payload: EXPORT }, NOW);
		expect(again.records).toEqual({ imported: 0, kept: 4 });
		expect(f.storage.records.rows.size).toBe(4);

		const forced = await applyImport(f.ctx as never, { payload: EXPORT, overwrite: true }, NOW);
		expect(forced.global.head).toBe("imported");
		expect(forced.records).toEqual({ imported: 4, kept: 0 });
		expect(f.storage.records.rows.size).toBe(4);
		expect((await f.storage.entries.get("posts:01POST42"))!.css).toBe("");
	});
});

describe("wordpress/export-scripts-manager.php output", () => {
	// Written by the PHP script against a WordPress stub: entity-encoded legacy
	// meta, a dequeue map, a term, a registry record and an enabled integration.
	it("plans cleanly from a real export file", async () => {
		const { default: file } = await import("./fixtures/wordpress-export.json", { with: { type: "json" } });
		const plan = planImport(file);
		expect(plan.global).toEqual({ head: '<meta name="v" content="1">' });
		expect(plan.entries).toHaveLength(1);
		expect(plan.entries[0]).toMatchObject({ wpId: 42, collection: "posts", slug: "hello-world", scripts: { headHtml: "<style>.hero{color:red}</style>", footerHtml: '<script>hello("a&b")</script>', bodyClass: "landing" } });
		expect(plan.records.map((r) => [r.name, r.enabled, r.legacyId])).toEqual([["Plausible", true, "script-a"]]);
		expect(plan.skipped).toEqual({ terms: 1, dequeues: 1, emptyPosts: 0, records: 0, integrations: ["google_analytics"] });
	});
});
