/**
 * Route behind the entry editor panel. EmDash attaches the saved entry's
 * identity as `ctx.ui.entry`, after checking the caller may edit that entry.
 * The route admits anyone who can edit content, so editors and authors see
 * a short notice instead of an error; reading or changing code needs an
 * administrator.
 */
import { PluginRouteError } from "emdash";
import type { RouteContext } from "emdash";

import { parseInteraction, type BlockResponse } from "../admin/blocks.js";
import { PANEL_ACTIONS, panelBlocks } from "../admin/panel.js";
import { EMPTY_ENTRY } from "../core/defaults.js";
import { entryDiagnostics, pickEntry } from "../core/entry.js";
import { ENTRY_TEXT_FIELDS } from "../core/types.js";
import { deleteEntryScripts, getEntryScripts, saveEntryScripts } from "./entries.js";
import { isAdmin, requireAdmin } from "./storage.js";

const FORM_KEYS = [...ENTRY_TEXT_FIELDS, "jsMode", "jsPlacement"] as const;

export async function editorPanel(ctx: RouteContext<unknown>): Promise<BlockResponse> {
	const ui = ctx.ui;
	if (!ui || ui.surface !== "content-editor-panel" || !ui.entry) throw new PluginRouteError("INVALID_REQUEST", "This route serves the entry editor panel.", 400);
	const { collection, id } = ui.entry;
	const interaction = parseInteraction(ctx.input);

	if (!isAdmin(ctx.user)) {
		if (interaction.type !== "panel_load") requireAdmin(ctx.user);
		const stored = await getEntryScripts(ctx, collection, id);
		return { blocks: panelBlocks({ scripts: EMPTY_ENTRY, canEdit: false, hasCode: Boolean(stored) }) };
	}
	const user = requireAdmin(ctx.user);

	if (interaction.type === "form_submit" && interaction.action_id === PANEL_ACTIONS.save) {
		const input: Record<string, unknown> = {};
		for (const key of FORM_KEYS) if (Object.hasOwn(interaction.values, key)) input[key] = interaction.values[key];
		const result = await saveEntryScripts(ctx, collection, id, input, user.id);
		if (!result.saved) {
			return { blocks: panelBlocks({ scripts: result.scripts, canEdit: true, hasCode: true, problems: result.problems }), toast: { message: "Not saved. See the message above the form.", type: "error" } };
		}
		const stored = result.cleared ? null : await getEntryScripts(ctx, collection, id);
		return {
			blocks: panelBlocks({ scripts: result.scripts, canEdit: true, hasCode: !result.cleared, warnings: result.warnings, updated: stored ? { at: stored.updatedAt, by: stored.updatedBy } : null }),
			toast: { message: result.cleared ? "All fields are empty, so this entry's code was removed." : "Code saved. It's live on this entry's page.", type: "success" },
		};
	}

	if (interaction.type === "block_action" && interaction.action_id === PANEL_ACTIONS.clear) {
		const removed = await deleteEntryScripts(ctx, collection, id);
		return { blocks: panelBlocks({ scripts: EMPTY_ENTRY, canEdit: true, hasCode: false }), toast: { message: removed ? "This entry's code was removed." : "This entry had no code.", type: "success" } };
	}

	const stored = await getEntryScripts(ctx, collection, id);
	const scripts = stored ? pickEntry(stored) : EMPTY_ENTRY;
	return { blocks: panelBlocks({ scripts, canEdit: true, hasCode: Boolean(stored), warnings: entryDiagnostics(scripts), updated: stored ? { at: stored.updatedAt, by: stored.updatedBy } : null }) };
}
