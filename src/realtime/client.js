export function explainConnectionError(error) {
  if (error?.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it in your browser settings, then try again.";
  }
  if (error?.name === "NotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }
  return "We couldn’t open the room. Check your connection and try again.";
}

function startLevelMeter(stream, onLevel) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return () => {};

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let frameId = 0;

  const sample = () => {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length / 255;
    onLevel(Math.min(1, average * 3.4));
    frameId = requestAnimationFrame(sample);
  };
  sample();

  return () => {
    cancelAnimationFrame(frameId);
    source.disconnect();
    context.close().catch(() => {});
    onLevel(0);
  };
}

export async function createWorldRoomConnection({
  openingPrompt,
  onEvent,
  onState,
  onInputLevel,
  onOutputLevel,
}) {
  // WebRTC browser flow: https://developers.openai.com/api/docs/guides/realtime-webrtc
  const peer = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  const channel = peer.createDataChannel("oai-events");
  const cleanups = [];
  let stream;

  channel.addEventListener("message", (message) => {
    try {
      onEvent(JSON.parse(message.data));
    } catch {
      onEvent({ type: "error", error: { message: "Received an unreadable realtime event." } });
    }
  });

  channel.addEventListener("open", () => {
    onState("connected");
    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: openingPrompt }],
        },
      }),
    );
    channel.send(JSON.stringify({ type: "response.create" }));
  });

  peer.addEventListener("connectionstatechange", () => {
    if (["failed", "disconnected"].includes(peer.connectionState)) onState("recoverable-error");
  });

  peer.addEventListener("track", (event) => {
    const remoteStream = event.streams[0];
    audio.srcObject = remoteStream;
    audio.play().catch(() => {});
    cleanups.push(startLevelMeter(remoteStream, onOutputLevel));
  });

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    cleanups.push(startLevelMeter(stream, onInputLevel));
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch("/api/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp,
    });

    if (!response.ok) throw new Error("session-create-failed");
    await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    cleanups.forEach((cleanup) => cleanup());
    channel.close();
    peer.close();
    throw error;
  }

  return {
    setMuted(muted) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    },
    disconnect() {
      stream.getTracks().forEach((track) => track.stop());
      cleanups.forEach((cleanup) => cleanup());
      channel.close();
      peer.close();
      audio.pause();
      audio.srcObject = null;
    },
  };
}
