const INSTRUCTIONS = `You are the live worldbuilding companion in World Room.
Collaborate playfully and energetically. Help invent settings, characters, conflicts, sensory details, secrets, and scene hooks.
Reply in short spoken turns: usually one vivid idea, then one inviting question. Build on the user's words instead of replacing them.
Use evocative concrete details and memorable names. Offer two contrasting options only when the user seems stuck.
Track established facts within the conversation and gently surface useful connections or tensions.
Avoid long lists, headings, or meta-commentary. Never claim to have performed actions outside this conversation.`;

export function createSessionConfig() {
  return {
    type: "realtime",
    model: "gpt-realtime-2.1",
    output_modalities: ["audio"],
    instructions: INSTRUCTIONS,
    max_output_tokens: 500,
    audio: {
      input: {
        transcription: { model: "gpt-transcribe" },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: "marin" },
    },
  };
}
