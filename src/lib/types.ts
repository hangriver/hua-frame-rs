/**
 * SystemInfo type — manually mirrors the contract in docs/contracts.md.
 *
 * Web Studio is an independent repository and does not import @huaframe/contracts.
 * When cross-repo contract sharing is promoted (per ADR-0007/ADR-0012),
 * this manual mirror will be replaced with the shared package.
 */

export interface SystemInfo {
  appVersion: string;
  deviceName: string;
  platform: string;
  model?: string;
  screen: {
    width: number;
    height: number;
    scaleFactor?: number;
  };
  network: {
    online: boolean;
    addresses?: string[];
  };
  battery?: {
    level?: number;
    charging?: boolean;
  };
  activePluginId?: string;
}

/** JSON-RPC 2.0 request. */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 success response. */
export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

/** JSON-RPC 2.0 error response. */
export interface JsonRpcError {
  jsonrpc: "2.0";
  id?: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;
