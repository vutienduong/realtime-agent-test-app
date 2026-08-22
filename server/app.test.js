import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerApp } from "./app.js";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function startApp(options = {}) {
  const app = createServerApp(options);
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

describe("POST /api/realtime-session", () => {
  it("refuses to start when the server API key is missing", async () => {
    const baseUrl = await startApp({ apiKey: "", openaiFetch: vi.fn() });
    const response = await fetch(`${baseUrl}/api/realtime-session`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: "v=0\r\n",
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Realtime service is not configured." });
  });

  it("only accepts bounded SDP payloads", async () => {
    const baseUrl = await startApp({ apiKey: "test-key", openaiFetch: vi.fn() });
    const response = await fetch(`${baseUrl}/api/realtime-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Expected an SDP offer." });
  });

  it("forwards SDP and trusted session configuration without exposing the API key", async () => {
    const openaiFetch = vi.fn(async () =>
      new Response("v=0\r\na=answer", {
        status: 201,
        headers: { "Content-Type": "application/sdp" },
      }),
    );
    const baseUrl = await startApp({ apiKey: "test-key", openaiFetch });
    const response = await fetch(`${baseUrl}/api/realtime-session`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: "v=0\r\na=offer",
    });

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("v=0\r\na=answer");
    expect(openaiFetch).toHaveBeenCalledOnce();
    const [url, request] = openaiFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(request.headers.Authorization).toBe("Bearer test-key");
    expect(request.body.get("sdp")).toBe("v=0\r\na=offer");
    expect(JSON.parse(request.body.get("session"))).toMatchObject({
      model: "gpt-realtime-2.1",
      type: "realtime",
    });
  });

  it("returns a generic retryable error when OpenAI rejects session creation", async () => {
    const openaiFetch = vi.fn(async () => new Response("sensitive upstream detail", { status: 429 }));
    const baseUrl = await startApp({ apiKey: "test-key", openaiFetch });
    const response = await fetch(`${baseUrl}/api/realtime-session`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: "v=0\r\n",
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Could not open a realtime session. Please retry." });
  });
});

describe("GET /api/health", () => {
  it("reports whether realtime is configured without returning the key", async () => {
    const baseUrl = await startApp({ apiKey: "test-key", openaiFetch: vi.fn() });
    const response = await fetch(`${baseUrl}/api/health`);

    expect(await response.json()).toEqual({ ok: true, realtimeConfigured: true });
  });
});
