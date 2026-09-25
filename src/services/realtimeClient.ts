/**
 * WebSocket client scaffold.
 *
 * The event contract (`RealtimeEventName`) is final — stores subscribe to it
 * today and will keep working once `connect()` opens a real socket instead of
 * running in simulation mode. Reconnect uses exponential backoff with jitter
 * and replays from the last seen sequence number so no events are lost.
 */
import type { ConnectionState, RealtimeEnvelope, RealtimeEventName } from "@/types";

type Handler<T = unknown> = (envelope: RealtimeEnvelope<T>) => void;
type StateHandler = (state: ConnectionState) => void;

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL ?? "";
const MAX_BACKOFF_MS = 15_000;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = "closed";
  private lastSeq = 0;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly handlers = new Map<RealtimeEventName, Set<Handler>>();
  private readonly stateHandlers = new Set<StateHandler>();

  get connectionState(): ConnectionState {
    return this.state;
  }

  /** No-ops while `NEXT_PUBLIC_WS_URL` is unset, which is the Phase 1 default. */
  connect(token?: string): void {
    if (!SOCKET_URL || typeof window === "undefined") return;
    if (this.socket && (this.state === "open" || this.state === "connecting")) return;

    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    const url = new URL(SOCKET_URL);
    if (token) url.searchParams.set("token", token);
    if (this.lastSeq) url.searchParams.set("since", String(this.lastSeq));

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setState("open");
    };
    socket.onmessage = (event) => {
      try {
        this.dispatch(JSON.parse(event.data) as RealtimeEnvelope);
      } catch {
        /* malformed frame — ignore rather than tearing down the socket */
      }
    };
    socket.onclose = () => {
      this.socket = null;
      this.setState("closed");
      this.scheduleReconnect(token);
    };
    socket.onerror = () => socket.close();
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.setState("closed");
  }

  on<T = unknown>(event: RealtimeEventName, handler: Handler<T>): () => void {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler as Handler);
    this.handlers.set(event, set);
    return () => set.delete(handler as Handler);
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /** Outbound frames (typing indicators, read receipts). */
  send(event: RealtimeEventName, payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, payload }));
    }
  }

  /** Lets the mock layer push events through the same pipeline as the server. */
  simulate<T>(event: RealtimeEventName, payload: T): void {
    this.dispatch({ event, seq: ++this.lastSeq, emittedAt: new Date().toISOString(), payload });
  }

  private dispatch(envelope: RealtimeEnvelope): void {
    if (envelope.seq) this.lastSeq = Math.max(this.lastSeq, envelope.seq);
    this.handlers.get(envelope.event)?.forEach((handler) => handler(envelope));
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateHandlers.forEach((handler) => handler(state));
  }

  private scheduleReconnect(token?: string): void {
    this.attempt += 1;
    const backoff = Math.min(2 ** this.attempt * 500, MAX_BACKOFF_MS);
    const jitter = Math.random() * 300;
    this.reconnectTimer = setTimeout(() => this.connect(token), backoff + jitter);
  }
}

export const realtimeClient = new RealtimeClient();
