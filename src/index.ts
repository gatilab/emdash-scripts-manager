/**
 * @gatilab/emdash-scripts-manager
 *
 * Custom CSS, JavaScript, head HTML and footer HTML on any content entry,
 * global head, body-start and footer code, and named site-wide records.
 * Administrators only. Port of the Marketers Delight Scripts Manager
 * drop-in (3.2.0); its post meta, global fields and registry import.
 *
 * @example
 * ```js
 * // astro.config.mjs
 * import emdash from "emdash/astro";
 * import { scriptsManager } from "@gatilab/emdash-scripts-manager";
 *
 * export default defineConfig({
 *   integrations: [emdash({ plugins: [scriptsManager()] })],
 * });
 * ```
 *
 * The code reaches pages through EmDash's `page:fragments` hook, so a theme
 * that renders `<EmDashHead>`, `<EmDashBodyStart>` and `<EmDashBodyEnd>`
 * needs nothing else. Themes that don't can use the components in
 * `@gatilab/emdash-scripts-manager/astro`.
 */
import { definePlugin } from "emdash";
import type { PluginDescriptor, PluginEditorPanel, PluginRoute, ResolvedPlugin, RouteContext } from "emdash";

import { SETTING_KEYS } from "./core/defaults.js";
import { adminPage, adminRoutes } from "./server/admin.js";
import { afterDelete, pageFragments } from "./server/hooks.js";
import { editorPanel } from "./server/panel.js";
import { STORAGE } from "./server/storage.js";

export const PLUGIN_ID = "scripts-manager";
export const PLUGIN_VERSION = "0.1.0";
export const PACKAGE_NAME = "@gatilab/emdash-scripts-manager";

export interface ScriptsManagerOptions {
	/**
	 * Collections that get the Scripts panel. Leave unset for every
	 * collection.
	 */
	collections?: string[];
}

const PAGES = [{ path: "/", label: "Scripts", icon: "code" }];

function editorPanels(options: ScriptsManagerOptions): PluginEditorPanel[] {
	return [{ id: "scripts", title: "Scripts", route: "editor/panel", order: 90, ...(options.collections?.length ? { collections: options.collections } : {}) }];
}

const SETTINGS = {
	[SETTING_KEYS.head]: { type: "string", multiline: true, label: "Global head code", description: "Printed in <head> on every page, before any entry's code. Raw HTML: wrap CSS in <style> and JavaScript in <script>." },
	[SETTING_KEYS.bodyStart]: { type: "string", multiline: true, label: "Global body-start code", description: "Printed right after <body> opens on every page, e.g. a tag manager's <noscript> iframe." },
	[SETTING_KEYS.footer]: { type: "string", multiline: true, label: "Global footer code", description: "Printed before </body> on every page, before any entry's footer code." },
} as const;

/** Descriptor factory for the `plugins` array of the `emdash()` integration. */
export function scriptsManager(options: ScriptsManagerOptions = {}): PluginDescriptor<ScriptsManagerOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: PACKAGE_NAME,
		options,
		adminPages: PAGES,
		editorPanels: editorPanels(options),
		settingsSchema: SETTINGS,
	};
}

type Handler = (ctx: RouteContext<unknown>) => Promise<unknown>;

/** A private JSON POST route. */
const route = (handler: Handler, permission: PluginRoute["permission"], maxBytes: number): PluginRoute => ({
	methods: ["POST"],
	permission,
	request: { body: "json", maxBytes },
	handler,
});

export function createPlugin(options: ScriptsManagerOptions = {}): ResolvedPlugin {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		// Inject into public pages (trusted-only hook), and read entries for
		// titles in the admin, slug matching on import and delete cleanup.
		capabilities: ["hooks.page-fragments:register", "content:read"],
		storage: STORAGE,
		hooks: {
			"page:fragments": { handler: pageFragments, timeout: 3000 },
			"content:afterDelete": afterDelete,
		},
		routes: {
			// Block Kit admin page. No React admin entry: EmDash 1.4 only shows
			// editor panels for plugins whose admin is Block Kit.
			admin: route(adminPage, "plugins:manage", 4 * 1024 * 1024),
			// Editors reach this route so they get a notice; it refuses them code.
			"editor/panel": route(editorPanel, "content:edit_own", 256 * 1024),
			...Object.fromEntries(Object.entries(adminRoutes).map(([name, handler]) => [name, route(handler, "plugins:manage", name === "import" ? 8 * 1024 * 1024 : 512 * 1024)])),
		},
		admin: {
			pages: PAGES,
			editorPanels: editorPanels(options),
			settingsSchema: SETTINGS,
		},
	});
}

export default createPlugin;

export * from "./core/index.js";
