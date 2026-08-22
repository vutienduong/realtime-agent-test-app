import { describe, expect, it } from "vitest";
import { applyRealtimeEvent, initialTranscriptState } from "./events.js";

describe("applyRealtimeEvent", () => {
  it("turns speech start into an active user transcript line", () => {
    const next = applyRealtimeEvent(initialTranscriptState, {
      type: "input_audio_buffer.speech_started",
      item_id: "user-1",
    });

    expect(next.activity).toBe("listening");
    expect(next.lines.at(-1)).toMatchObject({ id: "user-1", role: "user", pending: true });
  });

  it("accumulates assistant audio transcript deltas into one line", () => {
    const first = applyRealtimeEvent(initialTranscriptState, {
      type: "response.output_audio_transcript.delta",
      item_id: "assistant-1",
      delta: "Beyond the",
    });
    const next = applyRealtimeEvent(first, {
      type: "response.output_audio_transcript.delta",
      item_id: "assistant-1",
      delta: " amber gate.",
    });

    expect(next.lines).toContainEqual({
      id: "assistant-1",
      role: "assistant",
      text: "Beyond the amber gate.",
      pending: true,
    });
    expect(next.activity).toBe("speaking");
  });

  it("replaces a pending user line with the completed input transcript", () => {
    const listening = applyRealtimeEvent(initialTranscriptState, {
      type: "input_audio_buffer.speech_started",
      item_id: "user-1",
    });
    const next = applyRealtimeEvent(listening, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "user-1",
      transcript: "A city built inside a sleeping giant.",
    });

    expect(next.lines.at(-1)).toEqual({
      id: "user-1",
      role: "user",
      text: "A city built inside a sleeping giant.",
      pending: false,
    });
  });

  it("surfaces recoverable realtime errors without discarding the transcript", () => {
    const state = {
      ...initialTranscriptState,
      lines: [{ id: "a", role: "assistant", text: "Still here.", pending: false }],
    };
    const next = applyRealtimeEvent(state, {
      type: "error",
      error: { message: "Temporary upstream issue" },
    });

    expect(next.error).toBe("Temporary upstream issue");
    expect(next.lines).toEqual(state.lines);
  });
});
