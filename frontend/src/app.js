console.log("app.js loaded");
import { Room, RoomEvent, Track } from "livekit-client";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

class CushionVoiceAgent {
  constructor() {
    this.room = new Room();
    this.state = {
      connected: false,
      loading: false,
      transcriptCount: 0,
      lastAction: "Idle",
      roomName: "Pending"
    };
    this.hasRemoteAudio = false;
    this.lastAssistantText = "";
    this.lastAssistantTimestamp = 0;
    this.lastFlowchartSourceText = "";

    this.statusEl = document.getElementById("status");
    this.logEl = document.getElementById("log");
    this.connectBtn = document.getElementById("connect");
    this.disconnectBtn = document.getElementById("disconnect");
    this.sendBtn = document.getElementById("send");
    this.requestStatusBtn = document.getElementById("request-status");
    this.notifyLoadedBtn = document.getElementById("notify-loaded");
    this.clearLogBtn = document.getElementById("clear-log");
    this.generateFlowchartBtn = document.getElementById("generate-flowchart");

    this.avatarEl = document.getElementById("avatar");
    this.avatarStatusEl = document.getElementById("avatar-status");
    this.scriptLogEl = document.getElementById("scriptLog");
    this.responseEl = document.getElementById("response");
    this.flowchartEl = document.getElementById("flowchart");
    this.metricConnectionEl = document.getElementById("metric-connection");
    this.metricTranscriptEl = document.getElementById("metric-transcript");
    this.metricActionEl = document.getElementById("metric-action");
    this.metricRoomEl = document.getElementById("metric-room");
    this.eventDotEl = document.getElementById("event-dot");
    this.eventStateEl = document.getElementById("event-state");

    this.connectBtn.addEventListener("click", () => this.connect());
    this.disconnectBtn.addEventListener("click", () => this.disconnect());
    this.sendBtn.addEventListener("click", () => this.sendClientAction("user_clicked_buy", { productId: "123" }));
    this.requestStatusBtn.addEventListener("click", () => this.sendClientAction("manager_requested_status", { source: "dashboard" }));
    this.notifyLoadedBtn.addEventListener("click", () => this.sendClientAction("dashboard_loaded", { source: "frontend", behavior: "notify" }));
    this.clearLogBtn.addEventListener("click", () => this.clearPanels());
    this.generateFlowchartBtn.addEventListener("click", () => this.generateFlowchartFromLatestResponse());

    this.setupEventHandlers();
    this.updateUI();
    this.setAvatarState("idle");
    this.loadAvatar();
  }

  async loadAvatar() {
    const fallbackAvatar = this.buildFallbackAvatar();
    this.avatarEl.src = fallbackAvatar;

    this.avatarEl.onerror = () => {
      this.avatarEl.onerror = null;
      this.avatarEl.src = fallbackAvatar;
    };

    try {
      const resp = await fetch("/api/avatar");
      if (resp.ok) {
        const { imageUrl } = await resp.json();
        if (imageUrl) this.avatarEl.src = imageUrl;
      }
    } catch (err) {
      console.warn("Avatar backend unavailable, using local art.", err);
    }
  }

