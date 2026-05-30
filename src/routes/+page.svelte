<svelte:head>
  <title>HuaFrame Web Studio</title>
  <meta
    name="description"
    content="Remote management studio for HuaFrame frame devices."
  />
</svelte:head>

<main class="shell">
  <section class="panel" aria-labelledby="studio-title">
    <p class="eyebrow">HuaFrame</p>
    <h1 id="studio-title">Web Studio</h1>
    <p class="summary">
      Independent remote management PWA for HuaFrame frame devices.
    </p>
    <div class="status">
      <span>Step 4 skeleton</span>
      <span>SvelteKit static app</span>
    </div>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
    background: #f4f7f8;
    color: #1d2522;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 32px;
    box-sizing: border-box;
  }

  .panel {
    width: min(100%, 720px);
    border: 1px solid #d7e0e2;
    border-radius: 8px;
    padding: clamp(28px, 6vw, 56px);
    background: #ffffff;
    box-shadow: 0 18px 50px rgb(29 37 34 / 10%);
  }

  .eyebrow {
    margin: 0 0 12px;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
    color: #2f746f;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 7vw, 4.8rem);
    line-height: 0.95;
    letter-spacing: 0;
  }

  .summary {
    max-width: 46rem;
    margin: 24px 0 0;
    font-size: clamp(1.05rem, 2.2vw, 1.3rem);
    line-height: 1.55;
    color: #485856;
  }

  .status {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 32px;
  }

  .status span {
    border: 1px solid #aec9c6;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 0.9rem;
    color: #243836;
    background: #ecf6f5;
  }
</style>
