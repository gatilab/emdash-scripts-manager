import { describe, expect, it } from "vitest";

import {
	buildFragments,
	EMPTY_ENTRY,
	EMPTY_GLOBAL,
	entryDiagnostics,
	entryJsTag,
	isEmptyEntry,
	normalizeEntry,
	normalizeRecord,
	ownFragments,
	recordDiagnostics,
	recordMarkup,
	renderPlacement,
	type EntryScripts,
	type ScriptRecord,
} from "../src/core/index.js";

const NOW = "2026-11-07T10:00:00.000Z";
const record = (input: Record<string, unknown>): ScriptRecord => normalizeRecord(input, undefined, { user: "u1", now: NOW }).record;
const entry = (input: Partial<EntryScripts>): EntryScripts => ({ ...EMPTY_ENTRY, ...input });
const keys = (placement: "head" | "body:start" | "body:end", fragments: ReturnType<typeof buildFragments>) => fragments.filter((f) => f.placement === placement).map((f) => f.key.replace("scripts-manager:", ""));

describe("output order", () => {
	const global = { head: "<meta name=\"g\" content=\"head\">", bodyStart: "<noscript>gtm</noscript>", footer: "<script>globalFooter()</script>" };
	const records = [
		record({ id: "late", name: "Late", type: "inline_js", code: "late();", location: "footer", priority: 50 }),
		record({ id: "early", name: "Early", type: "inline_js", code: "early();", location: "footer", priority: 5 }),
		record({ id: "css", name: "Fonts", type: "external_css", url: "https://cdn.example.test/fonts.css", location: "footer" }),
		record({ id: "open", name: "Body", type: "raw_html", code: "<div id=\"tag\"></div>", location: "body_open" }),
		record({ id: "off", name: "Off", type: "inline_js", code: "off();", enabled: false }),
	];
	const page = entry({ css: ".hero{color:red}", js: "pageOnly();", headHtml: "<link rel=\"preload\" href=\"/a.woff2\">", footerHtml: "<div id=\"embed\"></div>", bodyClass: "landing wide" });

	it("puts site-wide code before the entry's, and HTML before CSS before JS", () => {
		const fragments = buildFragments({ global, records, entry: page });
		expect(keys("head", fragments)).toEqual(["global:head", "record:css", "entry:head-html", "entry:css"]);
		expect(keys("body:start", fragments)).toEqual(["entry:body-class", "global:body-start", "record:open"]);
		expect(keys("body:end", fragments)).toEqual(["global:footer", "record:early", "record:late", "entry:footer-html", "entry:js"]);
	});

	it("moves the entry's JavaScript into the head when asked", () => {
		const fragments = buildFragments({ global, records, entry: { ...page, jsPlacement: "head" } });
		expect(keys("head", fragments).at(-1)).toBe("entry:js");
		expect(keys("body:end", fragments)).not.toContain("entry:js");
	});

	it("prints only global code and records on pages that aren't an entry", () => {
		const fragments = buildFragments({ global, records, entry: null });
		expect(fragments.every((f) => !f.key.includes(":entry:"))).toBe(true);
		expect(renderPlacement(fragments, "head")).toBe('<meta name="g" content="head">\n<link id="md-script-css" rel="stylesheet" href="https://cdn.example.test/fonts.css" />');
	});

	it("keeps code exactly as entered and skips blank fields", () => {
		const html = renderPlacement(buildFragments({ global: { ...EMPTY_GLOBAL, footer: "  <script>a()</script>\n" }, entry: entry({ footerHtml: "   ", css: "a{}" }) }), "body:end");
		expect(html).toBe("  <script>a()</script>\n");
		expect(buildFragments({ global: EMPTY_GLOBAL, entry: EMPTY_ENTRY })).toEqual([]);
	});

	it("wraps entry CSS and JavaScript and adds body classes from the start of <body>", () => {
		const fragments = buildFragments({ global: EMPTY_GLOBAL, entry: page });
		expect(renderPlacement(fragments, "head")).toContain('<style id="scripts-manager-entry-css">.hero{color:red}</style>');
		expect(renderPlacement(fragments, "body:end")).toContain('<script id="scripts-manager-entry-js">pageOnly();</script>');
		expect(renderPlacement(fragments, "body:start")).toBe('<script id="scripts-manager-body-class">document.body.classList.add("landing","wide")</script>');
	});

	it("filters this plugin's fragments out of everything EmDash collected", () => {
		const mine = buildFragments({ global, entry: page });
		const mixed = [{ kind: "external-script", placement: "head", src: "https://other.test/a.js" }, { kind: "html", placement: "head", html: "<x>", key: "seo:1" }, ...mine];
		expect(ownFragments(mixed, "head").map((f) => f.key)).toEqual(mine.filter((f) => f.placement === "head").map((f) => f.key));
	});
});

