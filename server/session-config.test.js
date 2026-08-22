import { describe, expect, it } from "vitest";
import { createSessionConfig } from "./session-config.js";

describe("createSessionConfig", () => {
  it("uses the current realtime voice model with audio output and semantic VAD", () => {
    const config = createSessionConfig();

    expect(config).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: "gpt-transcribe" },
          turn_detection: {
            type: "semantic_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice: "marin" },
      },
    });
  });

  it("keeps the companion prompt concise and focused on collaborative worldbuilding", () => {
    const config = createSessionConfig();

    expect(config.instructions).toContain("World Room");
    expect(config.instructions).toContain("one vivid idea");
    expect(config.instructions.length).toBeLessThan(1800);
  });
});
