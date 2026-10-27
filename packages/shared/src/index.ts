// Shared network protocol + zod-validated message schemas (docs/07).
export {
  PROTOCOL_VERSION,
  clientMessageSchema,
  type ClientMessage,
  type ServerMessage,
  type LobbyPlayer,
} from "./protocol";
export { validateNickname, type NicknameValidation } from "./nickname";
