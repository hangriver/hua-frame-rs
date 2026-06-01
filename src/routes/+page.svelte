<script lang="ts">
  import { JsonRpcClient } from "$lib/jsonrpc";
  import type {
    SystemInfo,
    PluginSummary,
    ResourceItem,
    RemoteKey,
    Settings,
    ScreenOnSchedule,
    BrightnessSchedule,
    PluginListResult,
    ProviderListResult,
    ResourceListResult,
    ResourceUploadResult,
    SetBrightnessResult,
    SetVolumeResult,
    RemoteKeyResult,
    SettingsUpdateResult,
    DisplayScheduleResult,
    DisplayScheduleUpdateResult,
    AppExitResult,
  } from "$lib/types";

  // ── Connection state ──────────────────────────────────────────────
  let wsUrl = $state("ws://127.0.0.1:19315");
  let connected = $state(false);
  let connecting = $state(false);
  let error = $state<string | null>(null);

  const client = new JsonRpcClient();

  // ── Tab state ─────────────────────────────────────────────────────
  type Tab = "device" | "plugins" | "resources" | "settings" | "remote";
  let activeTab = $state<Tab>("device");

  const tabs: { id: Tab; label: string }[] = [
    { id: "device", label: "Device" },
    { id: "plugins", label: "Plugins" },
    { id: "resources", label: "Resources" },
    { id: "settings", label: "Settings" },
    { id: "remote", label: "Remote" },
  ];

  // ── Data state ────────────────────────────────────────────────────
  let deviceInfo = $state<SystemInfo | null>(null);
  let plugins = $state<PluginSummary[]>([]);
  let providers = $state<ProviderListResult | null>(null);
  let resources = $state<ResourceItem[]>([]);
  let loading = $state<string | null>(null);

  // Settings sliders (local mirror, synced on fetch)
  let brightness = $state(80);
  let volume = $state(70);
  let brightnessPending = $state(false);
  let volumePending = $state(false);

  // Resource import form
  let importName = $state("");
  let importUri = $state("");
  let importMime = $state("image/svg+xml");
  let importTags = $state("");
  let importPending = $state(false);

  // File upload
  let uploadFile = $state<File | null>(null);
  let uploadPending = $state(false);
  let uploadError = $state<string | null>(null);
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  // Settings state
  let deviceSettings = $state<Settings | null>(null);
  let displaySchedule = $state<DisplayScheduleResult | null>(null);
  let settingsPending = $state(false);

  // ── Connection ────────────────────────────────────────────────────
  async function doConnect() {
    connecting = true;
    error = null;
    try {
      await client.connect(wsUrl);
      connected = true;
      // Auto-load data after connect
      await refreshAll();
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
    plugins = [];
    resources = [];
  }

  // ── Data refresh ──────────────────────────────────────────────────
  async function refreshAll() {
    if (!connected) return;
    error = null;
    try {
      await Promise.all([
        refreshDeviceInfo(),
        refreshPlugins(),
        refreshResources(),
      ]);
    } catch (_) {
      // individual refresh functions set error
    }
  }

  async function refreshDeviceInfo() {
    try {
      deviceInfo = (await client.call("system.getInfo")) as SystemInfo;
      if (deviceInfo.brightness != null) brightness = deviceInfo.brightness;
      if (deviceInfo.volume != null) volume = deviceInfo.volume;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function refreshPlugins() {
    try {
      const result = (await client.call("plugin.list")) as PluginListResult;
      plugins = result.plugins ?? [];
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function refreshResources() {
    try {
      const result = (await client.call("resource.list", {})) as ResourceListResult;
      resources = result.resources ?? [];
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // ── Settings actions ──────────────────────────────────────────────
  async function setBrightness(value: number) {
    brightnessPending = true;
    try {
      const result = (await client.call("system.setBrightness", {
        value,
      })) as SetBrightnessResult;
      brightness = result.brightness;
      // Keep the System Info card in sync.
      if (deviceInfo) deviceInfo = { ...deviceInfo, brightness: result.brightness };
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      brightnessPending = false;
    }
  }

  async function setVolume(value: number) {
    volumePending = true;
    try {
      const result = (await client.call("system.setVolume", {
        value,
      })) as SetVolumeResult;
      volume = result.volume;
      // Keep the System Info card in sync.
      if (deviceInfo) deviceInfo = { ...deviceInfo, volume: result.volume };
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      volumePending = false;
    }
  }

  // ── Plugin actions ────────────────────────────────────────────────
  async function activatePlugin(id: string) {
    loading = "Activating plugin…";
    try {
      await client.call("plugin.activate", { id });
      await refreshPlugins();
      await refreshDeviceInfo();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = null;
    }
  }

  async function deactivatePlugin() {
    loading = "Deactivating plugin…";
    try {
      await client.call("plugin.deactivate", {});
      await refreshPlugins();
      await refreshDeviceInfo();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = null;
    }
  }

  // ── Resource actions ──────────────────────────────────────────────
  async function importResource() {
    if (!importName || !importUri) return;
    importPending = true;
    try {
      await client.call("resource.import", {
        name: importName,
        uri: importUri,
        mimeType: importMime || "image/svg+xml",
        tags: importTags
          ? importTags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      });
      importName = "";
      importUri = "";
      importTags = "";
      await refreshResources();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      importPending = false;
    }
  }

  // ── Remote key actions ────────────────────────────────────────────
  async function sendKey(key: RemoteKey, action: string = "press") {
    loading = `Sending ${key}…`;
    try {
      const result = (await client.call("remote.key", {
        key,
        action,
      })) as RemoteKeyResult;
      if (!result.accepted) {
        error = `Key "${key}" was not accepted by the device.`;
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = null;
    }
  }

  // ── File upload ──────────────────────────────────────────────────
  function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      uploadFile = input.files[0];
      uploadError = null;
      // Auto-fill name from filename.
      if (!importName) {
        importName = uploadFile.name.replace(/\.[^.]+$/, "");
      }
      importMime = uploadFile.type || "image/jpeg";
    }
  }

  async function uploadResourceFile() {
    if (!uploadFile) return;
    if (uploadFile.size > MAX_FILE_SIZE) {
      uploadError = `File too large: ${(uploadFile.size / 1024 / 1024).toFixed(1)} MB (max 10 MB)`;
      return;
    }
    uploadPending = true;
    uploadError = null;
    const file = uploadFile; // capture non-null for TS narrowing
    if (!file) return;
    try {
      // Read file as base64.
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data:...;base64, prefix.
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.substring(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      await client.call("resource.upload", {
        name: importName || file.name,
        data,
        mimeType: importMime || file.type || "image/jpeg",
        tags: ["movie-poster"],
      });

      uploadFile = null;
      importName = "";
      // Reset the file input.
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      await refreshResources();
    } catch (e: unknown) {
      uploadError = e instanceof Error ? e.message : String(e);
    } finally {
      uploadPending = false;
    }
  }

  // ── Settings management ───────────────────────────────────────────
  async function refreshSettings() {
    settingsPending = true;
    try {
      deviceSettings = (await client.call("settings.get")) as Settings;
      if (deviceSettings.brightness) {
        brightness = deviceSettings.brightness.value;
      }
      if (deviceSettings.volume != null) {
        volume = deviceSettings.volume;
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
    try {
      displaySchedule = (await client.call("display.getSchedule")) as DisplayScheduleResult;
    } catch (e: unknown) {
      // schedules not critical
    }
    settingsPending = false;
  }

  async function updateSetting(key: string, value: unknown) {
    try {
      await client.call("settings.update", { key, value });
      await refreshSettings();
      await refreshDeviceInfo();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function updateDisplaySchedule(type: "screenOn" | "brightness", schedule: unknown) {
    try {
      await client.call("display.updateSchedule", { type, schedule });
      await refreshSettings();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function exitApp() {
    try {
      await client.call("app.exit", {});
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
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
    <p class="subtitle">Remote Management Dashboard</p>
  </header>

  <!-- ═══ Connection bar ═══════════════════════════════════════════ -->
  <section class="panel">
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
      {#if loading}
        <span class="badge waiting">{loading}</span>
      {/if}
    </div>

    {#if error}
      <div class="error-box">
        <p class="error-title">Error</p>
        <pre class="error-body">{error}</pre>
        <button class="btn-dismiss" onclick={() => (error = null)}>Dismiss</button>
      </div>
    {/if}
  </section>

  <!-- ═══ Tab bar ══════════════════════════════════════════════════ -->
  {#if connected}
    <nav class="tab-bar">
      {#each tabs as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <!-- ═══ Device tab ═════════════════════════════════════════════ -->
    {#if activeTab === "device"}
      <section class="panel">
        <button class="btn btn-action" onclick={refreshDeviceInfo} disabled={!connected}>
          Refresh Device Info
        </button>

        {#if deviceInfo}
          <div class="card">
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
              <dd>
                {deviceInfo.screen.width} × {deviceInfo.screen.height}
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

              <dt>Brightness</dt>
              <dd>{deviceInfo.brightness ?? "—"}%</dd>

              <dt>Volume</dt>
              <dd>{deviceInfo.volume ?? "—"}%</dd>
            </dl>
          </div>

          <!-- Settings controls -->
          <div class="card">
            <h2>Device Settings</h2>

            <div class="slider-group">
              <label class="slider-label" for="brightness-slider">
                Brightness: <strong>{brightness}%</strong>
              </label>
              <input
                id="brightness-slider"
                type="range"
                min="0"
                max="100"
                bind:value={brightness}
                onchange={(e: Event) => {
                  const v = parseInt((e.target as HTMLInputElement).value);
                  setBrightness(v);
                }}
                disabled={brightnessPending}
                class="slider"
              />
            </div>

            <div class="slider-group">
              <label class="slider-label" for="volume-slider">
                Volume: <strong>{volume}%</strong>
              </label>
              <input
                id="volume-slider"
                type="range"
                min="0"
                max="100"
                bind:value={volume}
                onchange={(e: Event) => {
                  const v = parseInt((e.target as HTMLInputElement).value);
                  setVolume(v);
                }}
                disabled={volumePending}
                class="slider"
              />
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- ═══ Plugins tab ═════════════════════════════════════════════ -->
    {#if activeTab === "plugins"}
      <section class="panel">
        <button class="btn btn-action" onclick={refreshPlugins} disabled={!connected}>
          Refresh Plugins
        </button>

        {#if plugins.length === 0}
          <p class="empty">No plugins registered on this device.</p>
        {:else}
          <div class="card">
            <h2>Installed Plugins ({plugins.length})</h2>
            <div class="plugin-list">
              {#each plugins as plugin}
                <div class="plugin-row" class:plugin-active={plugin.active}>
                  <div class="plugin-info">
                    <span class="plugin-name">{plugin.name}</span>
                    <span class="plugin-id">{plugin.id}</span>
                    <span class="plugin-meta">v{plugin.version} · {plugin.type}</span>
                  </div>
                  <div class="plugin-actions">
                    {#if plugin.active}
                      <span class="badge ok">Active</span>
                      <button class="btn btn-sm btn-deact" onclick={deactivatePlugin}>
                        Deactivate
                      </button>
                    {:else}
                      <button
                        class="btn btn-sm btn-act"
                        onclick={() => activatePlugin(plugin.id)}
                      >
                        Activate
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- ═══ Resources tab ═══════════════════════════════════════════ -->
    {#if activeTab === "resources"}
      <section class="panel">
        <button class="btn btn-action" onclick={refreshResources} disabled={!connected}>
          Refresh Resources
        </button>

        <!-- File upload form -->
        <div class="card">
          <h2>Upload Poster Image</h2>
          <div class="import-form">
            <label class="file-label" for="file-input">
              <div class="file-drop-zone">
                {#if uploadFile}
                  <p class="file-name">{uploadFile.name}</p>
                  <p class="file-size">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                {:else}
                  <p class="file-hint">Click to select an image file</p>
                  <p class="file-limit">Max 10 MB · JPEG, PNG, GIF, WebP, SVG</p>
                {/if}
              </div>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                class="file-input-hidden"
                onchange={onFileSelected}
              />
            </label>
            <input
              type="text"
              class="field"
              bind:value={importName}
              placeholder="Resource name (optional)"
            />
            <button
              class="btn btn-connect"
              onclick={uploadResourceFile}
              disabled={uploadPending || !uploadFile}
            >
              {uploadPending ? "Uploading…" : "Upload"}
            </button>
            {#if uploadError}
              <p class="upload-error">{uploadError}</p>
            {/if}
          </div>
        </div>

        <!-- URI import form (advanced) -->
        <details class="card details-card">
          <summary><h2 style="display:inline">Import via URI (advanced)</h2></summary>
          <div class="import-form" style="margin-top:12px">
            <input
              type="text"
              class="field"
              bind:value={importUri}
              placeholder="Data URI or URL"
            />
            <div class="import-row">
              <input
                type="text"
                class="field field-sm"
                bind:value={importMime}
                placeholder="image/svg+xml"
              />
              <input
                type="text"
                class="field field-sm"
                bind:value={importTags}
                placeholder="tag1, tag2, tag3"
              />
            </div>
            <button
              class="btn btn-connect"
              onclick={importResource}
              disabled={importPending || !importName || !importUri}
            >
              {importPending ? "Importing…" : "Import"}
            </button>
          </div>
        </details>

        <!-- Resource gallery -->
        {#if resources.length === 0}
          <p class="empty">No resources on this device.</p>
        {:else}
          <div class="card">
            <h2>Resource Library ({resources.length})</h2>
            <div class="resource-grid">
              {#each resources as res}
                <div class="resource-card">
                  <div class="resource-thumb">
                    <img src={res.uri} alt={res.name} />
                  </div>
                  <div class="resource-body">
                    <p class="resource-name">{res.name}</p>
                    <p class="resource-kind">{res.kind} · {res.mimeType}</p>
                    <div class="tag-row">
                      {#each res.tags as tag}
                        <span class="tag">{tag}</span>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- ═══ Settings tab ═══════════════════════════════════════════ -->
    {#if activeTab === "settings"}
      <section class="panel">
        <button class="btn btn-action" onclick={refreshSettings} disabled={!connected || settingsPending}>
          {settingsPending ? "Loading…" : "Refresh Settings"}
        </button>

        {#if deviceSettings}
          <!-- Active plugin -->
          <div class="card">
            <h2>Active Plugin</h2>
            {#if deviceSettings.activePluginId}
              <p class="setting-value">{deviceSettings.activePluginId}</p>
            {:else}
              <p class="empty">No active plugin.</p>
            {/if}
            {#if plugins.length > 0}
              <div class="plugin-list" style="margin-top:12px">
                {#each plugins as plugin}
                  <div class="plugin-row" class:plugin-active={plugin.active}>
                    <div class="plugin-info">
                      <span class="plugin-name">{plugin.name}</span>
                      <span class="plugin-id">{plugin.id}</span>
                    </div>
                    <div class="plugin-actions">
                      {#if plugin.active}
                        <span class="badge ok">Active</span>
                      {:else}
                        <button class="btn btn-sm btn-act" onclick={() => updateSetting("activePluginId", plugin.id)}>
                          Set Active
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Brightness & Volume -->
          <div class="card">
            <h2>Brightness &amp; Volume</h2>
            <div class="slider-group">
              <label class="slider-label" for="settings-brightness">
                Brightness: <strong>{brightness}%</strong>
                <span class="mode-badge">{deviceSettings?.brightness.mode ?? "window_fallback"}</span>
              </label>
              <input id="settings-brightness" type="range" min="0" max="100"
                value={brightness}
                onchange={(e: Event) => {
                  const v = parseInt((e.target as HTMLInputElement).value);
                  const mode = deviceSettings?.brightness.mode ?? "window_fallback";
                  updateSetting("brightness", { value: v, mode });
                }}
                class="slider" />
            </div>
            <div class="slider-group">
              <label class="slider-label" for="settings-volume">
                Volume: <strong>{volume}%</strong>
              </label>
              <input id="settings-volume" type="range" min="0" max="100"
                value={volume}
                onchange={(e: Event) => {
                  const v = parseInt((e.target as HTMLInputElement).value);
                  updateSetting("volume", v);
                }}
                class="slider" />
            </div>
          </div>

          <!-- Screen-on schedule -->
          <div class="card">
            <h2>Screen-On Schedule</h2>
            {#if displaySchedule}
              <div class="schedule-section">
                <p class="schedule-title">Weekday</p>
                {#each displaySchedule.screenOn.weekday as period}
                  <span class="tag">{period.start} – {period.end}</span>
                {/each}
              </div>
              <div class="schedule-section">
                <p class="schedule-title">Holiday (Weekend)</p>
                {#each displaySchedule.screenOn.holiday as period}
                  <span class="tag">{period.start} – {period.end}</span>
                {/each}
              </div>
            {:else}
              <p class="empty">No schedule data.</p>
            {/if}
          </div>

          <!-- Brightness schedule -->
          <div class="card">
            <h2>Brightness Schedule</h2>
            {#if displaySchedule}
              {#each displaySchedule.brightness.periods as period}
                <div class="schedule-section">
                  <span class="tag">{period.start} – {period.end}</span>
                  <span class="schedule-value">{period.value}%</span>
                </div>
              {/each}
            {:else}
              <p class="empty">No schedule data.</p>
            {/if}
          </div>

          <!-- Exit app -->
          <div class="card">
            <h2>App Control</h2>
            <button class="btn btn-exit" onclick={exitApp}>
              Exit Application
            </button>
          </div>
        {:else}
          <p class="empty">Settings not loaded. Connect to a device and refresh.</p>
        {/if}
      </section>
    {/if}

    <!-- ═══ Remote tab ══════════════════════════════════════════════ -->
    {#if activeTab === "remote"}
      <section class="panel">
        <div class="card">
          <h2>Remote Control</h2>
          <p class="hint">Send directional and action key commands to the frame device.</p>

          <!-- D-pad -->
          <div class="dpad">
            <div class="dpad-row">
              <button class="key-btn" onclick={() => sendKey("up")} title="Up">▲</button>
            </div>
            <div class="dpad-row">
              <button class="key-btn" onclick={() => sendKey("left")} title="Left">◀</button>
              <button class="key-btn key-center" onclick={() => sendKey("ok")} title="OK">OK</button>
              <button class="key-btn" onclick={() => sendKey("right")} title="Right">▶</button>
            </div>
            <div class="dpad-row">
              <button class="key-btn" onclick={() => sendKey("down")} title="Down">▼</button>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="action-keys">
            <button class="btn btn-action-key" onclick={() => sendKey("back")}>
              ◀ Back
            </button>
            <button class="btn btn-action-key" onclick={() => sendKey("menu")}>
              ☰ Menu
            </button>
          </div>
        </div>
      </section>
    {/if}
  {/if}
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
    padding: 32px 24px 64px;
    box-sizing: border-box;
  }

  .header {
    text-align: center;
    margin-bottom: 24px;
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
    width: min(100%, 720px);
    display: flex;
    flex-direction: column;
    gap: 16px;
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
    padding: 10px 20px;
    font-size: 0.9rem;
    background: #1a3a36;
    color: #ffffff;
  }

  .btn-action:hover:not(:disabled) {
    background: #2d5450;
  }

  .btn-sm {
    padding: 6px 14px;
    font-size: 0.82rem;
  }

  .btn-act {
    background: #2f746f;
    color: #ffffff;
  }

  .btn-act:hover:not(:disabled) {
    background: #3a8f89;
  }

  .btn-deact {
    background: #c0d0cc;
    color: #1d2522;
  }

  .btn-deact:hover:not(:disabled) {
    background: #d4e0dc;
  }

  .btn-dismiss {
    margin-top: 8px;
    padding: 6px 14px;
    font-size: 0.82rem;
    font-weight: 600;
    border: 1px solid #f0a0a8;
    border-radius: 6px;
    background: transparent;
    color: #8a1a2a;
    cursor: pointer;
  }

  .btn-dismiss:hover {
    background: #fad4d8;
  }

  /* ── Status badges ──────────────────────────────── */
  .status-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
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

  /* ── Tab bar ────────────────────────────────────── */
  .tab-bar {
    width: min(100%, 720px);
    display: flex;
    gap: 4px;
    margin: 20px 0 0;
    background: #eef2f0;
    border-radius: 10px;
    padding: 4px;
  }

  .tab-btn {
    flex: 1;
    padding: 10px 16px;
    font-size: 0.9rem;
    font-weight: 600;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #6b8880;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    color: #1d2522;
    background: rgb(29 37 34 / 6%);
  }

  .tab-btn.active {
    background: #ffffff;
    color: #1a3a36;
    box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
  }

  /* ── Cards ──────────────────────────────────────── */
  .card {
    background: #ffffff;
    border: 1px solid #d7e0e2;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 4px 24px rgb(29 37 34 / 6%);
  }

  .card h2 {
    margin: 0 0 16px;
    font-size: 1.1rem;
    color: #2f746f;
  }

  .hint {
    margin: 0 0 16px;
    font-size: 0.88rem;
    color: #6b8880;
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

  .empty {
    text-align: center;
    color: #6b8880;
    padding: 24px 0;
    font-size: 0.95rem;
  }

  /* ── Settings sliders ───────────────────────────── */
  .slider-group {
    margin-bottom: 16px;
  }

  .slider-label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.9rem;
    color: #1d2522;
  }

  .slider {
    width: 100%;
    height: 6px;
    appearance: none;
    background: #d7e0e2;
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #2f746f;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 1px 4px rgb(0 0 0 / 15%);
  }

  .slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  /* ── Plugin list ────────────────────────────────── */
  .plugin-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .plugin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #d7e0e2;
    background: #fafbfb;
    gap: 12px;
  }

  .plugin-row.plugin-active {
    border-color: #a0d8c8;
    background: #f6fdfb;
  }

  .plugin-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .plugin-name {
    font-weight: 600;
    color: #1d2522;
  }

  .plugin-id {
    font-size: 0.78rem;
    font-family: "JetBrains Mono", monospace;
    color: #6b8880;
  }

  .plugin-meta {
    font-size: 0.78rem;
    color: #a0b5b0;
  }

  .plugin-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* ── Import form ────────────────────────────────── */
  .import-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field {
    padding: 10px 14px;
    font-size: 0.9rem;
    border: 1px solid #c0d0cc;
    border-radius: 8px;
    background: #ffffff;
    color: #1d2522;
    outline: none;
    font-family: inherit;
  }

  .field:focus {
    border-color: #2f746f;
    box-shadow: 0 0 0 2px rgb(47 116 111 / 20%);
  }

  .field-sm {
    flex: 1;
  }

  .import-row {
    display: flex;
    gap: 10px;
  }

  /* ── Resource grid ──────────────────────────────── */
  .resource-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    margin-top: 8px;
  }

  .resource-card {
    border: 1px solid #d7e0e2;
    border-radius: 10px;
    overflow: hidden;
    background: #fafbfb;
    transition: box-shadow 0.15s;
  }

  .resource-card:hover {
    box-shadow: 0 4px 16px rgb(29 37 34 / 10%);
  }

  .resource-thumb {
    width: 100%;
    height: 120px;
    overflow: hidden;
    background: #eef2f0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .resource-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .resource-body {
    padding: 10px 12px;
  }

  .resource-name {
    margin: 0;
    font-weight: 600;
    font-size: 0.88rem;
    color: #1d2522;
  }

  .resource-kind {
    margin: 2px 0 6px;
    font-size: 0.75rem;
    color: #a0b5b0;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 999px;
    background: #eef2f0;
    color: #6b8880;
  }

  /* ── Remote D-pad ───────────────────────────────── */
  .dpad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin: 20px 0;
  }

  .dpad-row {
    display: flex;
    gap: 6px;
  }

  .key-btn {
    width: 64px;
    height: 64px;
    border: 2px solid #c0d0cc;
    border-radius: 12px;
    background: #ffffff;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1d2522;
    cursor: pointer;
    transition: all 0.12s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .key-btn:hover {
    background: #eef9f7;
    border-color: #2f746f;
    color: #2f746f;
  }

  .key-btn:active {
    background: #d4f0e8;
    transform: scale(0.95);
  }

  .key-center {
    width: 80px;
    height: 64px;
    font-size: 0.85rem;
    letter-spacing: 0.05em;
  }

  .action-keys {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
  }

  .btn-action-key {
    padding: 12px 24px;
    font-size: 0.9rem;
    font-weight: 600;
    border: 2px solid #c0d0cc;
    border-radius: 8px;
    background: #ffffff;
    color: #1d2522;
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn-action-key:hover {
    background: #eef9f7;
    border-color: #2f746f;
    color: #2f746f;
  }

  .btn-action-key:active {
    background: #d4f0e8;
    transform: scale(0.97);
  }

  /* ── File upload ──────────────────────────────────── */
  .file-label {
    display: block;
    cursor: pointer;
  }

  .file-input-hidden {
    display: none;
  }

  .file-drop-zone {
    border: 2px dashed #c0d0cc;
    border-radius: 10px;
    padding: 28px 20px;
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }

  .file-drop-zone:hover {
    border-color: #2f746f;
    background: #f6fdfb;
  }

  .file-hint {
    margin: 0;
    font-size: 0.95rem;
    color: #1d2522;
    font-weight: 600;
  }

  .file-limit {
    margin: 4px 0 0;
    font-size: 0.75rem;
    color: #a0b5b0;
  }

  .file-name {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #2f746f;
  }

  .file-size {
    margin: 4px 0 0;
    font-size: 0.78rem;
    color: #6b8880;
  }

  .upload-error {
    margin: 0;
    font-size: 0.82rem;
    color: #8a1a2a;
    font-weight: 600;
  }

  .details-card {
    border: 1px solid #d7e0e2;
    border-radius: 8px;
    padding: 16px 24px;
    background: #fafbfb;
    cursor: pointer;
  }

  .details-card summary {
    font-weight: 600;
    color: #6b8880;
    font-size: 0.9rem;
  }

  /* ── Settings tab ─────────────────────────────────── */
  .setting-value {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.85rem;
    color: #2f746f;
    margin: 0;
    word-break: break-all;
  }

  .mode-badge {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 999px;
    background: #eef2f0;
    color: #2f746f;
    margin-left: 6px;
  }

  .schedule-section {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .schedule-title {
    font-size: 0.78rem;
    color: #6b8880;
    margin: 0;
    min-width: 80px;
  }

  .schedule-value {
    font-size: 0.88rem;
    font-weight: 700;
    color: #2f746f;
  }

  .btn-exit {
    padding: 10px 24px;
    font-size: 0.9rem;
    font-weight: 600;
    border: 1px solid #d4a0a8;
    border-radius: 8px;
    background: #fef0f2;
    color: #8a1a2a;
    cursor: pointer;
  }

  .btn-exit:hover {
    background: #fad4d8;
  }
</style>
