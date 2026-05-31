/**
 * Contract type mirrors for Web Studio.
 *
 * Web Studio is an independent repository and does not import @huaframe/contracts.
 * When cross-repo contract sharing is promoted (per ADR-0007/ADR-0012),
 * these manual mirrors will be replaced with the shared package.
 *
 * Source of truth: packages/contracts/src/{rpc,plugins,providers,resources}.ts
 * and docs/contracts.md
 */

// ─── SystemInfo (updated Step 8 with settings) ───────────────────────

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
  brightness?: number;
  volume?: number;
}

// ─── Plugin types ────────────────────────────────────────────────────

export type PluginType = "page" | "component";

export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  enabled: boolean;
  active?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  type: PluginType;
  author?: string;
  description?: string;
  entry: string;
  components?: Array<{ id: string; slot: string }>;
  providers?: Record<string, string>;
  resources?: Record<string, ResourceRequirement>;
  permissions?: PluginPermission[];
}

export type PluginPermission = "provider:read" | "resource:read" | "remote-key:read";

export type ResourceRequirement =
  | { type: "album"; album: string; limit?: number }
  | { type: "library"; path: string };

// ─── Provider types ──────────────────────────────────────────────────

export interface ProviderSummary {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

// ─── Resource types ──────────────────────────────────────────────────

export type ResourceKind = "image" | "video";

export interface ResourceItem {
  id: string;
  kind: ResourceKind;
  name: string;
  mimeType: string;
  uri: string;
  thumbnailUri?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceQuery {
  kind?: ResourceKind;
  tags?: string[];
  nameContains?: string;
  limit?: number;
}

// ─── Remote key types ────────────────────────────────────────────────

export type RemoteKey = "up" | "down" | "left" | "right" | "ok" | "back" | "menu";

export type KeyAction = "press" | "release" | "repeat";

// ─── RPC result wrappers ─────────────────────────────────────────────

export interface PluginListResult {
  plugins: PluginSummary[];
}

export interface PluginActivateResult {
  activePluginId: string;
}

export interface PluginDeactivateResult {
  activePluginId: null;
}

export interface ProviderListResult {
  providers: ProviderSummary[];
}

export interface ResourceListResult {
  resources: ResourceItem[];
}

export interface ResourceImportResult {
  resource: ResourceItem;
}

export interface SetBrightnessResult {
  brightness: number;
}

export interface SetVolumeResult {
  volume: number;
}

export interface RemoteKeyResult {
  accepted: boolean;
}

// ─── JSON-RPC 2.0 envelopes ──────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number;
  result: unknown;
}

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
