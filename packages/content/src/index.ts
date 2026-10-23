// Content package: typed + validated game data. The engine references this only
// by id/behavior strings; names live here and in locale files.
export { contentPackSchema } from "./schema";
export { loadCorePack } from "./packs/core";
export const CONTENT_SCHEMA_VERSION = 1;
