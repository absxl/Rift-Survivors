// Showdown-style nickname rules shared by the client profile and the account
// service. Keep this dependency-free so the server and browser agree.
const RESERVED = new Set([
  "admin",
  "administrator",
  "system",
  "moderator",
  "mod",
  "riot",
  "runeterra",
  "rift",
  "support",
]);

export interface NicknameValidation {
  ok: boolean;
  value: string;
  error: string | null;
}

export function validateNickname(input: string): NicknameValidation {
  const value = input.trim();
  if (value.length < 3) return { ok: false, value, error: "Use at least 3 characters." };
  if (value.length > 20) return { ok: false, value, error: "Use at most 20 characters." };
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return { ok: false, value, error: "Letters, numbers, underscore, and hyphen only." };
  }
  if (RESERVED.has(value.toLowerCase())) {
    return { ok: false, value, error: "That name is reserved." };
  }
  return { ok: true, value, error: null };
}
