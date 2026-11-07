import { validateBlockResponse } from "@emdash-cms/blocks/server";
import { PluginRouteError } from "emdash";
import { beforeEach, describe, expect, it } from "vitest";

import { createPlugin, scriptsManager } from "../src/index.js";
import { renderPlacement } from "../src/core/render.js";
import type { Fragment } from "../src/core/types.js";
import { adminPage, adminRoutes, parsePairs } from "../src/server/admin.js";
import { afterDelete, pageFragments } from "../src/server/hooks.js";
import { editorPanel } from "../src/server/panel.js";
import { ADMIN, EDITOR, fakeContext, panelUi } from "./fake-context.js";

type Fake = ReturnType<typeof fakeContext>;

const call = (f: Fake, handler: (ctx: never) => Promise<unknown>, input: unknown) => {
	f.ctx.input = input;
	return handler(f.ctx as never);
};

const valid = (response: unknown) => {
	const result = validateBlockResponse(response, { pluginPagePaths: ["/"] });
	expect(result.errors).toEqual([]);
	return response as { blocks: { type: string }[]; toast?: { message: string; type: string } };
};

const page = (content?: { collection: string; id: string }) => ({
	page: { url: "https://gatilab.test/x/", path: "/x/", locale: null, kind: content ? "content" : "custom", pageType: "article", title: null, description: null, canonical: null, image: null, ...(content ? { content: { ...content, slug: "x" } } : {}) },
});

describe("permissions", () => {
	it("declares every route private, admin-only except the editor panel", () => {
		const plugin = createPlugin();
		for (const [name, route] of Object.entries(plugin.routes)) {
			expect(route.public, name).not.toBe(true);
			expect(route.permission, name).toBe(name === "editor/panel" ? "content:edit_own" : "plugins:manage");
			expect(route.request?.body, name).toBe("json");
		}
		expect(plugin.capabilities).toEqual(["hooks.page-fragments:register", "content:read"]);
		expect(plugin.admin.editorPanels).toEqual([{ id: "scripts", title: "Scripts", route: "editor/panel", order: 90 }]);
		// A React admin entry would hide editor panels in EmDash 1.4.
		expect(plugin.admin.entry).toBeUndefined();
		expect(createPlugin({ collections: ["posts"] }).admin.editorPanels![0]!.collections).toEqual(["posts"]);
		expect(scriptsManager()).toMatchObject({ id: "scripts-manager", format: "native", entrypoint: "@gatilab/emdash-scripts-manager" });
	});

	const inputs: Record<string, unknown> = {
		"entries/get": { collection: "posts", id: "1" },
		"entries/save": { collection: "posts", id: "1", css: "a{}" },
		"entries/delete": { collection: "posts", id: "1" },
		"entries/list": {},
		"records/list": {},
		"records/save": { name: "x", type: "inline_js", code: "x()" },
		"records/delete": { id: "x" },
		export: {},
		import: { payload: { format: "md-scripts-manager", data: { items: {} } } },
	};

	for (const user of [EDITOR, null]) {
		it(`refuses every admin route to ${user ? "an editor" : "a token with no user"} and changes nothing`, async () => {
			const f = fakeContext({ user });
			for (const [name, handler] of Object.entries(adminRoutes)) {
				await expect(call(f, handler, inputs[name] ?? {}), name).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
			}
			await expect(call(f, adminPage, { type: "page_load", page: "/" })).rejects.toBeInstanceOf(PluginRouteError);
			expect(f.storage.entries.rows.size + f.storage.records.rows.size).toBe(0);
		});
	}

	it("lets an administrator through", async () => {
		const f = fakeContext({ user: ADMIN });
		for (const [name, handler] of Object.entries(adminRoutes)) await expect(call(f, handler, inputs[name] ?? {}), name).resolves.toBeDefined();
	});
});

