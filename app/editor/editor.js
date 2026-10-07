(() => {
  const sessionId = new URLSearchParams(location.search).get("session");

  function withSession(href) {
    if (!sessionId) return href;
    const url = new URL(href, location.href);
    url.searchParams.set("session", sessionId);
    return url.pathname + url.search + url.hash;
  }

  const linkEntrada = document.getElementById("linkEntrada");
  const linkCriacao = document.getElementById("linkCriacao");
  const linkEditor = document.getElementById("linkEditor");
  if (linkEntrada) linkEntrada.setAttribute("href", withSession("../entrada/index.html"));
  if (linkCriacao) linkCriacao.setAttribute("href", withSession("../criacao/index.html"));
  if (linkEditor) linkEditor.setAttribute("href", withSession("./index.html"));

  const reasonPt = {
    incompleta: "incompleta",
    sem_arquivo: "sem arquivo",
  };

  function reasonLabel(reason) {
    if (!reason) return "desconhecido";
    return reasonPt[reason] || String(reason).replace(/_/g, " ");
  }

  function sceneLabel(session, gate) {
    const held = session.scenes.find((scene) => scene.id === gate.sceneId);
    if (held && held.title) return held.title;
    const n = typeof gate.sceneIndex === "number" ? gate.sceneIndex + 1 : "?";
    return `Cena ${n}`;
  }

  function clipLabel(scene, index) {
    if (scene && scene.title && String(scene.title).trim()) return String(scene.title).trim();
    const n = typeof scene.index === "number" ? scene.index + 1 : index + 1;
    return `Cena ${n}`;
  }

  function hideAll() {
    const hold = document.getElementById("holdPanel");
    const empty = document.getElementById("emptyPanel");
    const work = document.getElementById("workPanel");
    if (hold) hold.hidden = true;
    if (empty) empty.hidden = true;
    if (work) work.hidden = true;
  }

  function showHold(heldScene, reason) {
    hideAll();
    const hold = document.getElementById("holdPanel");
    if (hold) hold.hidden = false;
    const sceneEl = document.getElementById("holdScene");
    const reasonEl = document.getElementById("holdReason");
    if (sceneEl) sceneEl.textContent = heldScene;
    if (reasonEl) reasonEl.textContent = reason;
  }

  function showEmpty() {
    hideAll();
    const empty = document.getElementById("emptyPanel");
    if (empty) empty.hidden = false;
  }

  function showWork() {
    hideAll();
    const work = document.getElementById("workPanel");
    if (work) work.hidden = false;
  }

  function setStatus(text, isErr) {
    const el = document.getElementById("statusLine");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("err");
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("err", !!isErr);
  }

  let selectedSceneId = null;
  let transformTail = Promise.resolve();
  let textTail = Promise.resolve();

  function currentTransformFromInputs() {
    return {
      scale: Number(document.getElementById("inspScale").value),
      positionX: Number(document.getElementById("inspPosX").value),
      positionY: Number(document.getElementById("inspPosY").value),
      opacity: Number(document.getElementById("inspOpacity").value),
    };
  }

  function paintInspector(scene, session) {
    const panel = document.getElementById("clipInspector");
    if (!panel) return;
    if (!scene) {
      panel.hidden = true;
      selectedSceneId = null;
      return;
    }
    panel.hidden = false;
    selectedSceneId = scene.id;
    const title = document.getElementById("inspectorTitle");
    if (title) title.textContent = clipLabel(scene, scene.index || 0);
    document.getElementById("inspScale").value = scene.scale != null ? scene.scale : 1;
    document.getElementById("inspPosX").value = scene.positionX != null ? scene.positionX : 0;
    document.getElementById("inspPosY").value = scene.positionY != null ? scene.positionY : 0;
    document.getElementById("inspOpacity").value = scene.opacity != null ? scene.opacity : 1;
    const bright = document.getElementById("inspBrightness");
    if (bright) bright.value = scene.colorBrightness != null ? scene.colorBrightness : 0;
    const brand = document.getElementById("inspBrand");
    if (brand && session) brand.value = session.brand != null ? session.brand : "";
  }

  function persistTransform(sessionIdLocal, state) {
    if (!sessionIdLocal || !selectedSceneId || !window.moviola || typeof window.moviola.setSceneTransform !== "function") return;
    const transform = currentTransformFromInputs();
    transformTail = window.moviola.setSceneTransform(sessionIdLocal, selectedSceneId, transform).then((session) => {
      state.session = session;
      const scene = session.scenes.find((item) => item.id === selectedSceneId);
      if (scene) {
        state.selectedTransform = {
          scale: scene.scale,
          positionX: scene.positionX,
          positionY: scene.positionY,
          opacity: scene.opacity,
        };
      }
      return session;
    });
    return transformTail;
  }

  function wireInspector(sessionIdLocal, state) {
    ["inspScale", "inspPosX", "inspPosY", "inspOpacity"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.dataset.wired === "1") return;
      el.dataset.wired = "1";
      el.addEventListener("change", () => persistTransform(sessionIdLocal, state));
      el.addEventListener("input", () => {
        // debounce light: still persist on input for verify speed
        persistTransform(sessionIdLocal, state);
      });
    });
  }

  function renderTrack(session, state, sessionIdLocal) {
    const cells = document.getElementById("trackCells");
    if (!cells) return [];
    cells.innerHTML = "";
    const ordered = [...(session.scenes || [])].sort((a, b) => a.index - b.index);
    if (!ordered.length) {
      const empty = document.createElement("div");
      empty.className = "track-empty";
      empty.textContent = "Nenhum clipe na sessão";
      cells.appendChild(empty);
      return [];
    }
    const labels = [];
    ordered.forEach((scene, i) => {
      const label = clipLabel(scene, i);
      labels.push(label);
      const cell = document.createElement("div");
      cell.className = "track-cell";
      if (selectedSceneId && selectedSceneId === scene.id) cell.classList.add("active");
      cell.dataset.index = String(scene.index);
      cell.dataset.sceneId = scene.id || "";
      if (scene.filePath) cell.dataset.filePath = scene.filePath;
      const title = document.createElement("div");
      title.className = "cell-title";
      title.textContent = label;
      const meta = document.createElement("div");
      meta.className = "cell-meta";
      meta.textContent = `idx ${scene.index}`;
      cell.appendChild(title);
      cell.appendChild(meta);
      cell.addEventListener("click", () => {
        selectedSceneId = scene.id;
        renderTrack(state.session || session, state, sessionIdLocal);
        paintInspector(scene, state.session || session);
        wireInspector(sessionIdLocal, state);
      });
      cells.appendChild(cell);
    });
    return labels;
  }

  function renderTextTrack(session, state, sessionIdLocal) {
    const cells = document.getElementById("trackTextCells");
    if (!cells) return [];
    cells.innerHTML = "";
    let tracks = [...(session.textTracks || [])];
    if (!tracks.length) {
      tracks = [{ id: "v2-1", text: "", startSeconds: 0, endSeconds: 2 }];
    }
    const labels = [];
    tracks.forEach((track, i) => {
      labels.push(track.text || "");
      const cell = document.createElement("div");
      cell.className = "track-cell cell-text";
      cell.dataset.trackId = track.id;
      const input = document.createElement("input");
      input.className = "cell-edit";
      input.type = "text";
      input.value = track.text || "";
      input.placeholder = `Texto ${i + 1}`;
      input.addEventListener("change", () => {
        const next = tracks.map((item, idx) => {
          if (idx !== i) return item;
          return { ...item, text: input.value };
        });
        if (!window.moviola || typeof window.moviola.setTextTracks !== "function") return;
        textTail = window.moviola.setTextTracks(sessionIdLocal, next).then((saved) => {
          state.session = saved;
          state.textLabels = (saved.textTracks || []).map((t) => t.text || "");
          renderTextTrack(saved, state, sessionIdLocal);
          return saved;
        });
      });
      cell.appendChild(input);
      const meta = document.createElement("div");
      meta.className = "cell-meta";
      meta.textContent = `${track.startSeconds}s–${track.endSeconds}s`;
      cell.appendChild(meta);
      cells.appendChild(cell);
    });
    // add button to append track
    const add = document.createElement("button");
    add.type = "button";
    add.className = "track-cell";
    add.textContent = "+ texto";
    add.style.cursor = "pointer";
    add.addEventListener("click", () => {
      const next = [
        ...tracks,
        { id: `v2-${Date.now()}`, text: "", startSeconds: tracks.length * 2, endSeconds: tracks.length * 2 + 2 },
      ];
      if (!window.moviola || typeof window.moviola.setTextTracks !== "function") return;
      textTail = window.moviola.setTextTracks(sessionIdLocal, next).then((saved) => {
        state.session = saved;
        renderTextTrack(saved, state, sessionIdLocal);
        return saved;
      });
    });
    cells.appendChild(add);
    return labels;
  }


  let colorTail = Promise.resolve();
  let brandTail = Promise.resolve();
  let bladeTail = Promise.resolve();
  let undoTail = Promise.resolve();
  let redoTail = Promise.resolve();
  let toolsTail = Promise.resolve();
  let colorAdjustmentOn = true;

  async function ensureColorMode() {
    if (window.moviola && typeof window.moviola.colorAdjustmentEnabled === "function") {
      colorAdjustmentOn = await window.moviola.colorAdjustmentEnabled();
    }
    const bright = document.getElementById("inspBrightness");
    const field = document.getElementById("colorField");
    if (bright) {
      bright.disabled = !colorAdjustmentOn;
      if (!colorAdjustmentOn) bright.title = "Ajuste de cor desabilitado";
    }
    if (field) field.hidden = false; // tab exists; disabled when worker says so
    return colorAdjustmentOn;
  }

  function wireColorAndBrand(sessionIdLocal, state) {
    const bright = document.getElementById("inspBrightness");
    if (bright && bright.dataset.wired !== "1") {
      bright.dataset.wired = "1";
      const persist = () => {
        if (!colorAdjustmentOn) return;
        if (!sessionIdLocal || !selectedSceneId || !window.moviola || typeof window.moviola.setSceneColorBrightness !== "function") return;
        colorTail = window.moviola.setSceneColorBrightness(sessionIdLocal, selectedSceneId, Number(bright.value)).then((session) => {
          state.session = session;
          return session;
        });
        return colorTail;
      };
      bright.addEventListener("change", persist);
      bright.addEventListener("input", persist);
    }
    const brand = document.getElementById("inspBrand");
    if (brand && brand.dataset.wired !== "1") {
      brand.dataset.wired = "1";
      brand.addEventListener("change", () => {
        if (!sessionIdLocal || !window.moviola || typeof window.moviola.setBrand !== "function") return;
        brandTail = window.moviola.setBrand(sessionIdLocal, brand.value).then((session) => {
          state.session = session;
          return session;
        });
      });
    }
  }

  function wireBladeUndoTools(sessionIdLocal, state) {
    const blade = document.getElementById("btnBlade");
    if (blade && blade.dataset.wired !== "1") {
      blade.dataset.wired = "1";
      blade.addEventListener("click", () => {
        if (!sessionIdLocal || !selectedSceneId || !window.moviola || typeof window.moviola.splitScene !== "function") return;
        const scene = (state.session && state.session.scenes || []).find((item) => item.id === selectedSceneId);
        const at = scene && scene.durationSeconds ? scene.durationSeconds / 2 : 1;
        bladeTail = window.moviola.splitScene(sessionIdLocal, selectedSceneId, at).then((session) => {
          state.session = session;
          state.trackLabels = renderTrack(session, state, sessionIdLocal);
          return session;
        });
        return bladeTail;
      });
    }
    const undoBtn = document.getElementById("btnUndo");
    if (undoBtn && undoBtn.dataset.wired !== "1") {
      undoBtn.dataset.wired = "1";
      undoBtn.addEventListener("click", () => {
        if (!sessionIdLocal || !window.moviola || typeof window.moviola.undo !== "function") return;
        undoTail = window.moviola.undo(sessionIdLocal).then((session) => {
          state.session = session;
          state.trackLabels = renderTrack(session, state, sessionIdLocal);
          const scene = session.scenes.find((item) => item.id === selectedSceneId) || session.scenes[0];
          paintInspector(scene, session);
          return session;
        });
        return undoTail;
      });
    }
    const redoBtn = document.getElementById("btnRedo");
    if (redoBtn && redoBtn.dataset.wired !== "1") {
      redoBtn.dataset.wired = "1";
      redoBtn.addEventListener("click", () => {
        if (!sessionIdLocal || !window.moviola || typeof window.moviola.redo !== "function") return;
        redoTail = window.moviola.redo(sessionIdLocal).then((session) => {
          state.session = session;
          state.trackLabels = renderTrack(session, state, sessionIdLocal);
          const scene = session.scenes.find((item) => item.id === selectedSceneId) || session.scenes[0];
          paintInspector(scene, session);
          return session;
        });
        return redoTail;
      });
    }
    const toolsBtn = document.getElementById("btnTools");
    const menu = document.getElementById("toolsMenu");
    if (toolsBtn && menu && toolsBtn.dataset.wired !== "1") {
      toolsBtn.dataset.wired = "1";
      toolsBtn.addEventListener("click", () => {
        const open = menu.hidden;
        menu.hidden = !open;
        toolsBtn.setAttribute("aria-expanded", String(open));
      });
      menu.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tool]");
        if (!button || !sessionIdLocal || !window.moviola) return;
        const tool = button.dataset.tool;
        const sceneId = selectedSceneId || (state.session && state.session.scenes[0] && state.session.scenes[0].id);
        const run = async () => {
          if (tool === "ingestLocalVideo") return window.moviola.ingestLocalVideo(sessionIdLocal);
          if (tool === "trimClip") return window.moviola.trimClip(sessionIdLocal, sceneId, 0, 1);
          if (tool === "setTranslation") return window.moviola.setTranslation(sessionIdLocal, sceneId, "tradução");
          if (tool === "dubNarration") return window.moviola.dubNarration(sessionIdLocal, null);
          if (tool === "searchStock") return window.moviola.searchStock("cafe");
          if (tool === "insertStockScene") {
            return window.moviola.insertStockScene(sessionIdLocal, { id: "stock-1", title: "Stock", url: "http://127.0.0.1/missing.mp4" });
          }
          if (tool === "generateAvatar") return window.moviola.generateAvatar(sessionIdLocal, sceneId, null);
          if (tool === "fillFromSlides") return window.moviola.fillFromSlides(sessionIdLocal, ["A", "B"]);
          if (tool === "removeBackground") return window.moviola.removeBackground(sessionIdLocal, sceneId);
          if (tool === "auditScene") return window.moviola.auditScene(sessionIdLocal, sceneId, 0.8);
          return null;
        };
        toolsTail = run().then((session) => {
          if (session && session.scenes) {
            state.session = session;
            state.trackLabels = renderTrack(session, state, sessionIdLocal);
          }
          menu.hidden = true;
          toolsBtn.setAttribute("aria-expanded", "false");
          return session;
        }).catch((err) => {
          setStatus(String(err && err.message ? err.message : err), true);
          menu.hidden = true;
          toolsBtn.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  window.moviolaColor = () => colorTail;
  window.moviolaBrand = () => brandTail;
  window.moviolaBlade = () => bladeTail;
  window.moviolaUndo = () => undoTail;
  window.moviolaRedo = () => redoTail;
  window.moviolaTools = () => toolsTail;


  window.moviolaTransform = () => transformTail;
  window.moviolaTextTracks = () => textTail;

  async function attachMonitor(outputPath, state) {
    const video = document.getElementById("monitorVideo");
    const empty = document.getElementById("monitorEmpty");
    if (!video || !outputPath) return false;
    let src = "";
    if (window.moviola && typeof window.moviola.mediaUrl === "function") {
      src = await window.moviola.mediaUrl(outputPath);
    } else {
      throw new Error("moviola.mediaUrl ausente no preload");
    }
    video.src = src;
    video.hidden = false;
    if (empty) empty.hidden = true;
    state.outputPath = outputPath;
    state.videoSrc = src;
    const onMeta = () => {
      state.playing = !video.paused;
      state.videoWidth = video.videoWidth || 0;
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("play", () => {
      state.playing = true;
    });
    video.addEventListener("pause", () => {
      state.playing = false;
    });
    try {
      await video.play();
      state.playing = true;
    } catch (_) {
      state.playing = false;
    }
    return true;
  }

  function wireExport(sessionIdLocal, state) {
    const btn = document.getElementById("btnExport");
    if (!btn) return;
    btn.hidden = !state.outputPath;
    btn.onclick = async () => {
      if (!window.moviola || typeof window.moviola.export !== "function") {
        const err = new Error("moviola.export ausente no preload");
        setStatus(err.message, true);
        throw err;
      }
      btn.disabled = true;
      setStatus("Exportando…");
      try {
        const result = await window.moviola.export(sessionIdLocal);
        state.exportResult = result;
        if (result && result.ok) {
          setStatus(`Exportado: ${result.path}`);
        } else {
          const reason = result && result.reason ? result.reason : "falhou";
          setStatus(`Exportação: ${reason}`, reason !== "cancelado");
        }
      } catch (err) {
        setStatus(String(err && err.message ? err.message : err), true);
        throw err;
      } finally {
        btn.disabled = false;
      }
    };
  }

  function wireRender(sessionIdLocal, state) {
    const btn = document.getElementById("btnRender");
    if (!btn) return;
    btn.onclick = async () => {
      if (!window.moviola || typeof window.moviola.render !== "function") {
        setStatus("moviola.render ausente", true);
        return;
      }
      btn.disabled = true;
      state.renderStarted = true;
      setStatus("Render em andamento…");
      try {
        const session = await window.moviola.render(sessionIdLocal);
        state.session = session;
        if (session.status === "done" && session.outputPath) {
          setStatus("Render concluído");
          btn.hidden = true;
          await attachMonitor(session.outputPath, state);
          wireExport(sessionIdLocal, state);
          renderTrack(session, state, sessionIdLocal);
          renderTextTrack(session, state, sessionIdLocal);
        } else if (session.status === "failed") {
          setStatus(session.reason || "Render falhou", true);
          btn.disabled = false;
        } else {
          setStatus(`Status: ${session.status}`, true);
          btn.disabled = false;
        }
      } catch (err) {
        setStatus(String(err && err.message ? err.message : err), true);
        btn.disabled = false;
      }
    };
  }

  const g = document.createElement("canvas");
  g.width = 220;
  g.height = 220;
  const ctx = g.getContext("2d");
  const img = ctx.createImageData(220, 220);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const grain = document.querySelector(".grain");
  if (grain) grain.style.backgroundImage = `url(${g.toDataURL("image/png")})`;

  window.moviolaEditor = (async () => {
    const state = {
      renderStarted: false,
      outputPath: null,
      playing: false,
      videoSrc: null,
      videoWidth: 0,
      trackLabels: [],
      textLabels: [],
      selectedTransform: null,
      exportResult: null,
      session: null,
      heldScene: null,
      reason: null,
    };

    if (!sessionId || !window.moviola) {
      showEmpty();
      state.reason = "sem_sessao";
      return state;
    }

    const session = await window.moviola.read(sessionId);
    state.session = session;
    const proj = document.getElementById("projName");
    if (proj) proj.textContent = session.projectName || "Novo projeto";

    const gate = await window.moviola.gate(sessionId);
    if (!gate || gate.ok === false) {
      const heldScene = sceneLabel(session, gate || { sceneId: "", sceneIndex: 0 });
      const reason = reasonLabel(gate && gate.reason);
      showHold(heldScene, reason);
      state.heldScene = heldScene;
      state.reason = reason;
      state.renderStarted = false;
      return state;
    }

    showWork();
    state.trackLabels = renderTrack(session, state, sessionId);
    state.textLabels = renderTextTrack(session, state, sessionId);
    wireInspector(sessionId, state);
    await ensureColorMode();
    wireColorAndBrand(sessionId, state);
    wireBladeUndoTools(sessionId, state);
    wireRender(sessionId, state);
    wireExport(sessionId, state);

    if (session.status === "done" && session.outputPath) {
      const saved = document.getElementById("savedLabel");
      if (saved) saved.textContent = "Pronto · local";
      document.getElementById("btnRender").hidden = true;
      await attachMonitor(session.outputPath, state);
      wireExport(sessionId, state);
      return state;
    }

    if (session.status === "failed") {
      setStatus(session.reason || "Render falhou", true);
      document.getElementById("btnRender").hidden = false;
      return state;
    }

    // briefing + gate ok → offer Render
    document.getElementById("btnRender").hidden = false;
    setStatus("Gate ok · aguardando render");
    return state;
  })();
})();