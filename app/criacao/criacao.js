(() => {

  let sheetScenes = [];
  function paintSheet(scenes) {
    sheetScenes = scenes;
    const board = document.getElementById("sheet");
    if (!board) return;
    const frames = scenes.length ? scenes : [{ index: 0, title: "", status: "vazia", narration: "" }];
    const meta = document.getElementById("metaScenes");
    if (meta) meta.textContent = String(frames.length);
    board.innerHTML = frames.map((scene) => {
      const n = String(scene.index + 1).padStart(2, "0");
      const status = scene.status;
      const title = scene.title || `Cena ${n}`;
      const narration = scene.narration || "—";
      return `<article class="frame" data-status="${status}" data-id="${scene.id || ""}">
        <div class="frame-top">
          <span class="frame-num">:: CENA ${n}</span>
          <span class="frame-status">${status}</span>
          <button type="button" class="frame-up">Subir</button><button type="button" class="frame-regen">Regenerar</button>
        </div>
        <div class="frame-canvas"><span class="frame-ph">${status}</span></div>
        <div class="frame-foot">
          <div class="frame-title">${title}</div>
          <div class="frame-nar">${narration}</div>
        </div>
      </article>`;
    }).join("");
    const box = document.getElementById("narrationBox");
    window.moviolaActiveScene = () => frames[0] && frames[0].id ? frames[0].id : "";
    if (box) box.value = frames[0] && frames[0].narration ? frames[0].narration : "";
    board.querySelectorAll(".frame").forEach((frame) => {
      frame.addEventListener("click", () => {
        const id = frame.getAttribute("data-id") || "";
        window.moviolaActiveScene = () => id;
        const scene = frames.find((item) => item.id === id);
        if (box) box.value = scene && scene.narration ? scene.narration : "";
      });
    });
  }
  const sessionId = new URLSearchParams(location.search).get("session");

  let narrationTail = Promise.resolve();
  const narrationBox = document.getElementById("narrationBox");
  if (narrationBox) {
    narrationBox.addEventListener("input", () => {
      const sceneId = window.moviolaActiveScene ? window.moviolaActiveScene() : "";
      if (!sessionId || !sceneId || !window.moviola) return;
      narrationTail = window.moviola.setNarration(sessionId, sceneId, narrationBox.value);
      const line = document.querySelector(`.frame[data-id="${sceneId}"] .frame-nar`);
      if (line) line.textContent = narrationBox.value || "—";
    });
  }
  window.moviolaNarration = () => narrationTail;

  let reorderTail = Promise.resolve();
  const board = document.getElementById("sheet");
  if (board) {
    board.addEventListener("click", (event) => {
      const button = event.target.closest(".frame-up");
      if (!button || !sessionId || !window.moviola) return;
      const frame = button.closest(".frame");
      const id = frame ? frame.getAttribute("data-id") || "" : "";
      const ids = sheetScenes.map((scene) => scene.id).filter(Boolean);
      const index = ids.indexOf(id);
      if (index <= 0) return;
      const swapped = ids.slice();
      const previous = swapped[index - 1];
      swapped[index - 1] = swapped[index];
      swapped[index] = previous;
      reorderTail = window.moviola.reorder(sessionId, swapped).then((session) => {
        paintSheet(session.scenes);
        return session;
      });
    });
  }
  window.moviolaReorder = () => reorderTail;

  let regenerateTail = Promise.resolve();
  if (board) {
    board.addEventListener("click", (event) => {
      const button = event.target.closest(".frame-regen");
      if (!button || !sessionId || !window.moviola) return;
      const frame = button.closest(".frame");
      const id = frame ? frame.getAttribute("data-id") || "" : "";
      if (!id) return;
      regenerateTail = window.moviola.regenerate(sessionId, id).then((session) => {
        paintSheet(session.scenes);
        const slot = document.getElementById("lastEvent");
        if (slot && session.lastEvent) slot.textContent = `${session.lastEvent.operation} · ${session.lastEvent.detail}`;
        return session;
      });
    });
  }
  window.moviolaRegenerate = () => regenerateTail;
  window.moviolaRoom = (async () => {
    const slot = document.getElementById("lastEvent");
    if (!sessionId || !window.moviola) return { title: "", event: slot ? slot.textContent : "" };
    const session = await window.moviola.read(sessionId);
    const proj = document.getElementById("projName");
    const sheet = document.getElementById("sheetTitle");
    if (proj) proj.textContent = session.projectName;
    if (sheet) sheet.textContent = session.projectName;
    paintSheet(session.scenes);
    paintVoice(session.voice || defaultVoiceState());
    paintCaptions(session.captions);
    paintMusic(session.music);
    const gate = await window.moviola.gate(sessionId);
    const linkEditor = document.getElementById("linkEditor");
    if (linkEditor && sessionId) {
      const url = new URL(linkEditor.getAttribute("href") || "../editor/index.html", location.href);
      url.searchParams.set("session", sessionId);
      linkEditor.setAttribute("href", url.pathname + url.search + url.hash);
    }
    const openEditor = document.getElementById("openEditor");
    const editorHold = document.getElementById("editorHold");
    if (openEditor && editorHold && gate && gate.ok === false) {
      openEditor.setAttribute("aria-disabled", "true");
      const held = session.scenes.find((scene) => scene.id === gate.sceneId);
      const name = held && held.title ? held.title : gate.sceneId;
      editorHold.textContent = `Cena ${gate.sceneIndex + 1} segurou: ${name}`;
    }
    const event = session.lastEvent;
    if (slot) slot.textContent = event ? `${event.operation} · ${event.detail}` : "sem evento";
    return { title: session.projectName, event: slot ? slot.textContent : "" };
  })();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  paintSheet([]);


  // --- 057 voice settings + preview ---
  const defaultVoiceState = () => ({ id: "", speed: 1, pauseBetweenScenesSeconds: 0 });
  let voiceState = defaultVoiceState();
  let voiceTail = Promise.resolve();
  let previewTail = Promise.resolve();

  function pressSeg(seg, value) {
    if (!seg) return;
    [...seg.querySelectorAll("button")].forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.v === String(value)));
    });
  }

  function paintVoice(voice) {
    voiceState = {
      id: voice && voice.id != null ? String(voice.id) : "",
      speed: voice && voice.speed != null ? Number(voice.speed) : 1,
      pauseBetweenScenesSeconds:
        voice && voice.pauseBetweenScenesSeconds != null
          ? Number(voice.pauseBetweenScenesSeconds)
          : 0,
    };
    pressSeg(document.getElementById("voiceIdSeg"), voiceState.id);
    // if id empty, leave none pressed
    if (!voiceState.id) {
      const seg = document.getElementById("voiceIdSeg");
      if (seg) [...seg.querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", "false"));
    }
    const speed = voiceState.speed;
    const speedSeg = document.getElementById("voiceSpeedSeg");
    if (speedSeg) {
      const match = [...speedSeg.querySelectorAll("button")].find((b) => Number(b.dataset.v) === speed);
      pressSeg(speedSeg, match ? match.dataset.v : "1");
    }
    const pause = voiceState.pauseBetweenScenesSeconds;
    const pauseSeg = document.getElementById("voicePauseSeg");
    if (pauseSeg) {
      const match = [...pauseSeg.querySelectorAll("button")].find((b) => Number(b.dataset.v) === pause);
      pressSeg(pauseSeg, match ? match.dataset.v : "0");
    }
  }

  function persistVoice() {
    if (!sessionId || !window.moviola || typeof window.moviola.setVoice !== "function") return;
    voiceTail = window.moviola.setVoice(sessionId, {
      id: voiceState.id,
      speed: voiceState.speed,
      pauseBetweenScenesSeconds: voiceState.pauseBetweenScenesSeconds,
    });
    return voiceTail;
  }

  document.addEventListener("click", (e) => {
    const voiceBtn = e.target.closest("#voiceIdSeg button, #voiceSpeedSeg button, #voicePauseSeg button");
    if (!voiceBtn) return;
    const group = voiceBtn.parentElement;
    [...group.querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", "false"));
    voiceBtn.setAttribute("aria-pressed", "true");
    if (group.id === "voiceIdSeg") voiceState.id = voiceBtn.dataset.v || "";
    if (group.id === "voiceSpeedSeg") voiceState.speed = Number(voiceBtn.dataset.v);
    if (group.id === "voicePauseSeg") voiceState.pauseBetweenScenesSeconds = Number(voiceBtn.dataset.v);
    persistVoice();
  });

  const btnPreview = document.getElementById("btnPreviewVoice");
  const previewStatus = document.getElementById("voicePreviewStatus");
  if (btnPreview) {
    btnPreview.addEventListener("click", () => {
      if (!sessionId || !window.moviola || typeof window.moviola.previewVoice !== "function") {
        if (previewStatus) previewStatus.textContent = "prévia indisponível";
        return;
      }
      const text = narrationBox ? narrationBox.value : "";
      btnPreview.disabled = true;
      if (previewStatus) previewStatus.textContent = "Gerando prévia…";
      previewTail = window.moviola.previewVoice(sessionId, text).then((result) => {
        if (previewStatus) {
          previewStatus.textContent = result && result.ok
            ? `Prévia: ${result.filePath}`
            : `Prévia falhou: ${result && result.reason ? result.reason : "erro"}`;
        }
        return result;
      }).finally(() => {
        btnPreview.disabled = false;
      });
    });
  }
  window.moviolaVoice = () => voiceTail.then(() => ({ ...voiceState }));
  window.moviolaPreview = () => previewTail;

  // Tabs
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

  // --- 061 captions + music persistence ---
  const TRACK_PATHS = {
    terra: "/trilha/terra-roxa.mp3",
    porto: "/trilha/porto-seco.mp3",
    mare: "/trilha/mare-baixa.mp3",
    none: null,
  };
  const TRACK_NAMES = {
    terra: "Piano e cordas — Terra Roxa",
    porto: "Cordas secas — Porto Seco",
    mare: "Ambiente — Maré Baixa",
    none: "Sem trilha",
  };
  const PATH_TO_TRACK = Object.fromEntries(Object.entries(TRACK_PATHS).map(([k, v]) => [v, k]));

  let captionsState = { enabled: false, srt: null };
  let musicState = { enabled: false, filePath: null, volume: 0.28, fadeInSeconds: 1.2, fadeOutSeconds: 2.0, track: "terra" };
  let captionsTail = Promise.resolve();
  let musicTail = Promise.resolve();

  function paintCaptions(captions) {
    captionsState = {
      enabled: !!(captions && captions.enabled),
      srt: captions && captions.srt != null ? captions.srt : null,
    };
    const tog = document.getElementById("subToggle");
    if (tog) tog.setAttribute("aria-pressed", String(captionsState.enabled));
  }

  function paintMusic(music) {
    const trackKey = music && music.filePath && PATH_TO_TRACK[music.filePath]
      ? PATH_TO_TRACK[music.filePath]
      : (music && music.enabled === false ? "none" : "terra");
    const volumePct = music && music.volume != null ? Math.round(Number(music.volume) * 100) : 28;
    musicState = {
      enabled: !!(music && music.enabled),
      filePath: music && music.filePath != null ? music.filePath : TRACK_PATHS[trackKey],
      volume: music && music.volume != null ? Number(music.volume) : volumePct / 100,
      fadeInSeconds: music && music.fadeInSeconds != null ? Number(music.fadeInSeconds) : 1.2,
      fadeOutSeconds: music && music.fadeOutSeconds != null ? Number(music.fadeOutSeconds) : 2.0,
      track: trackKey === "none" && !(music && music.enabled) ? "none" : (trackKey || "terra"),
    };
    if (!musicState.enabled) musicState.track = musicState.track || "none";
    const tog = document.getElementById("trackToggle");
    if (tog) tog.setAttribute("aria-pressed", String(musicState.enabled));
    $$("#tracks .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.v === musicState.track)));
    const name = document.getElementById("trackName");
    if (name) name.textContent = TRACK_NAMES[musicState.track] || TRACK_NAMES.terra;
    const volSeg = document.querySelector('[data-group="vol"]');
    if (volSeg) {
      const v = String(Math.round(musicState.volume * 100));
      [...volSeg.querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    }
    const sub = document.querySelector("#trackCard .track-sub");
    if (sub) {
      sub.textContent = `Volume ${Math.round(musicState.volume * 100)}% · fade in ${String(musicState.fadeInSeconds).replace(".", ",")}s · fade out ${String(musicState.fadeOutSeconds).replace(".", ",")}s`;
    }
  }

  function persistCaptions() {
    if (!sessionId || !window.moviola || typeof window.moviola.setCaptions !== "function") return;
    captionsTail = window.moviola.setCaptions(sessionId, {
      enabled: captionsState.enabled,
      srt: captionsState.enabled ? captionsState.srt : null,
    }).then((session) => {
      paintCaptions(session.captions);
      return session;
    });
    return captionsTail;
  }

  function persistMusic() {
    if (!sessionId || !window.moviola || typeof window.moviola.setMusic !== "function") return;
    const filePath = musicState.enabled ? (TRACK_PATHS[musicState.track] || musicState.filePath) : null;
    musicTail = window.moviola.setMusic(sessionId, {
      enabled: musicState.enabled && !!filePath,
      filePath: musicState.enabled ? filePath : null,
      volume: musicState.volume,
      fadeInSeconds: musicState.fadeInSeconds,
      fadeOutSeconds: musicState.fadeOutSeconds,
    }).then((session) => {
      paintMusic(session.music);
      return session;
    });
    return musicTail;
  }

  window.moviolaCaptions = () => captionsTail.then(() => ({ ...captionsState }));
  window.moviolaMusic = () => musicTail.then(() => ({ ...musicState }));

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg button');
    if (btn) {
      const group = btn.parentElement;
      if (group && (group.id === "voiceIdSeg" || group.id === "voiceSpeedSeg" || group.id === "voicePauseSeg")) {
        return; // voice handler owns these
      }
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
        musicState.volume = Number(btn.dataset.v) / 100;
        const sub = $('#trackCard .track-sub');
        if (sub) sub.textContent = `Volume ${btn.dataset.v}% · fade in 1,2s · fade out 2,0s`;
        persistMusic();
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
      musicState.track = chip.dataset.v || "none";
      $('#trackName').textContent = TRACK_NAMES[musicState.track] || chip.textContent;
      if (musicState.track === "none") {
        musicState.enabled = false;
        const tog = document.getElementById("trackToggle");
        if (tog) tog.setAttribute("aria-pressed", "false");
      } else {
        musicState.enabled = true;
        const tog = document.getElementById("trackToggle");
        if (tog) tog.setAttribute("aria-pressed", "true");
      }
      persistMusic();
      return;
    }
    const tog = e.target.closest('.toggle');
    if (tog) {
      const on = tog.getAttribute('aria-pressed') !== 'true';
      tog.setAttribute('aria-pressed', String(on));
      if (tog.id === "subToggle") {
        captionsState.enabled = on;
        persistCaptions();
      }
      if (tog.id === "trackToggle") {
        musicState.enabled = on;
        if (on && musicState.track === "none") musicState.track = "terra";
        if (!on) musicState.track = "none";
        persistMusic();
      }
    }
  });

  const btnApply = document.getElementById("btnApplyTrack");
  if (btnApply) {
    btnApply.addEventListener("click", () => { persistMusic(); });
  }

  const applyMedia = document.getElementById("applyMedia");
  async function saveMedia() {
    if (!sessionId || !window.moviola) return false;
    const subOn = document.getElementById("subToggle")?.getAttribute("aria-pressed") === "true";
    const trackOn = document.getElementById("trackToggle")?.getAttribute("aria-pressed") === "true";
    const chip = document.querySelector("#tracks .chip[aria-pressed='true']");
    const volBtn = document.querySelector(".seg[data-group=vol] button[aria-pressed='true']");
    const choice = chip ? chip.dataset.v : "none";
    const filePath = !trackOn || choice === "none" ? null : choice;
    const volume = volBtn ? Number(volBtn.dataset.v) / 100 : 0.28;
    if (typeof window.moviola.setCaptions === "function") {
      await window.moviola.setCaptions(sessionId, subOn);
    }
    if (typeof window.moviola.setMusic === "function") {
      await window.moviola.setMusic(sessionId, {
        enabled: Boolean(filePath),
        filePath,
        volume,
        fadeInSeconds: 1.2,
        fadeOutSeconds: 2,
      });
    }
    return true;
  }
  if (applyMedia) {
    applyMedia.addEventListener("click", () => {
      window.moviolaMediaSave = saveMedia();
    });
  }

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

  const openEditor = document.getElementById("openEditor");
  if (openEditor) {
    openEditor.addEventListener("click", (event) => {
      if (openEditor.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
  }
