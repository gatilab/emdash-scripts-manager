/** Site-wide records: save, toggle, delete. */
import type { PluginContext } from "emdash";

import { LIMITS } from "../core/defaults.js";
import { normalizeRecord, recordDiagnostics } from "../core/records.js";
import type { SaveProblem, ScriptRecord } from "../core/types.js";
import { allRecords, records } from "./storage.js";

type Ctx = Pick<PluginContext, "storage">;

export interface RecordSaveResult {
	record: ScriptRecord | null;
	problems: SaveProblem[];
	warnings: string[];
}

/** Create (no `id`, or an unknown one) or update a record. */
export async function saveRecord(ctx: Ctx, input: Record<string, unknown>, user: string, now = new Date().toISOString()): Promise<RecordSaveResult> {
	const id = typeof input.id === "string" ? input.id : "";
	const existing = id ? await records(ctx).get(id) : null;
	if (!existing && (await records(ctx).count()) >= LIMITS.records) {
		return { record: null, problems: [{ field: "*", message: `There are already ${LIMITS.records} records.` }], warnings: [] };
	}
	const { record, problems } = normalizeRecord(existing ? input : { ...input, id: "" }, existing ?? undefined, { user, now });
	if (!String(record.name).trim()) problems.push({ field: "name", message: "Give the record a name." });
	if (problems.length) return { record: null, problems, warnings: [] };
	await records(ctx).put(record.id, record);
	return { record, problems, warnings: recordDiagnostics(record, await allRecords(ctx)) };
}

export async function setRecordEnabled(ctx: Ctx, id: string, enabled: boolean, user: string, now = new Date().toISOString()): Promise<ScriptRecord | null> {
	const res = await records(ctx).updateIf(id, { where: {}, set: { enabled, updatedAt: now, updatedBy: user } });
	return res.applied ? (res.data ?? (await records(ctx).get(id))) : null;
}

export async function deleteRecord(ctx: Ctx, id: string): Promise<boolean> {
	return records(ctx).delete(id);
}
