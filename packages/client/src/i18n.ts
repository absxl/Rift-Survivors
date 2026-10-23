// Minimal i18n for M0. Real locale loading (locales/*.json, language switching)
// lands with the content pass (M3+). For now this returns English strings from a
// small local dictionary so the HUD works before the full system exists.

const en: Record<string, string> = {
  "game.title": "Rift Survivors",
  "hud.fps": "FPS: {value}",
  "hud.level": "LV {level}",
  disclaimer: "Unofficial fan project. Not affiliated with or endorsed by Riot Games.",
};

export function t(key: string, params?: Record<string, string | number>): string {
  let value = en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}
