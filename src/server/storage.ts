/**
 * Storage collections, settings and the access check.
 *
 * Per-entry code lives in plugin storage keyed by `collection:id`, not in the
 * entry itself: the editor panel is the only way to change it, so the
 * administrator-only rule holds no matter who can edit the entry. Global code
 * is plugin settings (only `plugins:manage` can change those). Records are
 * their own collection.
 */
import { PluginRouteError } from "emdash";
import type { PluginContext, PluginStorageConfig, StorageCollection } from "emdash";

import { ADMIN_ROLE, LIMITS, SETTING_KEYS } from "../core/defaults.js";
import type { GlobalScripts, ScriptRecord, StoredEntryScripts } from "../core/types.js";

export const STORAGE: PluginStorageConfig = {
	entries: { indexes: ["collection", "updatedAt", ["collection", "updatedAt"]] },
	records: { indexes: ["enabled", "legacyId", "updatedAt"] },
};

type Ctx = Pick<PluginContext, "storage">;

export const entries = (ctx: Ctx) => ctx.storage.entries as StorageCollection<StoredEntryScripts>;
export const records = (ctx: Ctx) => ctx.storage.records as StorageCollection<ScriptRecord>;

export const entryKey = (collection: string, id: string): string => `${collection}:${id}`;

/** Every record (there are at most LIMITS.records), oldest first. */
export async function allRecords(ctx: Ctx): Promise<ScriptRecord[]> {
	const out: ScriptRecord[] = [];
	let cursor: string | undefined;
	do {
		const page = await records(ctx).query({ limit: 100, cursor });
		for (const item of page.items) out.push(item.data);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && out.length < LIMITS.records);
	return out;
}

/** Enabled records only: what a page render needs. */
export async function enabledRecords(ctx: Ctx): Promise<ScriptRecord[]> {
	const out: ScriptRecord[] = [];
	let cursor: string | undefined;
	do {
		const page = await records(ctx).query({ where: { enabled: true }, limit: 100, cursor });
		for (const item of page.items) out.push(item.data);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && out.length < LIMITS.records);
	return out;
}

/** Site-wide code from the plugin settings, exactly as saved. */
export async function readGlobal(ctx: Pick<PluginContext, "settings">): Promise<GlobalScripts> {
	const [head, bodyStart, footer] = await Promise.all([ctx.settings.get<unknown>(SETTING_KEYS.head), ctx.settings.get<unknown>(SETTING_KEYS.bodyStart), ctx.settings.get<unknown>(SETTING_KEYS.footer)]);
	const text = (v: unknown) => (typeof v === "string" ? v : "");
	return { head: text(head), bodyStart: text(bodyStart), footer: text(footer) };
}

/** The caller, as a route sees it. */
export interface Caller {
	id: string;
	role: number;
}

/**
 * Administrators only. EmDash already checks each route's `permission`
 * before dispatch; this is the second lock, and the one the editor panel
 * relies on (its route admits editors so they get a notice, not an error).
 */
export function requireAdmin(user: Caller | undefined): Caller {
	if (!user || user.role < ADMIN_ROLE) throw new PluginRouteError("FORBIDDEN", "Only administrators can view or change site code.", 403);
	return user;
}

export const isAdmin = (user: Caller | undefined): boolean => Boolean(user && user.role >= ADMIN_ROLE);
