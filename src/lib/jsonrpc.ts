/**
 * Minimal JSON-RPC 2.0 WebSocket client for Web Studio.
 */

import type { JsonRpcRequest, JsonRpcResponse, JsonRpcError } from "./types";

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export class JsonRpcClient {
  private ws: WebSocket | null = null;
  private url: string = "";
  private nextId = 1;
  private pending = new Map<string | number, PendingCall>();
  private timeoutMs: number;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get connecting(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.CONNECTING;
  }

  /** Connect to a WebSocket JSON-RPC endpoint. Returns a promise that resolves on open. */
  connect(url: string): Promise<void> {
    this.disconnect();

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        console.log("[jsonrpc] connected to", url);
        resolve();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: JsonRpcResponse = JSON.parse(event.data as string);
          if (msg.id != null && this.pending.has(msg.id)) {
            const pending = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            clearTimeout(pending.timer);

            if ("error" in msg) {
              const err = msg as JsonRpcError;
              pending.reject(new Error(`[${err.error.code}] ${err.error.message}`));
            } else {
              pending.resolve(msg.result);
            }
          }
        } catch (e) {
          console.warn("[jsonrpc] failed to parse message:", e);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        console.log("[jsonrpc] disconnected:", event.code, event.reason);
        // Reject all pending calls.
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("Connection closed"));
        }
        this.pending.clear();
        this.ws = null;
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          reject(new Error("Failed to connect"));
        }
      };
    });
  }

  /** Disconnect the WebSocket. */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Call a JSON-RPC method.
   * @returns Promise that resolves with the method result.
   */
  call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected"));
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${this.timeoutMs}ms: ${method}`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
}