  buildFallbackAvatar() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10243b" />
            <stop offset="100%" stop-color="#0d5ea8" />
          </linearGradient>
          <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#63d0ff" />
            <stop offset="100%" stop-color="#5dd39e" />
          </linearGradient>
        </defs>
        <rect width="256" height="256" rx="72" fill="url(#bg)" />
        <rect x="12" y="12" width="232" height="232" rx="60" fill="none" stroke="url(#ring)" stroke-width="6" opacity="0.9" />
        <circle cx="128" cy="102" r="46" fill="#d7ecff" />
        <path d="M72 185c14-28 39-42 56-42s42 14 56 42" fill="#d7ecff" />
        <circle cx="112" cy="96" r="6" fill="#0a1a2d" />
        <circle cx="144" cy="96" r="6" fill="#0a1a2d" />
        <path d="M118 116c8 7 12 7 20 0" stroke="#0a1a2d" stroke-width="5" stroke-linecap="round" fill="none" />
        <text x="50%" y="222" text-anchor="middle" fill="#63d0ff" font-family="IBM Plex Sans, Arial, sans-serif" font-size="24" font-weight="700">CA</text>
      </svg>`;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  setStatus(text, level = "info") {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.style.color = level === "error" ? "#f56565" : level === "warn" ? "#d69e2e" : "#38a169";
  }

  setAvatarState(state) {
    if (this.avatarEl) {
      this.avatarEl.classList.remove("speaking");
      if (state === "speaking") {
        this.avatarEl.classList.add("speaking");
      }
    }
    if (this.avatarStatusEl) {
      this.avatarStatusEl.textContent = state;
    }
  }

  addScriptEntry(role, text) {
    if (!this.scriptLogEl) return;
    this.scriptLogEl.classList.remove("empty");
    const entry = document.createElement("div");
    entry.className = "script-entry";
    entry.innerHTML = `<span class="role">${role}:</span> ${text}`;
    this.scriptLogEl.appendChild(entry);
    this.scriptLogEl.scrollTop = this.scriptLogEl.scrollHeight;
    this.state.transcriptCount += 1;
    this.metricTranscriptEl.textContent = String(this.state.transcriptCount);
  }

  async handleAssistantOutput(data) {
    if (!data || typeof data !== "object") return;

    if (data.text) {
      this.responseEl.classList.remove("empty");
      this.responseEl.textContent = data.text;
      this.setAvatarState("speaking");
      this.speakText(data.text);
    }

    const mermaidSource = data.mermaid || this.extractMermaidFromText(data.text);

    if (mermaidSource) {
      await this.renderFlowchart(mermaidSource);
      return;
    }

    if (data.text) {
      await this.generateFlowchartFromAssistantText(data.text);
    }
  }

  async renderFlowchart(mermaidSource) {
    try {
      const { svg } = await mermaid.render(`flowchart-svg-${Date.now()}`, mermaidSource);
      this.flowchartEl.classList.remove("empty");
      this.flowchartEl.innerHTML = svg;
    } catch (err) {
      console.warn("Mermaid render failed", err);
      this.flowchartEl.classList.remove("empty");
      this.flowchartEl.textContent = "Unable to render Mermaid diagram for this response.";
    }
  }

  async generateFlowchartFromAssistantText(text) {
    const sourceText = String(text || "").trim();
    if (!sourceText || sourceText === this.lastFlowchartSourceText) {
      return;
    }

    const localMermaid = this.extractMermaidFromText(sourceText);
    if (localMermaid) {
      this.lastFlowchartSourceText = sourceText;
      await this.renderFlowchart(localMermaid);
      return;
    }

    this.lastFlowchartSourceText = sourceText;
    this.flowchartEl.classList.remove("empty");
    this.flowchartEl.textContent = "Generating flowchart from assistant response...";

    try {
      const response = await fetch("/api/flowchart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: sourceText })
      });

      if (!response.ok) {
        let errorMessage = `Flowchart API failed: ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody?.error) {
            errorMessage = errorBody.error;
          }
        } catch (parseError) {
          // Ignore JSON parse failures and keep the HTTP status message.
        }
        throw new Error(errorMessage);
      }

      const { mermaid: generatedMermaid } = await response.json();
      if (generatedMermaid) {
        await this.renderFlowchart(generatedMermaid);
        return;
      }

      this.flowchartEl.classList.add("empty");
      this.flowchartEl.textContent = "No flowchart could be derived from this response.";
    } catch (error) {
      console.error("generateFlowchartFromAssistantText error", error);
      this.flowchartEl.classList.add("empty");
      this.flowchartEl.textContent = `Flowchart generation failed: ${error?.message || "Unknown error"}`;
    }
  }

  async generateFlowchartFromLatestResponse() {
    const latestResponse = String(this.responseEl?.textContent || "").trim();
    if (!latestResponse || latestResponse === "Assistant response will appear here.") {
      this.log("No assistant response available for flowchart generation.", "warn");
      return;
    }

    this.log("Generating flowchart from latest assistant response...");
    this.state.lastAction = "Generate Flowchart";
    this.updateMetrics();
    this.lastFlowchartSourceText = "";
    await this.generateFlowchartFromAssistantText(latestResponse);
  }

  extractMermaidFromText(text) {
    const rawText = String(text || "").trim();
    if (!rawText) return "";

    const fencedMatch = rawText.match(/```mermaid\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const normalized = rawText
      .replace(/\*\*/g, "")
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized.includes("->") && !normalized.includes("→")) {
      return "";
    }

    const arrowMatches = normalized.match(/[^.?!\n]+(?:->|→)[^.?!\n]+/g) || [];
    const candidate = arrowMatches.sort((a, b) => b.length - a.length)[0] || normalized;

    const cleanedCandidate = candidate
      .replace(/^[^A-Za-z0-9(]*/, "")
      .replace(/\b(here'?s|here is|flow|process|basically|loop)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const parts = cleanedCandidate
      .split(/(?:->|→)/)
      .map((part) =>
        part
          .replace(/^[^A-Za-z0-9(]+|[^A-Za-z0-9)]*$/g, "")
          .replace(/\b(and|then)\b$/gi, "")
          .trim()
      )
      .filter(Boolean);

    if (parts.length < 2) {
      return "";
    }

    const uniqueParts = [];
    for (const part of parts) {
      const previous = uniqueParts[uniqueParts.length - 1];
      if (!previous || previous.toLowerCase() !== part.toLowerCase()) {
        uniqueParts.push(part);
      }
    }

    if (uniqueParts.length < 2) {
      return "";
    }

    const nodes = uniqueParts.map((part, index) => {
      const label = part.replace(/"/g, "'");
      return `N${index}["${label}"]`;
    });

    const edges = nodes.slice(0, -1).map((node, index) => `${node} --> ${nodes[index + 1]}`);
    return `graph LR\n${edges.join("\n")}`;
  }

  speakText(text) {
    if (this.hasRemoteAudio) {
      return;
    }

    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => this.setAvatarState("idle");
      speechSynthesis.speak(utterance);
    } else {
      this.setAvatarState("idle");
    }
  }

  isDuplicateAssistantText(text) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) return false;

    const now = Date.now();
    const isDuplicate =
      normalizedText === this.lastAssistantText &&
      now - this.lastAssistantTimestamp < 4000;

    this.lastAssistantText = normalizedText;
    this.lastAssistantTimestamp = now;
    return isDuplicate;
  }

  log(message, type = "info") {
    if (!this.logEl) return;
    this.logEl.classList.remove("empty");
    const item = document.createElement("div");
    item.className = `log-item log-${type}`;
    item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.logEl.prepend(item);
  }

  updateMetrics() {
    if (this.metricConnectionEl) {
      this.metricConnectionEl.textContent = this.state.connected ? "Live" : this.state.loading ? "Connecting" : "Offline";
    }
    if (this.metricTranscriptEl) {
      this.metricTranscriptEl.textContent = String(this.state.transcriptCount);
    }
    if (this.metricActionEl) {
      this.metricActionEl.textContent = this.state.lastAction;
    }
    if (this.metricRoomEl) {
      this.metricRoomEl.textContent = this.state.roomName || "Pending";
    }
    if (this.eventStateEl) {
      this.eventStateEl.textContent = this.state.connected ? "Streaming events" : this.state.loading ? "Connecting..." : "Awaiting connection";
    }
    if (this.eventDotEl) {
      this.eventDotEl.classList.toggle("live", this.state.connected);
    }
  }

  updateUI() {
    const { connected, loading } = this.state;
    this.connectBtn.disabled = loading || connected;
    this.disconnectBtn.disabled = loading || !connected;
    this.sendBtn.disabled = loading || !connected;
    this.requestStatusBtn.disabled = loading || !connected;
    this.notifyLoadedBtn.disabled = loading || !connected;
    this.generateFlowchartBtn.disabled = loading;

    if (loading) {
      this.setStatus("connecting...", "warn");
    } else if (connected) {
      this.setStatus("connected", "success");
    } else {
      this.setStatus("disconnected", "warn");
    }

    this.updateMetrics();
    console.debug("UI state:", { connected, loading, disabled: this.connectBtn.disabled });
  }

  setupEventHandlers() {
    this.room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        this.hasRemoteAudio = true;
        const audioEl = track.attach();
        audioEl.autoplay = true;
        audioEl.muted = false;
        document.body.appendChild(audioEl);
      }
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log("LiveKit connection state:", state);
      if (state === "connected") this.state.connected = true;
      if (state === "disconnected") this.state.connected = false;
      this.state.lastAction = state;
      this.updateUI();
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log("Disconnected from voice room");
      this.state.connected = false;
      this.state.roomName = "Pending";
      this.state.lastAction = "Disconnected";
      this.hasRemoteAudio = false;
      this.updateUI();
    });

    this.room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
      let msg;
      try {
        msg = JSON.parse(new TextDecoder().decode(payload));
      } catch (err) {
        console.warn("Invalid data event payload", err);
        return;
      }

      console.log("Data received", { topic, msg });

      if (topic === "assistant_script" || topic === "assistant_response") {
        if (msg.text && this.isDuplicateAssistantText(msg.text)) {
          this.state.lastAction = `${topic} deduped`;
          this.updateMetrics();
          return;
        }

        this.addScriptEntry(msg.role || "assistant", msg.text || JSON.stringify(msg));
        this.state.lastAction = topic;
        if (msg.text || msg.mermaid) {
          this.handleAssistantOutput(msg);
        }
        this.updateMetrics();
        return;
      }

      if (topic === "transcript") {
        this.addScriptEntry("you", msg.text || "(voice)");
        this.state.lastAction = "transcript";
        this.updateMetrics();
        return;
      }

      if (topic === "client_actions") {
        const action = msg?.action || msg?.type;

        if (action === "heartbeat" || action === "keepalive" || action === "ping") {
          return;
        }

        this.state.lastAction = action || "client_actions";

        if (action === "send_transcript" && msg?.payload?.text) {
          const speaker = msg.payload.role === "user" ? "you" : "assistant";

          if (speaker === "assistant" && this.isDuplicateAssistantText(msg.payload.text)) {
            this.updateMetrics();
            return;
          }

          this.addScriptEntry(speaker, msg.payload.text);
          if (speaker === "assistant") {
            this.handleAssistantOutput({ text: msg.payload.text });
          }
          this.updateMetrics();
          return;
        }

        if (msg.text) {
          this.addScriptEntry(msg.role || "assistant", msg.text);
          if (msg.mermaid) {
            this.handleAssistantOutput(msg);
          }
        } else if (action) {
          console.log("Action event:", action, msg.payload);
          this.log(`Received client action: ${action}`, "success");
        }

        this.updateMetrics();
      }
    });
  }

  async connect() {
    if (this.state.loading) return;
    this.state.loading = true;
    this.updateUI();
    this.log("Starting connection...");

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      this.log("Microphone permission granted.");

      const tokenResp = await fetch("/api/voice-token");
      if (!tokenResp.ok) {
        throw new Error(`Token API failed: ${tokenResp.status}`);
      }

      const { livekit_url, token } = await tokenResp.json();
      this.log(`Token received (livekit_url=${livekit_url}).`);

      await this.room.connect(livekit_url, token);
      await this.room.localParticipant.setMicrophoneEnabled(true);
      this.state.connected = true;
      this.state.roomName = this.room.name || "Live";
      this.state.lastAction = "Connected";
      this.log(`Connected to voice room: ${this.room.name || "(unknown)"}`);
    } catch (err) {
      console.error("connect error", err);
      this.log(`Connect error: ${err?.message || err}`, "error");
      alert(`Unable to connect: ${err?.message || err}`);
      this.state.connected = false;
      this.state.lastAction = "Error";
    } finally {
      this.state.loading = false;
      this.updateUI();
    }
  }

  async disconnect() {
    try {
      await this.room.disconnect();
      this.state.connected = false;
      this.state.roomName = "Pending";
      this.state.lastAction = "Disconnected";
      this.log("Disconnected from voice room.");
    } catch (err) {
      console.error("disconnect error", err);
      this.log(`Disconnect error: ${err?.message || err}`, "error");
    } finally {
      this.updateUI();
    }
  }

  async sendClientAction(action, payload = {}) {
    if (!this.state.connected) {
      this.log("Cannot send action: not connected", "warn");
      return;
    }
    try {
      await this.room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "client_action", action, payload })),
        { reliable: true, topic: "client_actions" }
      );
      this.state.lastAction = action;
      this.log(`Sent client action: ${action}`);
      this.updateMetrics();
    } catch (err) {
      console.error("sendClientAction error", err);
      this.log(`sendClientAction error: ${err?.message || err}`, "error");
    }
  }

  clearPanels() {
    this.state.transcriptCount = 0;
    this.state.lastAction = this.state.connected ? "Cleared" : "Idle";

    if (this.scriptLogEl) {
      this.scriptLogEl.textContent = "Conversation turns will appear here after the session starts.";
      this.scriptLogEl.classList.add("empty");
    }

    if (this.responseEl) {
      this.responseEl.textContent = "Assistant response will appear here.";
      this.responseEl.classList.add("empty");
    }

    if (this.flowchartEl) {
      this.flowchartEl.textContent = "Mermaid diagrams will render here if the assistant sends one.";
      this.flowchartEl.classList.add("empty");
    }

    this.lastFlowchartSourceText = "";

    if (this.logEl) {
      this.logEl.textContent = "Voice transport and token events will appear here.";
      this.logEl.classList.add("empty");
    }

    this.setAvatarState("idle");
    this.updateMetrics();
  }
}

const agent = new CushionVoiceAgent();
window.cushionAgent = agent;

window.connectAgent = async () => {
  if (!window.cushionAgent) {
    console.error("cushionAgent is not ready");
    return;
  }
  return window.cushionAgent.connect();
};

window.disconnectAgent = async () => {
  if (!window.cushionAgent) return;
  return window.cushionAgent.disconnect();
};

window.sendAction = async () => {
  if (!window.cushionAgent) return;
  return window.cushionAgent.sendClientAction("user_clicked_buy", { productId: "123" });
};
