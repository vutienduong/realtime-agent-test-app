export const initialTranscriptState = {
  activity: "idle",
  lines: [],
  error: "",
};

function upsertLine(lines, nextLine, append = false) {
  const index = lines.findIndex((line) => line.id === nextLine.id);
  if (index === -1) return [...lines, nextLine];

  const updated = [...lines];
  updated[index] = {
    ...updated[index],
    ...nextLine,
    text: append ? `${updated[index].text ?? ""}${nextLine.text ?? ""}` : nextLine.text,
  };
  return updated;
}

export function applyRealtimeEvent(state, event) {
  switch (event.type) {
    case "input_audio_buffer.speech_started":
      return {
        ...state,
        activity: "listening",
        error: "",
        lines: upsertLine(state.lines, {
          id: event.item_id ?? `user-${Date.now()}`,
          role: "user",
          text: "Listening…",
          pending: true,
        }),
      };
    case "input_audio_buffer.speech_stopped":
      return { ...state, activity: "thinking" };
    case "conversation.item.input_audio_transcription.completed":
      return {
        ...state,
        lines: upsertLine(state.lines, {
          id: event.item_id,
          role: "user",
          text: event.transcript?.trim() || "Voice note captured",
          pending: false,
        }),
      };
    case "response.output_audio_transcript.delta":
      return {
        ...state,
        activity: "speaking",
        error: "",
        lines: upsertLine(
          state.lines,
          {
            id: event.item_id ?? event.response_id,
            role: "assistant",
            text: event.delta ?? "",
            pending: true,
          },
          true,
        ),
      };
    case "response.output_audio_transcript.done":
      return {
        ...state,
        lines: upsertLine(state.lines, {
          id: event.item_id ?? event.response_id,
          role: "assistant",
          text: event.transcript?.trim() || "",
          pending: false,
        }),
      };
    case "response.done":
      return { ...state, activity: "ready" };
    case "error":
      return {
        ...state,
        activity: "ready",
        error: event.error?.message || "The realtime session hit a snag.",
      };
    default:
      return state;
  }
}
