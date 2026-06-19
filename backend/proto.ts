import path from "path";
import protobuf from "protobufjs";

const root = await protobuf.load([
  path.resolve("proto/media.proto"),
  path.resolve("proto/auth.proto"),
]);

// media.proto exports
export const MediaList = root.lookupType("revlclone.MediaList");
export const PlaybackRequest = root.lookupType("revlclone.PlaybackRequest");
export const PlaybackResponse = root.lookupType("revlclone.PlaybackResponse");
export const UserSession = root.lookupType("revlclone.UserSession");
export const PlaybackState = root.lookupType("revlclone.PlaybackState");
export const ErrorResponse = root.lookupType("revlclone.ErrorResponse");

// auth.proto exports
export const LoginRequest = root.lookupType("revlclone.LoginRequest");
export const LoginResponse = root.lookupType("revlclone.LoginResponse");
export const SessionValidateRequest = root.lookupType(
  "revlclone.SessionValidateRequest",
);
export const SessionValidateResponse = root.lookupType(
  "revlclone.SessionValidateResponse",
);

export default root;