describe("entries API", () => {
	let f: Fake;
	beforeEach(() => {
		f = fakeContext();
	});

	it("saves partially, keeps code exact, and clears when empty", async () => {
		const html = '<script async src="https://x.test/a.js"></script>\n';
		await call(f, adminRoutes["entries/save"]!, { collection: "posts", id: "p1", headHtml: html, jsMode: "module" });
		await call(f, adminRoutes["entries/save"]!, { collection: "posts", id: "p1", css: "h1{}" });
		const { scripts } = (await call(f, adminRoutes["entries/get"]!, { collection: "posts", id: "p1" })) as { scripts: Record<string, unknown> };
		expect(scripts).toMatchObject({ headHtml: html, css: "h1{}", jsMode: "module", updatedBy: "u-admin" });

		const cleared = (await call(f, adminRoutes["entries/save"]!, { collection: "posts", id: "p1", headHtml: "", css: "" })) as { cleared: boolean };
		expect(cleared.cleared).toBe(true);
		expect(f.storage.entries.rows.size).toBe(0);
	});

	it("refuses an invalid save with the reason", async () => {
		await expect(call(f, adminRoutes["entries/save"]!, { collection: "posts", id: "p1", jsPlacement: "middle" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
		await expect(call(f, adminRoutes["entries/save"]!, { css: "a{}" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
	});
});

describe("page:fragments", () => {
	it("merges global code, records and the rendered entry's code", async () => {
		const f = fakeContext({ settings: { global_head: "<meta name=a>", global_footer: "<script>g()</script>", global_body_start: 42 } });
		await call(f, adminRoutes["records/save"]!, { name: "Late", type: "inline_js", code: "late()", location: "footer", priority: 20 });
		await call(f, adminRoutes["records/save"]!, { name: "Early", type: "inline_js", code: "early()", location: "footer", priority: 1 });
		await call(f, adminRoutes["records/save"]!, { name: "Off", type: "inline_js", code: "off()", location: "footer", enabled: false });
		await call(f, adminRoutes["entries/save"]!, { collection: "pages", id: "about", css: ".a{}", js: "about()", footerHtml: "<div id=w></div>" });

		const onEntry = await pageFragments(page({ collection: "pages", id: "about" }) as never, f.ctx as never);
		const footer = renderPlacement(onEntry, "body:end");
		expect(footer.split("\n")).toEqual(['<script>g()</script>', expect.stringContaining("early()"), expect.stringContaining("late()"), "<div id=w></div>", '<script id="scripts-manager-entry-js">about()</script>']);
		expect(footer).not.toContain("off()");
		expect(renderPlacement(onEntry, "head")).toBe('<meta name=a>\n<style id="scripts-manager-entry-css">.a{}</style>');
		// A non-string setting is ignored, not printed.
		expect(renderPlacement(onEntry, "body:start")).toBe("");

		const elsewhere = await pageFragments(page({ collection: "pages", id: "contact" }) as never, f.ctx as never);
		expect(renderPlacement(elsewhere, "body:end")).not.toContain("about()");
		const custom = await pageFragments(page() as never, f.ctx as never);
		expect(custom.every((fr: Fragment) => fr.key.startsWith("scripts-manager:"))).toBe(true);
		expect(custom.some((fr) => fr.key.includes(":entry:"))).toBe(false);
	});

	it("drops an entry's code only when the entry is permanently deleted", async () => {
		const f = fakeContext();
		await call(f, adminRoutes["entries/save"]!, { collection: "posts", id: "p1", css: "a{}" });
		await afterDelete({ id: "p1", collection: "posts", permanent: false }, f.ctx as never);
		expect(f.storage.entries.rows.size).toBe(1);
		await afterDelete({ id: "p1", collection: "posts", permanent: true }, f.ctx as never);
		expect(f.storage.entries.rows.size).toBe(0);
	});
});

describe("editor panel", () => {
	it("shows editors a notice, never the code, and refuses their saves", async () => {
		const f = fakeContext({ user: EDITOR, ui: panelUi("posts", "p1") });
		await f.storage.entries.put("posts:p1", { collection: "posts", entryId: "p1", css: "secret{}", js: "", jsMode: "classic", jsPlacement: "footer", headHtml: "", footerHtml: "", bodyClass: "", updatedAt: "", updatedBy: "u-admin" });
		const res = valid(await call(f, editorPanel, { type: "panel_load" }));
		expect(JSON.stringify(res)).not.toContain("secret{}");
		expect(JSON.stringify(res)).toContain("Only administrators");
		await expect(call(f, editorPanel, { type: "form_submit", action_id: "save", values: { css: "evil{}" } })).rejects.toMatchObject({ status: 403 });
		await expect(call(f, editorPanel, { type: "block_action", action_id: "clear" })).rejects.toMatchObject({ status: 403 });
		expect((await f.storage.entries.get("posts:p1"))!.css).toBe("secret{}");
	});

	it("loads, saves and clears an entry's code for an administrator", async () => {
		const f = fakeContext({ ui: panelUi("posts", "p1") });
		valid(await call(f, editorPanel, { type: "panel_load" }));

		const saved = valid(await call(f, editorPanel, { type: "form_submit", action_id: "save", values: { css: "<style>a{}</style>", js: "go()", jsMode: "defer", jsPlacement: "footer", headHtml: "", footerHtml: "", bodyClass: "x" } }));
		expect(saved.toast).toMatchObject({ type: "success" });
		expect(saved.blocks.some((b) => b.type === "banner")).toBe(true); // wrapper-tag warning
		expect(await f.storage.entries.get("posts:p1")).toMatchObject({ css: "<style>a{}</style>", js: "go()", jsMode: "defer", bodyClass: "x", updatedBy: "u-admin" });

		const refused = valid(await call(f, editorPanel, { type: "form_submit", action_id: "save", values: { js: "x".repeat(50 * 1024) } }));
		expect(refused.toast).toMatchObject({ type: "error" });
		expect((await f.storage.entries.get("posts:p1"))!.js).toBe("go()");

		const cleared = valid(await call(f, editorPanel, { type: "block_action", action_id: "clear" }));
		expect(cleared.toast!.message).toContain("removed");
		expect(f.storage.entries.rows.size).toBe(0);
	});

	it("only answers the editor panel surface", async () => {
		const f = fakeContext();
		await expect(call(f, editorPanel, { type: "panel_load" })).rejects.toMatchObject({ status: 400 });
	});
});

describe("admin page", () => {
	it("renders valid Block Kit with entries, records and the import form", async () => {
		const f = fakeContext({ content: { posts: [{ id: "p1", slug: "hello", title: "Hello world" }] }, settings: { global_head: "<meta>" } });
		await call(f, adminRoutes["entries/save"]!, { collection: "posts", id: "p1", css: "a{}" });
		await call(f, adminRoutes["records/save"]!, { name: "Plausible", url: "http://plausible.io/js/script.js" });
		const res = valid(await call(f, adminPage, { type: "page_load", page: "/" }));
		const json = JSON.stringify(res);
		expect(json).toContain("Hello world");
		expect(json).toContain("Plausible");
		expect(json).toContain("insecure HTTP");
		expect(json).toContain("Import from WordPress");
	});

	it("adds, edits, toggles and deletes a record", async () => {
		const f = fakeContext();
		valid(await call(f, adminPage, { type: "block_action", action_id: "record_new" }));
		const added = valid(await call(f, adminPage, { type: "form_submit", action_id: "record_save", values: { name: "Chat", type: "external_js", url: "https://chat.test/w.js", location: "footer", strategy: "async", priority: 30, enabled: true, code: "", description: "" } }));
		expect(added.toast!.type).toBe("success");
		const [id] = [...f.storage.records.rows.keys()];

		valid(await call(f, adminPage, { type: "block_action", action_id: "record_edit", value: id }));
		valid(await call(f, adminPage, { type: "form_submit", action_id: `record_save:${id}`, values: { name: "Chat widget", priority: 40 } }));
		expect(await f.storage.records.get(id!)).toMatchObject({ name: "Chat widget", priority: 40, strategy: "async", url: "https://chat.test/w.js" });

		const off = valid(await call(f, adminPage, { type: "block_action", action_id: "record_toggle", value: id }));
		expect(off.toast!.message).toContain("is off");
		expect((await f.storage.records.get(id!))!.enabled).toBe(false);

		const missingName = valid(await call(f, adminPage, { type: "form_submit", action_id: "record_save", values: { name: " ", type: "inline_js" } }));
		expect(missingName.toast!.type).toBe("error");

		valid(await call(f, adminPage, { type: "block_action", action_id: "record_delete", value: id }));
		expect(f.storage.records.rows.size).toBe(0);
	});

	it("imports pasted JSON and reports bad input", async () => {
		const f = fakeContext({ content: { pages: [{ id: "01PAGE", slug: "about" }] } });
		const payload = JSON.stringify({ format: "md-scripts-manager-export", global: { header_scripts: "<meta name=v>" }, posts: [{ id: 5, post_type: "page", slug: "about", scripts: { footer_scripts: "<script>a()</script>" } }] });
		const ok = valid(await call(f, adminPage, { type: "form_submit", action_id: "import", values: { payload, overwrite: false, collections: "", entries: "" } }));
		expect(ok.toast!.type).toBe("success");
		expect(await f.storage.entries.get("pages:01PAGE")).toMatchObject({ footerHtml: "<script>a()</script>" });

		const bad = valid(await call(f, adminPage, { type: "form_submit", action_id: "import", values: { payload: "{not json" } }));
		expect(bad.toast!.type).toBe("error");
		const wrong = valid(await call(f, adminPage, { type: "form_submit", action_id: "import", values: { payload: "{}" } }));
		expect(JSON.stringify(wrong)).toContain("Expected an export");
	});

	it("parses the a=b list fields", () => {
		expect(parsePairs("post=articles, page = pages,\nbad, =x")).toEqual({ post: "articles", page: "pages" });
	});
});
