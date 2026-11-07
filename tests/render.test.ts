import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";

import { ScriptsBodyEnd, ScriptsBodyStart, ScriptsHead } from "../src/astro/index.js";
import { adminRoutes } from "../src/server/admin.js";
import { pageFragments } from "../src/server/hooks.js";
import { entryPage, sitePage } from "../src/site/index.js";
import { fakeContext } from "./fake-context.js";

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

/** locals.emdash as EmDash's middleware sets it: this plugin's hook plus another plugin's fragments. */
async function site() {
	const f = fakeContext({ settings: { global_head: '<meta name="verify" content="1">', global_body_start: "<noscript>tm</noscript>", global_footer: "<script>siteFooter()</script>" } });
	f.ctx.input = { collection: "posts", id: "p1", css: "h1{color:red}", js: "postOnly()", headHtml: '<link rel="preload" href="/f.woff2" as="font">', footerHtml: "<div id=\"w\"></div>", bodyClass: "landing" };
	await adminRoutes["entries/save"]!(f.ctx as never);
	const other = [{ kind: "html", placement: "head", html: "<meta name=\"other-plugin\">", key: "seo:x" }];
	const locals = {
		emdash: {
			collectPageFragments: async (page: never) => [...other, ...(await pageFragments({ page }, f.ctx as never))],
		},
	};
	return locals;
}

async function render(component: Parameters<AstroContainer["renderToString"]>[0], locals: unknown, page: unknown) {
	const html = await container.renderToString(component, { props: { page }, locals: locals as never, request: new Request("https://gatilab.test/hello/") });
	return html.replace(/\s+data-astro-source-(?:file|loc)="[^"]*"/g, "").trim();
}

describe("Astro components", () => {
	const astro = { url: new URL("https://gatilab.test/hello/") };

	it("print global then entry code in each place, and nothing from other plugins", async () => {
		const locals = await site();
		const page = entryPage(astro, { id: "p1", slug: "hello" }, { collection: "posts", title: "Hello" });
		expect(page.content).toEqual({ collection: "posts", id: "p1", slug: "hello" });

		expect(await render(ScriptsHead, locals, page)).toBe('<meta name="verify" content="1">\n<link rel="preload" href="/f.woff2" as="font">\n<style id="scripts-manager-entry-css">h1{color:red}</style>');
		expect(await render(ScriptsBodyStart, locals, page)).toBe('<script id="scripts-manager-body-class">document.body.classList.add("landing")</script>\n<noscript>tm</noscript>');
		expect(await render(ScriptsBodyEnd, locals, page)).toBe('<script>siteFooter()</script>\n<div id="w"></div>\n<script id="scripts-manager-entry-js">postOnly()</script>');
	});

	it("print only global code on a page that isn't an entry", async () => {
		const locals = await site();
		const page = sitePage(astro, { title: "Archive" });
		expect(await render(ScriptsBodyEnd, locals, page)).toBe("<script>siteFooter()</script>");
	});

	it("render nothing when EmDash isn't running", async () => {
		expect(await render(ScriptsHead, {}, sitePage(astro))).toBe("");
	});
});
