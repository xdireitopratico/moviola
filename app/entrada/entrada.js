(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const theme = $("#themeInput");
  const count = $("#count");
  const slate = $("#slateProd");
  const proj = $("#projName");
  const estScenes = $("#estScenes");
  const estCost = $("#estCost");
  const sessionId = new URLSearchParams(location.search).get("session");
  let hydrating = false;

  function syncTheme() {
    const v = theme.value;
    count.textContent = String(v.length);
    const title = (v.split(/[—–.\n]/)[0] || "").trim() || "Novo projeto";
    slate.textContent = title.toUpperCase();
    proj.textContent = title;
  }

  function estimates(sec) {
    estScenes.textContent = String(Math.max(4, Math.round(sec / 7.5)));
    estCost.textContent = sec <= 60 ? `${sec}s de crédito` : "3 min de crédito";
  }

  function pressed(group) {
    const button = $(`.seg[data-group="${group}"] button[aria-pressed="true"]`);
    return button ? button.dataset.v || "" : "";
  }

  function readLaunch() {
    return {
      theme: theme.value,
      durationSeconds: Number(pressed("dur")),
      aspectRatio: pressed("format"),
      style: $$(".chip[aria-pressed=true]").map((chip) => chip.dataset.v).join(" + "),
    };
  }

  function writeForm(launch) {
    hydrating = true;
    theme.value = launch.theme;
    syncTheme();
    pressGroup("dur", String(launch.durationSeconds));
    pressGroup("format", launch.aspectRatio);
    const wanted = new Set(String(launch.style || "").split(" + ").filter(Boolean));
    $$(".chip").forEach((chip) => chip.setAttribute("aria-pressed", wanted.has(chip.dataset.v) ? "true" : "false"));
    estimates(Number(launch.durationSeconds));
    hydrating = false;
  }

  function pressGroup(group, value) {
    $$(`.seg[data-group="${group}"] button`).forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.v === value ? "true" : "false");
    });
  }

  let saveTail = Promise.resolve();

  async function persistForm() {
    if (hydrating || !sessionId || !window.moviola) return;
    saveTail = window.moviola.writeLaunch(sessionId, readLaunch());
    await saveTail;
  }

  theme.addEventListener("input", () => {
    syncTheme();
    void persistForm();
  });
  syncTheme();

  $$(".seg[data-group]").forEach((group) => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      $$("button", group).forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      if (group.dataset.group === "dur") estimates(Number(btn.dataset.v));
      void persistForm();
    });
  });

  const chips = $("#chips");
  chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const on = chip.getAttribute("aria-pressed") === "true";
    const selected = $$(".chip[aria-pressed=true]", chips);
    if (on) {
      if (selected.length > 1) chip.setAttribute("aria-pressed", "false");
      else return;
    } else {
      if (selected.length >= 2) selected[0].setAttribute("aria-pressed", "false");
      chip.setAttribute("aria-pressed", "true");
    }
    void persistForm();
  });

  $("#createBtn").addEventListener("click", (e) => {
    e.preventDefault();
  });

  const ready = sessionId && window.moviola
    ? window.moviola.read(sessionId).then((session) => writeForm(session.launch))
    : Promise.resolve();
  window.moviolaForm = { readLaunch, writeForm, ready, saved: () => saveTail };

  const g = document.createElement("canvas");
  g.width = 220; g.height = 220;
  const ctx = g.getContext("2d");
  const img = ctx.createImageData(220, 220);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  $(".grain").style.backgroundImage = `url(${g.toDataURL("image/png")})`;
})();
