<script lang="ts">
  import { JsonRpcClient } from "$lib/jsonrpc";
  import type { SystemInfo } from "$lib/types";

  let wsUrl = $state("ws://127.0.0.1:19315");
  let connected = $state(false);
  let connecting = $state(false);
  let deviceInfo = $state<SystemInfo | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  const client = new JsonRpcClient();

  async function doConnect() {
    connecting = true;
    error = null;
    try {
      await client.connect(wsUrl);
      connected = true;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
      connected = false;
    } finally {
      connecting = false;
    }
  }

  function doDisconnect() {
    client.disconnect();
    connected = false;
    deviceInfo = null;
  }

  async function getDeviceInfo() {
    if (!connected) {
      error = "Not connected.";
      return;
    }
    loading = true;
    error = null;
    try {
      deviceInfo = (await client.call("system.getInfo")) as SystemInfo;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>HuaFrame Web Studio</title>
  <meta name="description" content="Remote management studio for HuaFrame frame devices." />
</svelte:head>

<main class="shell">
  <header class="header">
    <p class="eyebrow">HuaFrame</p>
    <h1>Web Studio</h1>
    <p class="subtitle">Step 5 — Remote JSON-RPC Client</p>
  </header>

  <section class="panel">
    <!-- Connection controls -->
    <div class="connect-row">
      <input
        type="text"
        class="url-input"
        bind:value={wsUrl}
        placeholder="ws://127.0.0.1:19315"
        disabled={connected || connecting}
      />

      {#if !connected}
        <button class="btn btn-connect" onclick={doConnect} disabled={connecting || !wsUrl}>
          {connecting ? "Connecting…" : "Connect"}
        </button>
      {:else}
        <button class="btn btn-disconnect" onclick={doDisconnect}>Disconnect</button>
      {/if}
    </div>

    <div class="status-row">
      {#if connected}
        <span class="badge ok">Connected</span>
      {:else if connecting}
        <span class="badge waiting">Connecting…</span>
      {:else}
        <span class="badge idle">Not connected</span>
      {/if}
      {#if error}
        <span class="badge err">Error</span>
      {/if}
    </div>

    <!-- Action -->
    <button class="btn btn-action" onclick={getDeviceInfo} disabled={!connected || loading}>
      {#if loading}
        Fetching…
      {:else}
        system.getInfo()
      {/if}
    </button>

    <!-- Error display -->
    {#if error}
      <div class="error-box">
        <p class="error-title">Error</p>
        <pre class="error-body">{error}</pre>
      </div>
    {/if}

    <!-- Result display -->
    {#if deviceInfo}
      <div class="result">
        <h2>System Info</h2>
        <dl>
          <dt>App Version</dt>
          <dd>{deviceInfo.appVersion}</dd>

          <dt>Device Name</dt>
          <dd>{deviceInfo.deviceName}</dd>

          <dt>Platform</dt>
          <dd>{deviceInfo.platform}</dd>

          {#if deviceInfo.model}
            <dt>Model</dt>
            <dd>{deviceInfo.model}</dd>
          {/if}

          <dt>Screen</dt>
          <dd>{deviceInfo.screen.width} × {deviceInfo.screen.height}
            {#if deviceInfo.screen.scaleFactor}
              @ {deviceInfo.screen.scaleFactor}x
            {/if}
          </dd>

          <dt>Network</dt>
          <dd>
            {deviceInfo.network.online ? "Online" : "Offline"}
            {#if deviceInfo.network.addresses?.length}
              — {deviceInfo.network.addresses.join(", ")}
            {/if}
          </dd>

          {#if deviceInfo.battery}
            <dt>Battery</dt>
            <dd>
              {deviceInfo.battery.level != null ? deviceInfo.battery.level + "%" : "Unknown"}
              {#if deviceInfo.battery.charging != null}
                ({deviceInfo.battery.charging ? "Charging" : "Not charging"})
              {/if}
            </dd>
          {/if}

          {#if deviceInfo.activePluginId}
            <dt>Active Plugin</dt>
            <dd>{deviceInfo.activePluginId}</dd>
          {/if}
        </dl>
      </div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
    background: #f4f7f8;
    color: #1d2522;
  }

  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 24px;
    box-sizing: border-box;
  }

  .header {
    text-align: center;
    margin-bottom: 32px;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #2f746f;
  }

  h1 {
    margin: 4px 0 0;
    font-size: 2.6rem;
    font-weight: 800;
    line-height: 1.1;
    color: #1a3a36;
  }

  .subtitle {
    margin: 8px 0 0;
    font-size: 0.95rem;
    color: #6b8880;
  }

  .panel {
    width: min(100%, 640px);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Connection row ─────────────────────────────── */
  .connect-row {
    display: flex;
    gap: 10px;
  }

  .url-input {
    flex: 1;
    padding: 12px 16px;
    font-size: 0.95rem;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    border: 1px solid #c0d0cc;
    border-radius: 8px;
    background: #ffffff;
    color: #1d2522;
    outline: none;
  }

  .url-input:focus {
    border-color: #2f746f;
    box-shadow: 0 0 0 2px rgb(47 116 111 / 20%);
  }

  .url-input:disabled {
    opacity: 0.5;
    background: #eef2f0;
  }

  .btn {
    padding: 12px 24px;
    font-size: 0.95rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-connect {
    background: #2f746f;
    color: #ffffff;
  }

  .btn-connect:hover:not(:disabled) {
    background: #3a8f89;
  }

  .btn-disconnect {
    background: #c0d0cc;
    color: #1d2522;
  }

  .btn-disconnect:hover:not(:disabled) {
    background: #d4e0dc;
  }

  .btn-action {
    padding: 14px 28px;
    font-size: 1.05rem;
    background: #1a3a36;
    color: #ffffff;
  }

  .btn-action:hover:not(:disabled) {
    background: #2d5450;
  }

  /* ── Status badges ──────────────────────────────── */
  .status-row {
    display: flex;
    gap: 10px;
  }

  .badge {
    display: inline-block;
    border-radius: 999px;
    padding: 6px 16px;
    font-size: 0.82rem;
    font-weight: 600;
  }

  .badge.ok {
    background: #d4f0e8;
    color: #1a5c40;
    border: 1px solid #a0d8c8;
  }

  .badge.waiting {
    background: #fef3d0;
    color: #8a6d10;
    border: 1px solid #f0d060;
  }

  .badge.idle {
    background: #eef2f0;
    color: #6b8880;
    border: 1px solid #c0d0cc;
  }

  .badge.err {
    background: #fad4d8;
    color: #8a1a2a;
    border: 1px solid #f0a0a8;
  }

  /* ── Error ───────────────────────────────────────── */
  .error-box {
    background: #fef0f2;
    border: 1px solid #f0a0a8;
    border-radius: 8px;
    padding: 16px;
  }

  .error-title {
    margin: 0 0 8px;
    font-weight: 700;
    color: #8a1a2a;
  }

  .error-body {
    margin: 0;
    font-size: 0.88rem;
    color: #6b2828;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* ── Result ──────────────────────────────────────── */
  .result {
    background: #ffffff;
    border: 1px solid #d7e0e2;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 4px 24px rgb(29 37 34 / 6%);
  }

  .result h2 {
    margin: 0 0 16px;
    font-size: 1.2rem;
    color: #2f746f;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
  }

  dt {
    font-weight: 600;
    color: #6b8880;
  }

  dd {
    margin: 0;
    color: #1d2522;
  }
</style>
