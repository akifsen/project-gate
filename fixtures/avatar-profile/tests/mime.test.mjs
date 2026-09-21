import assert from "node:assert/strict";
import test from "node:test";
import { validateAvatar } from "../mime.mjs";

test("accepts png", () => {
  assert.equal(validateAvatar("image/png", 32).ok, true);
});

test("rejects plain text", () => {
  assert.equal(validateAvatar("text/plain", 32).ok, false);
});
