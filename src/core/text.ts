/** Small text helpers shared by the renderer, the validators and the importer. */

const encoder = new TextEncoder();

export const utf8Bytes = (value: string): number => encoder.encode(value).length;

export const isBlank = (value: string | null | undefined): boolean => !value || value.trim() === "";

export function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/** Base64 of the UTF-8 bytes (btoa alone only takes Latin-1). */
export function base64Utf8(value: string): string {
	let binary = "";
	for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/**
 * A `</script` inside inline JavaScript would end the element early. `<\/`
 * means the same thing in JS strings, regexes and comments, so this is the
 * one change made to stored code on output (EmDash's own inline scripts do
 * the same). Diagnostics warn about it.
 */
export const escapeScriptClose = (code: string): string => code.replace(/<\/(script)/gi, "<\\/$1");

/** The CSS counterpart: `<\/style` inside a `<style>` element. */
export const escapeStyleClose = (code: string): string => code.replace(/<\/(style)/gi, "<\\/$1");

const CLASS_TOKEN = /^-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/;

/** Split a class list into tokens that are valid CSS class names, and the rest. */
export function classTokens(value: string): { valid: string[]; invalid: string[] } {
	const valid: string[] = [];
	const invalid: string[] = [];
	for (const token of value.split(/\s+/).filter(Boolean)) {
		if (CLASS_TOKEN.test(token)) {
			if (!valid.includes(token)) valid.push(token);
		} else invalid.push(token);
	}
	return { valid, invalid };
}

/** WordPress's sanitize_text_field(), near enough: no tags, no line breaks, collapsed spaces. */
export function sanitizeText(value: unknown): string {
	if (typeof value !== "string" && typeof value !== "number") return "";
	return String(value)
		.replace(/<[^>]*>/g, "")
		.replace(/[\r\n\t ]+/g, " ")
		.trim();
}

/** sanitize_textarea_field(): no tags, line breaks kept. */
export function sanitizeTextarea(value: unknown): string {
	if (typeof value !== "string") return "";
	return value.replace(/<[^>]*>/g, "").trim();
}

/** The registry's clean_id(): lowercase letters, digits, `_` and `-`. */
export const cleanId = (value: unknown): string => String(value ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");

/** The registry's to_bool(). */
export const toBool = (value: unknown): boolean => value === true || value === 1 || value === "1" || value === "yes" || value === "on" || value === "true";

/**
 * esc_url_raw() for asset URLs: `https:`/`http:` and protocol- or
 * root-relative paths only. Anything else (javascript:, data:) becomes "".
 */
export function safeAssetUrl(value: unknown): string {
	const url = typeof value === "string" ? value.trim() : "";
	if (!url || /[\s<>"']/.test(url)) return "";
	if (/^https?:\/\//i.test(url)) return URL.canParse(url) ? url : "";
	if (url.startsWith("/") && !url.startsWith("/\\")) return url;
	return "";
}

export const str = (value: unknown): string => (typeof value === "string" ? value : "");

export const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
