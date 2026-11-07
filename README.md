# Scripts Manager for EmDash

Per-page code for [EmDash](https://emdashcms.com) sites: custom CSS, JavaScript, head HTML and footer HTML on any content entry, plus site-wide head, body-start and footer code. Only administrators can see or change any of it.

It's a port of the Scripts Manager drop-in for the Marketers Delight WordPress theme (3.2.0). Its global fields, per-post fields and named records carry over through a WordPress export script.

- **Per-entry code** in a **Scripts** panel beside every saved entry, in any collection: CSS, JavaScript (classic, deferred or module, in the head or before `</body>`), head HTML, footer HTML and body classes.
- **Global code** for `<head>`, the start of `<body>` and before `</body>`, in the plugin settings.
- **Site-wide records**: named snippets (external or inline JavaScript and CSS, raw HTML) with a location, a priority and a loading strategy, from the drop-in's Scripts Manager 3 registry.
- **A fixed output order**, so global code always comes before an entry's, and an entry's CSS can override what loads above it.
- **Diagnostics** for common mistakes: wrapper tags inside CSS or JavaScript, `document.write()`, insecure URLs, blocking head scripts, duplicate assets.

## Install

```sh
pnpm add @gatilab/emdash-scripts-manager
```

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { scriptsManager } from "@gatilab/emdash-scripts-manager";

export default defineConfig({
	integrations: [emdash({ plugins: [scriptsManager()] })],
});
```

Limit the Scripts panel to some collections with `scriptsManager({ collections: ["posts", "pages"] })`.

The plugin asks for two capabilities:
- `hooks.page-fragments:register`: to print code into public pages. EmDash only runs this hook for trusted (native) plugins.
- `content:read`: entry titles in the admin list, slug matching during the WordPress import, and removing an entry's code when the entry is permanently deleted.

## Putting the code on pages

The plugin contributes its code through EmDash's `page:fragments` hook. If your layout already renders EmDash's head and body components, there's nothing else to do:

```astro
---
import { EmDashHead, EmDashBodyStart, EmDashBodyEnd } from "emdash/ui";
---
<html>
	<head>
		<EmDashHead page={page} />
	</head>
	<body>
		<EmDashBodyStart page={page} />
		<slot />
		<EmDashBodyEnd page={page} />
	</body>
</html>
```

An entry's code is only added when the page context names the entry. Pages built with `createPublicPageContext({ Astro, kind: "content", content: { collection, id } })` already do. If yours don't, `entryPage()` builds one:

```astro
---
import { entryPage } from "@gatilab/emdash-scripts-manager/site";
const page = entryPage(Astro, post, { collection: "posts", title: post.data.title });
---
```

Pages that aren't entries (archives, search, custom routes) get the global code and records only. `sitePage(Astro)` builds that context.

### Themes without EmDash's components

Use this package's components instead, in the same three places. They print only this plugin's code:

```astro
---
import { ScriptsHead, ScriptsBodyStart, ScriptsBodyEnd } from "@gatilab/emdash-scripts-manager/astro";
---
<head><ScriptsHead page={page} /></head>
<body>
	<ScriptsBodyStart page={page} />
	<slot />
	<ScriptsBodyEnd page={page} />
</body>
```

Use one set or the other. With both, the code prints twice.

## Output order

| Place | Order |
| --- | --- |
| `<head>` | global head code → records in the head → entry head HTML → entry CSS → entry JavaScript (if placed in the head) |
| start of `<body>` | entry body classes → global body-start code → records at body start |
| before `</body>` | global footer code → records in the footer → entry footer HTML → entry JavaScript |

Records run lowest priority first; ties go by name. Empty fields print nothing.

How each field is printed:
- **Global code, head HTML and footer HTML** print exactly as saved.
- **CSS** goes in `<style id="scripts-manager-entry-css">`. Enter it without the `<style>` tag.
- **JavaScript** goes in `<script id="scripts-manager-entry-js">`. Enter it without the `<script>` tag. The type option decides how it runs:
  - **Classic** runs where it's printed.
  - **Module** adds `type="module"`: deferred, strict mode, its own scope.
  - **Deferred** loads the code from a `data:` URL with `defer`, because browsers ignore `defer` on inline scripts. A Content-Security-Policy has to allow `data:` in `script-src` for this to run.
- **Body classes** are added by a one-line script at the very start of `<body>`, before any content renders. Tokens that aren't valid class names are left out, and the panel says which.

The one change made to saved code on output: `</script` inside JavaScript and `</style` inside CSS are written as `<\/script` and `<\/style`, so a string in your code can't close the element early. Both mean the same thing to the browser's JavaScript and CSS parsers. The panel warns when it happens.

## Editing code

**Per entry.** Open a saved entry and use the **Scripts** panel. Saving updates the live page right away: this code isn't part of the entry's drafts, revisions or scheduled publishing. Empty every field, or use **Remove all code**, to delete it. New entries get the panel after their first save.

**Global.** Go to **Plugins › Scripts Manager › Settings**. These three fields are raw HTML, so wrap CSS in `<style>` and JavaScript in `<script>`.

**Records.** **Plugins › Scripts Manager** lists entries with code and the site-wide records. Records can be added, edited, turned on and off, and deleted there.

## Trust model

Everything this plugin stores is code that runs in your visitors' browsers with your site's origin. It's built on these rules:

- **Administrators only.** Viewing, saving, importing and exporting code needs an administrator (EmDash role 50). EmDash checks each route's permission (`plugins:manage`) before it runs, and every handler checks the role again. Global code lives in plugin settings, which only `plugins:manage` can change.
- **Editors and authors see a notice, not the code.** The Scripts panel route admits anyone who can edit the entry, so they get "only administrators can change this" rather than an error. Their saves are refused.
- **Per-entry code is not stored in the entry.** It sits in plugin storage, keyed by collection and entry id. So editing an entry, through the editor, the REST API or MCP, can never change its code.
- **Nothing is sanitized.** What an administrator enters is stored and printed exactly, apart from the `</script` and `</style` escape above. Fields that are invalid, or over the size limit, refuse the save with a reason. They're never quietly trimmed or rewritten.
- **No server-side execution.** Code only ever runs in the browser.
- **Limits:** 48 KiB per field, 192 KiB per entry, 48 KiB per record, 500 records.

If you give someone the administrator role, you're trusting them with script access to every page. That's the same trust WordPress's `unfiltered_html` and the drop-in's `manage_options` check implied.

## API

Private JSON routes under `/_emdash/api/plugins/scripts-manager/`, for scripts and agents with an administrator session or API token. All are `POST`:

| Route | Body | Returns |
| --- | --- | --- |
| `entries/get` | `{ collection, id }` | `{ scripts }` (or `null`) |
| `entries/save` | `{ collection, id, css?, js?, jsMode?, jsPlacement?, headHtml?, footerHtml?, bodyClass? }` | `{ scripts, cleared, warnings }` |
| `entries/delete` | `{ collection, id }` | `{ removed }` |
| `entries/list` | `{ collection?, cursor?, limit? }` | `{ items, cursor? }` |
| `records/list` | `{}` | `{ items }`, each with its `warnings` |
| `records/save` | a record; without `id` it's created | `{ record, warnings }` |
| `records/delete` | `{ id }` | `{ removed }` |
| `export` | `{}` | global code, records and every entry's code |
| `import` | see below | an import report |

`entries/save` only changes the fields you send. Send `null` or `""` to clear one. `jsMode` is `classic`, `defer` or `module`, and `jsPlacement` is `footer` or `head`.

## Migrating from WordPress

[`wordpress/export-scripts-manager.php`](./wordpress/export-scripts-manager.php) is a read-only WP-CLI script:

```sh
wp eval-file export-scripts-manager.php > scripts.json
```

Then paste the file into **Import from WordPress** on the plugin page, or post it to the `import` route:

```json
{
	"payload": { "format": "md-scripts-manager-export", "...": "..." },
	"collections": { "post": "posts", "page": "pages" },
	"entries": { "123": "pages:01JD8X…" },
	"overwrite": false
}
```

The file on its own also works as the body. The drop-in's own **Export** from its Scripts screen (`format: "md-scripts-manager"`) imports its records.

What maps where:

| WordPress | EmDash |
| --- | --- |
| `marketers_delight` option, `settings.header_scripts` | global head code |
| `marketers_delight` option, `settings.footer_scripts` | global footer code |
| post meta `marketers_delight` → `scripts.header_scripts` | entry head HTML |
| post meta `marketers_delight` → `scripts.footer_scripts` | entry footer HTML |
| post meta `marketers_delight` → `scripts.body_class` | entry body classes |
| `md_scripts_manager` option, `items` | site-wide records |

How the import behaves:
- **Posts are matched to entries by slug**, in the collection EmDash's WordPress importer would have used (`post` → `posts`, `page` → `pages`, other types by name). Use `collections` to change that, or `entries` to pin a WordPress id to an entry. Posts that don't match are listed in the report.
- **Header and footer code is exported as WordPress printed it**, through `html_entity_decode()`. Record code is exported as stored.
- **Re-running is safe.** Entries that already have code, global fields that are already set, and records already imported (by their WordPress id) are kept unless `overwrite` is on.
- **Gated records arrive turned off.** A record that waited for a consent category, or loaded only where its visibility conditions matched, would load on every page here. It's imported disabled, with a note saying why. Records that relied on WordPress script handles keep a note too.
- **Some things aren't imported**, and the report counts them:
  - term (category and tag) scripts
  - per-post "Scripts Optimization" dequeue choices
  - built-in integrations (GA4, Tag Manager, pixels, chat)
  - editor-preview switches

## What's different from the WordPress drop-in

- **Per-entry CSS and JavaScript are their own fields**, with module and defer options. WordPress only had head and footer code per post. Imported code lands in head and footer HTML unchanged.
- **Every collection gets the panel**, not only posts and pages.
- **Global code and records print before an entry's code.** WordPress printed inline registry records after a post's code.
- **There's a global body-start field.** WordPress only had body-start records, plus the Tag Manager `<noscript>` tag.
- **Not ported:**
  - consent categories and the consent API
  - visibility conditions
  - WordPress dependency handles
  - record revisions and the deleted view
  - block-editor previews
  - dequeuing other plugins' assets
  - term scripts
  - the built-in analytics, pixel and chat integrations

## License

MIT. See [LICENSE](./LICENSE).
