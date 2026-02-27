(function bootstrapManufacturingSetup() {
  const out = document.getElementById("out");
  const btnDryRun = document.getElementById("btnDryRun");
  const btnApply = document.getElementById("btnApply");

  if (!out || !btnDryRun || !btnApply) return;

  async function run(apply) {
    out.textContent = "Running...";
    btnDryRun.disabled = true;
    btnApply.disabled = true;
    try {
      const resp = await fetch("/api/v1/manufacturing/setup/phase1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply })
      });
      const data = await resp.json();
      out.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      out.textContent = `Request failed: ${err?.message || String(err)}`;
    } finally {
      btnDryRun.disabled = false;
      btnApply.disabled = false;
    }
  }

  btnDryRun.addEventListener("click", () => run(false));
  btnApply.addEventListener("click", () => run(true));
})();