describe("entry JavaScript modes", () => {
	it("emits classic, module and deferred scripts", () => {
		expect(entryJsTag("go()", "classic")).toBe('<script id="scripts-manager-entry-js">go()</script>');
		expect(entryJsTag("go()", "module")).toBe('<script id="scripts-manager-entry-js" type="module">go()</script>');
		const deferred = entryJsTag("const s = 'naïve';", "defer");
		expect(deferred).toMatch(/^<script id="scripts-manager-entry-js" defer src="data:text\/javascript;base64,[A-Za-z0-9+/=]+"><\/script>$/);
		const b64 = /base64,([^"]+)/.exec(deferred)![1]!;
		expect(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).toBe("const s = 'naïve';");
	});

	it("can't be closed early by </script> or </style> inside the code", () => {
		expect(entryJsTag('const tag = "</script><img src=x>";', "classic")).toBe('<script id="scripts-manager-entry-js">const tag = "<\\/script><img src=x>";</script>');
		const css = renderPlacement(buildFragments({ global: EMPTY_GLOBAL, entry: entry({ css: "a::after{content:'</style>'}" }) }), "head");
		expect(css).toBe("<style id=\"scripts-manager-entry-css\">a::after{content:'<\\/style>'}</style>");
	});
});

describe("normalizeEntry", () => {
	it("stores code exactly and merges over the saved value", () => {
		const code = '<script>const re = /foo\\d+/; const path = "C:\\\\tmp";</script>\n\t';
		const first = normalizeEntry({ headHtml: code, jsMode: "module" });
		expect(first.problems).toEqual([]);
		expect(first.scripts.headHtml).toBe(code);
		const second = normalizeEntry({ css: "body{}" }, first.scripts);
		expect(second.scripts).toMatchObject({ headHtml: code, css: "body{}", jsMode: "module", jsPlacement: "footer" });
		expect(normalizeEntry({ headHtml: null }, second.scripts).scripts.headHtml).toBe("");
	});

	it("refuses bad input instead of fixing it", () => {
		expect(normalizeEntry({ jsMode: "async" }).problems[0]!.field).toBe("jsMode");
		expect(normalizeEntry({ css: 42 }).problems[0]!.message).toContain("must be text");
		expect(normalizeEntry({ js: "x".repeat(49 * 1024) }).problems[0]!.field).toBe("js");
	});

	it("treats whitespace-only fields as empty", () => {
		expect(isEmptyEntry(entry({ css: "  \n", bodyClass: " " }))).toBe(true);
		expect(isEmptyEntry(entry({ bodyClass: "x" }))).toBe(false);
	});

	it("warns about wrapper tags, document.write and bad class names", () => {
		const warnings = entryDiagnostics(entry({ css: "<style>a{}</style>", js: "<script>document.write('x')</script>", bodyClass: "ok 9bad" })).join(" ");
		expect(warnings).toContain("surrounding <style> tag");
		expect(warnings).toContain("surrounding <script> tag");
		expect(warnings).toContain("document.write()");
		expect(warnings).toContain("9bad");
	});
});

/** The WordPress drop-in's ScriptsManagerTest, ported. */
describe("records", () => {
	it("normalizes types and strategies without changing code", () => {
		const item = record({ name: "  Analytics  ", type: "external_css", location: "footer", strategy: "async", url: "https://cdn.example.test/app.css", code: '<script>const match = /foo\\d+/; const path = "C:\\\\tmp";</script>' });
		expect(item.name).toBe("Analytics");
		expect(item.location).toBe("head");
		expect(item.strategy).toBe("blocking");
		expect(item.code).toBe('<script>const match = /foo\\d+/; const path = "C:\\\\tmp";</script>');
	});

	it("uses blank_item() defaults and clamps priority", () => {
		expect(record({ name: "x", url: "https://a.test/x.js" })).toMatchObject({ enabled: true, type: "external_js", location: "footer", priority: 10, strategy: "defer" });
		expect(record({ name: "x", priority: 5000 }).priority).toBe(999);
		expect(record({ name: "x", priority: "-7" }).priority).toBe(7);
		expect(record({ name: "x", type: "bogus" }).type).toBe("external_js");
	});

	it("rejects unsafe URLs", () => {
		const { record: r, problems } = normalizeRecord({ name: "x", url: "javascript:alert(1)" });
		expect(r.url).toBe("");
		expect(problems[0]!.field).toBe("url");
	});

	it("catches performance and wrapper problems", () => {
		const warnings = recordDiagnostics(record({ name: "Old embed", type: "inline_js", location: "head", code: '<script>document.write("x")</script>' })).join(" ");
		expect(warnings).toContain("document.write()");
		expect(warnings).toContain("surrounding script tag");
		const a = record({ id: "a", name: "A", url: "http://cdn.test/a.js", location: "head", strategy: "blocking" });
		const b = record({ id: "b", name: "B", url: "http://cdn.test/a.js" });
		expect(recordDiagnostics(a, [a, b])).toEqual(["The URL uses insecure HTTP.", "A blocking script in the head can delay rendering.", "Another record uses the same asset URL."]);
	});

	it("keeps raw legacy-compatible markup", () => {
		const html = recordMarkup(record({ name: "Embed", type: "raw_html", code: "<script>window.existing=true;</script>" }));
		expect(html).toBe("<!-- MD Script: Embed -->\n<script>window.existing=true;</script>");
	});

	it("prints each loading strategy", () => {
		const tag = (strategy: string) => recordMarkup(record({ id: "s", name: "S", url: "https://a.test/s.js", strategy }));
		expect(tag("defer")).toBe('<script id="md-script-s" src="https://a.test/s.js" defer></script>');
		expect(tag("async")).toContain(" async></script>");
		expect(tag("module")).toContain(' type="module"></script>');
		expect(tag("blocking")).toBe('<script id="md-script-s" src="https://a.test/s.js"></script>');
	});
});
