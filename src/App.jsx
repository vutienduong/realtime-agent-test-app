import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowUpRight, Headphones, Mic, MicOff, RotateCcw, Sparkles, Unplug } from "lucide-react";
import { createWorldRoomConnection, explainConnectionError } from "./realtime/client.js";
import { applyRealtimeEvent, initialTranscriptState } from "./realtime/events.js";

const SEEDS = [
  { label: "Impossible city", prompt: "Start us in an impossible city with one beautiful rule and one dangerous exception." },
  { label: "Stranger arrives", prompt: "Introduce a stranger whose arrival quietly changes the balance of a small world." },
  { label: "Old magic wakes", prompt: "Open with old magic waking somewhere ordinary. Give me one sensory detail and a question." },
];

const STATUS_COPY = {
  idle: "Ready when you are",
  connecting: "Opening the room…",
  connected: "The room is open",
  "recoverable-error": "Connection lost",
};

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function SoundBars({ level = 0, active }) {
  return (
    <span className="sound-bars" aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => (
        <span
          key={index}
          style={{
            transform: `scaleY(${active ? 0.28 + Math.min(0.72, level + ((index * 17) % 5) / 10) : 0.18})`,
          }}
        />
      ))}
    </span>
  );
}

export default function App() {
  const connectionRef = useRef(null);
  const [sessionState, setSessionState] = useState("idle");
  const [transcript, dispatchEvent] = useReducer(applyRealtimeEvent, initialTranscriptState);
  const [selectedSeed, setSelectedSeed] = useState(SEEDS[0]);
  const [muted, setMuted] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);

  const isOpen = sessionState === "connected";
  const activeLevel = transcript.activity === "speaking" ? outputLevel : inputLevel;

  useEffect(() => {
    if (!isOpen) return undefined;
    const startedAt = Date.now() - seconds * 1000;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => () => connectionRef.current?.disconnect(), []);

  const disconnect = useCallback(() => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setSessionState("idle");
    setMuted(false);
    setSeconds(0);
    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  const connect = useCallback(async () => {
    disconnect();
    setError("");
    setSessionState("connecting");

    try {
      const connection = await createWorldRoomConnection({
        openingPrompt: `${selectedSeed.prompt} You are opening the conversation, so greet me in one short vivid spoken turn.`,
        onEvent: dispatchEvent,
        onState: (next) => {
          setSessionState(next);
          if (next === "recoverable-error") {
            setError("The signal slipped away. Your transcript is safe—open the room again to continue.");
          }
        },
        onInputLevel: setInputLevel,
        onOutputLevel: setOutputLevel,
      });
      connectionRef.current = connection;
    } catch (connectionError) {
      setSessionState("idle");
      setError(explainConnectionError(connectionError));
    }
  }, [disconnect, selectedSeed]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    connectionRef.current?.setMuted(next);
  };

  const activityLabel = useMemo(() => {
    if (!isOpen) return STATUS_COPY[sessionState];
    if (muted) return "Microphone paused";
    if (transcript.activity === "listening") return "I’m listening";
    if (transcript.activity === "thinking") return "Shaping the world…";
    if (transcript.activity === "speaking") return "Companion speaking";
    return "Say what happens next";
  }, [isOpen, muted, sessionState, transcript.activity]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="World Room home">
          <span className="brand-mark"><span /></span>
          <span>WORLD ROOM</span>
        </a>
        <div className={`status-chip ${isOpen ? "is-live" : ""}`} role="status">
          <span className="status-dot" />
          {isOpen ? `LIVE · ${formatTime(seconds)}` : STATUS_COPY[sessionState]}
        </div>
      </header>

      <section className="room" id="top">
        <aside className="prompt-rail" aria-label="World starters">
          <p className="eyebrow">Choose a doorway</p>
          <div className="seed-list">
            {SEEDS.map((seed, index) => (
              <button
                className={selectedSeed.label === seed.label ? "seed is-selected" : "seed"}
                key={seed.label}
                onClick={() => setSelectedSeed(seed)}
                disabled={sessionState !== "idle"}
              >
                <span>0{index + 1}</span>
                {seed.label}
                <ArrowUpRight size={15} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          <p className="rail-note">You bring the spark.<br />We’ll make it strange.</p>
        </aside>

        <section className="voice-stage" aria-labelledby="room-heading">
          <div className="stage-copy">
            <p className="eyebrow"><Sparkles size={13} /> Live worldbuilding companion</p>
            <h1 id="room-heading">Build a world<br /><em>out loud.</em></h1>
            <p>Speak a fragment. Follow the voice. Find the story hiding underneath.</p>
          </div>

          <div className={`world-orb state-${sessionState} activity-${transcript.activity}`} style={{ "--energy": activeLevel }}>
            <div className="orb-aura" />
            <div className="orb-rings"><i /><i /><i /></div>
            <div className="orb-core">
              <div className="terrain-lines" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              <SoundBars level={activeLevel} active={isOpen && !muted} />
            </div>
          </div>

          <div className="voice-controls">
            <p className="activity-label" aria-live="polite">{activityLabel}</p>
            {sessionState === "idle" ? (
              <button className="primary-action" onClick={connect}>
                <Mic size={19} /> Open the room
              </button>
            ) : sessionState === "connecting" ? (
              <button className="primary-action is-loading" disabled>
                <span className="spinner" /> Asking for the microphone
              </button>
            ) : sessionState === "recoverable-error" ? (
              <button className="primary-action" onClick={connect}>
                <RotateCcw size={18} /> Reopen the room
              </button>
            ) : (
              <div className="live-actions">
                <button className={muted ? "round-action is-muted" : "round-action"} onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
                  {muted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button className="end-action" onClick={disconnect}><Unplug size={17} /> End session</button>
                <span className="headphone-note"><Headphones size={15} /> headphones help</span>
              </div>
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>
        </section>

        <aside className="transcript-panel" aria-label="Live transcript">
          <div className="transcript-heading">
            <div>
              <p className="eyebrow">Field notes</p>
              <h2>Live transcript</h2>
            </div>
            <span>{transcript.lines.length || "—"}</span>
          </div>
          <div className="transcript-lines" aria-live="polite">
            {transcript.lines.length === 0 ? (
              <div className="empty-transcript">
                <span className="empty-glyph">✦</span>
                <p>Your conversation will gather here as the world takes shape.</p>
              </div>
            ) : (
              transcript.lines.map((line) => (
                <article className={`transcript-line role-${line.role} ${line.pending ? "is-pending" : ""}`} key={line.id}>
                  <span>{line.role === "assistant" ? "ROOM" : "YOU"}</span>
                  <p>{line.text}</p>
                </article>
              ))
            )}
          </div>
          <footer className="transcript-footer">
            <span><i /> {isOpen ? "Capturing this session" : "Transcript stays on this device"}</span>
          </footer>
        </aside>
      </section>

      <footer className="page-footer">
        <span>VOICE-FIRST STORY STUDIO</span>
        <span>Speak freely · interrupt naturally · follow the weird</span>
      </footer>
    </main>
  );
}
