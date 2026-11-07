/**
 * Site-level helper. Entry code only reaches a page when the page context
 * names the entry (`page.content`). Themes that build their context by hand
 * can use `entryPage()`, which fills `content` from the entry they render:
 *
 * ```astro
 * ---
 * import { EmDashHead, EmDashBodyStart, EmDashBodyEnd } from "emdash/ui";
 * import { entryPage } from "@gatilab/emdash-scripts-manager/site";
 * const page = entryPage(Astro, post, { collection: "posts", title: post.data.title });
 * ---
 * <head><EmDashHead page={page} /></head>
 * <body><EmDashBodyStart page={page} /> … <EmDashBodyEnd page={page} /></body>
 * ```
 */
import type { PublicPageContext } from "emdash";
import { createPublicPageContext } from "emdash/page";

interface AstroLike {
	url: URL;
	currentLocale?: string;
}

interface EntryLike {
	id: string;
	slug?: string | null;
}

export interface EntryPageOptions {
	collection: string;
	title?: string | null;
	description?: string | null;
	pageType?: string;
}

/** A content page context for `entry` in `collection`. */
export function entryPage(astro: AstroLike, entry: EntryLike, options: EntryPageOptions): PublicPageContext {
	return createPublicPageContext({
		Astro: astro,
		kind: "content",
		pageType: options.pageType,
		title: options.title ?? null,
		description: options.description ?? null,
		content: { collection: options.collection, id: entry.id, slug: entry.slug ?? null },
	});
}

/** A non-entry page (archive, search, custom route): global code and records only. */
export function sitePage(astro: AstroLike, options: { title?: string | null; pageType?: string } = {}): PublicPageContext {
	return createPublicPageContext({ Astro: astro, kind: "custom", pageType: options.pageType, title: options.title ?? null });
}
