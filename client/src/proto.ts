import protobuf from "protobufjs";

const root = await protobuf.load(["/proto/media.proto", "/proto/auth.proto"]);

// media.proto exports
export const MediaList = root.lookupType("vlclone.MediaList");
export const PlaybackRequest = root.lookupType("vlclone.PlaybackRequest");
export const PlaybackResponse = root.lookupType("vlclone.PlaybackResponse");
export const UserSession = root.lookupType("vlclone.UserSession");
export const PlaybackState = root.lookupType("vlclone.PlaybackState");
export const ErrorResponse = root.lookupType("vlclone.ErrorResponse");

// auth.proto exports
export const LoginRequest = root.lookupType("vlclone.LoginRequest");
export const LoginResponse = root.lookupType("vlclone.LoginResponse");
export const SessionValidateRequest = root.lookupType(
  "vlclone.SessionValidateRequest",
);
export const SessionValidateResponse = root.lookupType(
  "vlclone.SessionValidateResponse",
);
