/**
 * The entry editor panel ("Scripts" beside a saved entry): a Block Kit form
 * for the entry's CSS, JavaScript, head and footer HTML, and body classes.
 */
import { FIELD_LABELS } from "../core/defaults.js";
import type { EntryScripts, SaveProblem } from "../core/types.js";
import { select, textInput, type Block } from "./blocks.js";

export const PANEL_ACTIONS = { save: "save", clear: "clear" } as const;

export interface PanelState {
	scripts: EntryScripts;
	/** False for non-administrators: they get a notice instead of the code. */
	canEdit: boolean;
	hasCode: boolean;
	warnings?: string[];
	problems?: SaveProblem[];
	updated?: { at: string; by: string } | null;
}

export function panelBlocks(state: PanelState): Block[] {
	if (!state.canEdit) {
		return [
			{
				type: "context",
				text: state.hasCode
					? "This entry has custom code. Only administrators can view or change it."
					: "Custom CSS, JavaScript and head or footer code for this entry can be added by an administrator.",
			},
		];
	}

	const { scripts } = state;
	const blocks: Block[] = [];
	if (state.problems?.length) {
		blocks.push({ type: "banner", variant: "error", title: "Not saved", description: state.problems.map((p) => p.message).join(" ") });
	}
	if (state.warnings?.length) {
		blocks.push({ type: "banner", variant: "alert", title: "Check this code", description: state.warnings.join(" ") });
	}

	blocks.push({
		type: "form",
		fields: [
			textInput("css", FIELD_LABELS.css, scripts.css, { multiline: true, placeholder: ".hero { min-height: 60vh; }" }),
			textInput("js", FIELD_LABELS.js, scripts.js, { multiline: true, placeholder: "console.log('This page only');" }),
			select("jsMode", FIELD_LABELS.jsMode, { classic: "Classic <script>", defer: "Deferred (runs after parsing)", module: "Module (type=\"module\")" }, scripts.jsMode),
			select("jsPlacement", FIELD_LABELS.jsPlacement, { footer: "Before </body>", head: "In <head>" }, scripts.jsPlacement),
			textInput("headHtml", FIELD_LABELS.headHtml, scripts.headHtml, { multiline: true, placeholder: "<link rel=\"preload\" …> or <meta …>" }),
			textInput("footerHtml", FIELD_LABELS.footerHtml, scripts.footerHtml, { multiline: true, placeholder: "Embeds and tracking snippets that go before </body>" }),
			textInput("bodyClass", FIELD_LABELS.bodyClass, scripts.bodyClass, { placeholder: "landing no-sidebar" }),
		],
		submit: { label: "Save code", action_id: PANEL_ACTIONS.save },
	});

	blocks.push({
		type: "context",
		text: "CSS and JavaScript go without <style> or <script> tags. Saving updates the live page right away: this code isn't part of the entry's drafts or revisions. Order on the page: site-wide code first, then this entry's HTML, CSS and JavaScript.",
	});

	if (state.hasCode) {
		blocks.push({
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: PANEL_ACTIONS.clear,
					label: "Remove all code",
					style: "danger",
					confirm: { title: "Remove this entry's code?", text: "The CSS, JavaScript, HTML and body classes for this entry are deleted. Site-wide code isn't affected.", confirm: "Remove", deny: "Cancel", style: "danger" },
				},
			],
		});
	}
	if (state.updated) blocks.push({ type: "context", text: `Last saved ${state.updated.at.replace("T", " ").slice(0, 16)} UTC by ${state.updated.by === "import" ? "the WordPress import" : `user ${state.updated.by}`}.` });
	return blocks;
}
