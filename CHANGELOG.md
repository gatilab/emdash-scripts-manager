# Changelog

## 0.1.0 (unreleased)

First release: an EmDash port of the Marketers Delight Scripts Manager drop-in 3.2.0.

- Per-entry code in a **Scripts** editor panel for any collection: CSS, JavaScript (classic, deferred or module; head or footer), head HTML, footer HTML and body classes.
- Global head, body-start and footer code in the plugin settings.
- Site-wide records from the drop-in's Scripts Manager 3 registry: external and inline JavaScript and CSS and raw HTML, with location, priority and loading strategy, plus its diagnostics.
- Output through EmDash's `page:fragments` hook in a fixed order (site-wide before entry code; HTML, then CSS, then JavaScript), and `ScriptsHead`, `ScriptsBodyStart` and `ScriptsBodyEnd` components for themes without EmDash's head and body components.
- Administrator-only routes, checked by EmDash's `plugins:manage` permission and again in every handler; editors get a notice in the panel.
- Admin page with entries that have code, record management and a WordPress import; a JSON API for scripts and agents; a full export.
- `wordpress/export-scripts-manager.php` and an importer that matches posts to entries by slug, keeps existing code unless told to overwrite, and imports consent-gated or conditional records disabled.
