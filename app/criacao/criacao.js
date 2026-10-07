(() => {
  const sessionId = new URLSearchParams(location.search).get("session");
  window.moviolaRoom = (async () => {
    const slot = document.getElementById("lastEvent");
    if (!sessionId || !window.moviola) return { title: "", event: slot ? slot.textContent : "" };
    const session = await window.moviola.read(sessionId);
    const proj = document.getElementById("projName");
    const sheet = document.getElementById("sheetTitle");
    if (proj) proj.textContent = session.projectName;
    if (sheet) sheet.textContent = session.projectName;
    const event = session.lastEvent;
    if (slot) slot.textContent = event ? `${event.operation} · ${event.detail}` : "sem evento";
    return { title: session.projectName, event: slot ? slot.textContent : "" };
  })();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const frames = Array.from({ length: 8 }, (_, i) => ({
    n: String(i + 1).padStart(2, '0'),
    title: `Cena ${String(i + 1).padStart(2, '0')}`,
    status: 'vazia',
    nar: '—'
  }));

  const sheet = $('#sheet');
  sheet.innerHTML = frames.map((f) => `
    <article class="frame" data-n="${f.n}">
      <div class="frame-top">
        <span class="frame-num">:: CENA ${f.n}</span>
        <span class="frame-status">${f.status}</span>
      </div>
      <div class="frame-canvas"><span class="frame-ph">Negativo</span></div>
      <div class="frame-foot">
        <div class="frame-title">${f.title}</div>
        <div class="frame-nar">${f.nar}</div>
      </div>
    </article>`).join('');

  // Tabs — visual only
  const panels = {
    narracao: $('#panel-narracao'),
    legendas: $('#panel-legendas'),
    trilha: $('#panel-trilha')
  };
  $$('.side-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.panel;
      $$('.side-tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== id; });
    });
  });

  // Segmented controls (no persistence)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg button');
    if (btn) {
      const group = btn.parentElement;
      $$('button', group).forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      if (group.dataset.group === 'sub-pos') {
        $('#subPreview').classList.toggle('pos-top', btn.dataset.v === 'top');
      }
      if (group.dataset.group === 'sub-font') {
        const sample = $('#subSample');
        sample.classList.toggle('font-serif', btn.dataset.v === 'serif');
        sample.classList.toggle('font-mono', btn.dataset.v === 'mono');
      }
      if (group.dataset.group === 'vol') {
        const sub = $('#trackCard .track-sub');
        if (sub) sub.textContent = `Volume ${btn.dataset.v}% · fade in 1,2s · fade out 2,0s`;
      }
      return;
    }
    const sw = e.target.closest('.swatch');
    if (sw) {
      $$('.swatch').forEach((s) => s.setAttribute('aria-pressed', 'false'));
      sw.setAttribute('aria-pressed', 'true');
      $('#subSample').style.color = getComputedStyle(sw).getPropertyValue('--sw').trim();
      return;
    }
    const chip = e.target.closest('#tracks .chip');
    if (chip) {
      $$('#tracks .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      const names = { terra: 'Piano e cordas — Terra Roxa', porto: 'Cordas secas — Porto Seco', mare: 'Ambiente — Maré Baixa', none: 'Sem trilha' };
      $('#trackName').textContent = names[chip.dataset.v] || chip.textContent;
      return;
    }
    const tog = e.target.closest('.toggle');
    if (tog) {
      const on = tog.getAttribute('aria-pressed') !== 'true';
      tog.setAttribute('aria-pressed', String(on));
    }
  });

  // Grain
  const g = document.createElement('canvas');
  g.width = 220; g.height = 220;
  const ctx = g.getContext('2d');
  const img = ctx.createImageData(220, 220);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const grain = $('.grain');
  if (grain) grain.style.backgroundImage = `url(${g.toDataURL('image/png')})`;
})();
