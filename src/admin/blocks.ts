/**
 * The Block Kit subset this plugin's admin uses, typed locally so the
 * package needs nothing beyond `emdash` at runtime. The shapes follow
 * `@emdash-cms/blocks` 1.4; the tests run every screen through its
 * `validateBlockResponse`.
 */

export type LinkTarget = { kind: "content"; collection: string; id: string; locale?: string } | { kind: "plugin-page"; path: string } | { kind: "plugin-settings" } | { kind: "external"; url: string };

export interface ConfirmDialog {
	title: string;
	text: string;
	confirm: string;
	deny: string;
	style?: "danger";
}

export interface TextInput {
	type: "text_input";
	action_id: string;
	label: string;
	placeholder?: string;
	initial_value?: string;
	multiline?: boolean;
}
export interface Select {
	type: "select";
	action_id: string;
	label: string;
	options: { label: string; value: string }[];
	initial_value?: string;
}
export interface Toggle {
	type: "toggle";
	action_id: string;
	label: string;
	description?: string;
	initial_value?: boolean;
}
export interface NumberInput {
	type: "number_input";
	action_id: string;
	label: string;
	initial_value?: number;
	min?: number;
	max?: number;
}
export interface Button {
	type: "button";
	action_id: string;
	label: string;
	style?: "primary" | "danger" | "secondary";
	value?: unknown;
	confirm?: ConfirmDialog;
}
export interface Link {
	type: "link";
	label: string;
	target: LinkTarget;
	appearance?: "inline" | "primary" | "secondary";
}

export type FormField = TextInput | Select | Toggle | NumberInput;
export type ActionElement = Button | Link;

export type Block =
	| { type: "header"; text: string; block_id?: string }
	| { type: "section"; text: string; accessory?: ActionElement; block_id?: string }
	| { type: "divider"; block_id?: string }
	| { type: "context"; text: string; block_id?: string }
	| { type: "fields"; fields: { label: string; value: string }[]; block_id?: string }
	| { type: "banner"; title?: string; description?: string; variant?: "default" | "alert" | "error"; block_id?: string }
	| { type: "stats"; items: { label: string; value: string | number; description?: string }[]; block_id?: string }
	| { type: "actions"; elements: ActionElement[]; block_id?: string }
	| { type: "form"; fields: FormField[]; submit: { label: string; action_id: string }; block_id?: string }
	| {
			type: "table";
			columns: { key: string; label: string; format?: "text" | "badge" | "relative_time" | "number" | "code" | "element" }[];
			rows: Record<string, unknown>[];
			next_cursor?: string;
			page_action_id: string;
			empty_text?: string;
			block_id?: string;
	  }
	| { type: "accordion"; label: string; blocks: Block[]; default_open?: boolean; block_id?: string };

export interface BlockResponse {
	blocks: Block[];
	toast?: { message: string; type: "success" | "error" | "info" };
}

/** What EmDash sends a Block Kit route. */
export type Interaction =
	| { type: "page_load"; page?: string }
	| { type: "panel_load" }
	| { type: "block_action"; action_id: string; block_id?: string; value?: unknown; page?: string }
	| { type: "form_submit"; action_id: string; block_id?: string; values: Record<string, unknown>; page?: string };

export function parseInteraction(input: unknown): Interaction {
	const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
	const actionId = typeof o.action_id === "string" ? o.action_id : "";
	if (o.type === "form_submit") return { type: "form_submit", action_id: actionId, values: o.values && typeof o.values === "object" ? (o.values as Record<string, unknown>) : {} };
	if (o.type === "block_action") return { type: "block_action", action_id: actionId, value: o.value };
	if (o.type === "panel_load") return { type: "panel_load" };
	return { type: "page_load", page: typeof o.page === "string" ? o.page : "/" };
}

export const textInput = (action_id: string, label: string, initial_value: string, opts: { multiline?: boolean; placeholder?: string } = {}): TextInput => ({
	type: "text_input",
	action_id,
	label,
	initial_value,
	...(opts.multiline ? { multiline: true } : {}),
	...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
});

export const select = (action_id: string, label: string, options: Record<string, string>, initial_value: string): Select => ({
	type: "select",
	action_id,
	label,
	options: Object.entries(options).map(([value, text]) => ({ value, label: text })),
	initial_value,
});

/** Block Kit caps one string at 64 KiB; keep previews well under it. */
export const clip = (value: string, max = 120): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
