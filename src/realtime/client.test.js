import { describe, expect, it } from "vitest";
import { explainConnectionError } from "./client.js";

describe("explainConnectionError", () => {
  it("turns blocked microphone permission into actionable copy", () => {
    expect(explainConnectionError({ name: "NotAllowedError" })).toBe(
      "Microphone access is blocked. Allow it in your browser settings, then try again.",
    );
  });

  it("explains when no audio input device exists", () => {
    expect(explainConnectionError({ name: "NotFoundError" })).toBe(
      "No microphone was found. Connect one and try again.",
    );
  });

  it("uses a safe fallback without exposing internal server details", () => {
    expect(explainConnectionError(new Error("secret upstream stack"))).toBe(
      "We couldn’t open the room. Check your connection and try again.",
    );
  });
});
