/** Framework-free core: types, validation, output order, records and the WordPress import plan. */
export * from "./types.js";
export { ADMIN_ROLE, EMPTY_ENTRY, EMPTY_GLOBAL, FIELD_LABELS, KEY_PREFIX, LIMITS, SETTING_KEYS } from "./defaults.js";
export { entryDiagnostics, filledFields, isEmptyEntry, normalizeEntry, pickEntry } from "./entry.js";
export { activeRecords, generateRecordId, normalizeRecord, recordDiagnostics, recordMarkup, RECORD_LOCATION_LABELS, RECORD_STRATEGY_LABELS, RECORD_TYPE_LABELS } from "./records.js";
export { bodyClassTag, buildFragments, entryCssTag, entryJsTag, ownFragments, renderPlacement, type FragmentInput } from "./render.js";
export { collectionFor, EXPORT_FORMAT, ImportFormatError, planImport, REGISTRY_FORMAT, type ImportOptions, type ImportPlan, type PlannedEntry } from "./importer.js";
export { base64Utf8, classTokens, escapeHtml, escapeScriptClose, escapeStyleClose, safeAssetUrl, utf8Bytes } from "./text.js";
