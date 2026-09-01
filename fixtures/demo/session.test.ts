import { rotateRefreshToken } from "./session.js";

if (rotateRefreshToken("token") !== "token-rotated") {
  throw new Error("Expected session refresh to rotate token");
}
