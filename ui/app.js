// Language translations - defined at top to avoid temporal dead zone issues
const translations = {
  es: {
    panelTitle: "Panel de Control",
    panelSubtitle: "Clasifica por genero, crea sets y convierte audio sin escribir comandos.",
    classifier: "Clasificador",
    sets: "Creador de Sets",
    converter: "Convertidor",
    metadata: "Auto-Tag",
    bpm: "Editor BPM",
    stems: "Stem Separator",
    settings: "Configuracion",
    dashboard: "Dashboard",
    sidebarNote: "Panel de control para DJs"
  },
  en: {
    panelTitle: "Dashboard",
    panelSubtitle: "Classify by genre, create sets and convert audio without writing commands.",
    classifier: "Classifier",
    sets: "Set Creator",
    converter: "Converter",
    metadata: "Auto-Tag",
    bpm: "BPM Editor",
    stems: "Stem Separator",
    settings: "Settings",
    dashboard: "Dashboard",
    sidebarNote: "Control panel for DJs"
  }
};

const Runtime = {
  isElectron: Boolean(window.electronAPI?.openDirectory)
};

const AppState = {
  settings: {
    defaultOutputDir: "output"
  },
  ffmpegReady: null
};

const ffmpegStateListeners = [];
const FFMPEG_WARNING_IDS = ["cls-ffmpeg-warning", "set-ffmpeg-warning", "conv-ffmpeg-warning"];

function setFfmpegReady(value) {
  const normalized = typeof value === "boolean" ? value : null;
  AppState.ffmpegReady = normalized;
  ffmpegStateListeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch (error) {
      console.error("FFmpeg state listener error:", error);
    }
  });
}

function onFfmpegStateChange(listener) {
  if (typeof listener !== "function") return () => {};
  ffmpegStateListeners.push(listener);
  listener(AppState.ffmpegReady);
  return () => {
    const idx = ffmpegStateListeners.indexOf(listener);
    if (idx >= 0) ffmpegStateListeners.splice(idx, 1);
  };
}

function displayPathLabel(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed;
}

// File dialog functionality
async function selectDirectory(title) {
  try {
    if (Runtime.isElectron) {
      const result = await window.electronAPI.openDirectory(title);
      return result;
    }

    const manualPath = prompt(`${title}\n\nIngresa la ruta completa:`);
    return manualPath && manualPath.trim() ? manualPath.trim() : null;
  } catch (error) {
    console.error('Error selecting directory:', error);
    showToast("Error al seleccionar carpeta: " + error.message, "error");
    return null;
  }
}

// Language toggle in sidebar - Initialize on DOMContentLoaded
let langToggle, langActive, langInactive;

document.addEventListener("DOMContentLoaded", () => {
  langToggle = document.getElementById("lang-toggle");
  langActive = document.getElementById("lang-active");
  langInactive = document.getElementById("lang-inactive");
  
  if (langToggle && langActive && langInactive) {
    // Initialize active/inactive language display
    const currentLang = localStorage.getItem("musickind-lang") || "es";
    updateLangDisplay(currentLang);
    
    langToggle.addEventListener("click", () => {
      const currentLang = localStorage.getItem("musickind-lang") || "es";
      const newLang = currentLang === "es" ? "en" : "es";
      
      // Update language in settings select
      const langSelect = document.getElementById("cfg-language");
      if (langSelect) langSelect.value = newLang;
      
      // Apply language to all UI elements
      applyLanguage(newLang);
      
      // Update the EN | ES display
      updateLangDisplay(newLang);
      
      // Save to localStorage
      localStorage.setItem("musickind-lang", newLang);
      
      showToast(`Idioma cambiado a ${newLang === "es" ? "Español" : "English"}`, "success");
    });
  }
});

function updateLangDisplay(lang) {
  if (langActive && langInactive) {
    if (lang === "es") {
      langActive.textContent = "ES";
      langActive.classList.add("active-lang");
      langInactive.textContent = "EN";
      langInactive.classList.remove("active-lang");
    } else {
      langActive.textContent = "EN";
      langActive.classList.add("active-lang");
      langInactive.textContent = "ES";
      langInactive.classList.remove("active-lang");
    }
  }
}

// File selection for individual files (drag & drop or file picker)
async function selectFiles(title, multiple = false) {
  try {
    if (Runtime.isElectron && window.electronAPI?.openFiles) {
      const result = await window.electronAPI.openFiles(title, multiple);
      return result;
    }

    const promptMessage = multiple
      ? `${title}\n\nIngresa rutas separadas por coma:`
      : `${title}\n\nIngresa la ruta completa del archivo:`;
    const raw = prompt(promptMessage);
    if (!raw || !raw.trim()) return multiple ? [] : null;

    const values = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return multiple ? values : values[0] || null;
  } catch (error) {
    console.error('Error selecting files:', error);
    showToast("Error al seleccionar archivos", "error");
    return null;
  }
}

// Drag and drop handler
function setupDragDrop(element, onFilesDropped) {
  element.addEventListener("dragover", (e) => {
    e.preventDefault();
    element.classList.add("drag-over");
  });
  
  element.addEventListener("dragleave", () => {
    element.classList.remove("drag-over");
  });
  
  element.addEventListener("drop", (e) => {
    e.preventDefault();
    element.classList.remove("drag-over");
    
    const files = Array.from(e.dataTransfer.files).map(f => f.path || f.name);
    if (files.length > 0) {
      onFilesDropped(files);
    }
  });
}

// Browse button handlers
document.getElementById('cls-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona carpeta a clasificar');
  if (path) {
    const input = document.getElementById('cls-input');
    input.value = path;
    input.dataset.pathLabel = displayPathLabel(path);
  }
});

// ==================== SET CREATOR ====================

document.getElementById('set-warmup-browse').addEventListener('click', async () => {
  const dir = Runtime.isElectron ? await window.electronAPI.openDirectory() : null;
  if (dir) document.getElementById('set-warmup').value = dir;
});

document.getElementById('set-peak-browse').addEventListener('click', async () => {
  const dir = Runtime.isElectron ? await window.electronAPI.openDirectory() : null;
  if (dir) document.getElementById('set-peak').value = dir;
});

document.getElementById('set-closing-browse').addEventListener('click', async () => {
  const dir = Runtime.isElectron ? await window.electronAPI.openDirectory() : null;
  if (dir) document.getElementById('set-closing').value = dir;
});

document.getElementById('set-pack-browse').addEventListener('click', async () => {
  const dir = Runtime.isElectron ? await window.electronAPI.openDirectory() : null;
  if (dir) document.getElementById('set-pack').value = dir;
});

document.getElementById('set-seconds').addEventListener('input', () => {
  document.getElementById('set-seconds-value').textContent =
    `${document.getElementById('set-seconds').value}s`;
});

// Converter drop zones
const convInputDrop = document.getElementById("conv-input-drop");
const convInput = document.getElementById("conv-input");

// Setup drag & drop for converter input
setupDragDrop(convInputDrop, async (files) => {
  if (files.length === 1) {
    convInput.value = files[0];
    convInput.dataset.pathLabel = displayPathLabel(files[0]);
    convInput.classList.remove("hidden");
    convInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  } else {
    showToast("Selecciona una carpeta", "info");
  }
});

convInputDrop.addEventListener("click", async () => {
  const path = await selectDirectory("Selecciona carpeta de entrada");
  if (path) {
    convInput.value = path;
    convInput.dataset.pathLabel = displayPathLabel(path);
    convInput.classList.remove("hidden");
    convInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  }
});

// ==================== BPM EDITOR DROP ZONE ====================

const bpmInputDrop = document.getElementById("bpm-input-drop");
const bpmInputPath = document.getElementById("bpm-input");

setupDragDrop(bpmInputDrop, async (files) => {
  if (files.length === 1) {
    bpmInputPath.value = files[0];
    bpmInputPath.dataset.pathLabel = displayPathLabel(files[0]);
    bpmInputPath.classList.remove("hidden");
    bpmInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  } else {
    showToast("Selecciona una carpeta", "info");
  }
});

bpmInputDrop.addEventListener("click", async () => {
  const path = await selectDirectory("Selecciona carpeta con archivos de audio");
  if (path) {
    bpmInputPath.value = path;
    bpmInputPath.dataset.pathLabel = displayPathLabel(path);
    bpmInputPath.classList.remove("hidden");
    bpmInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  }
});

// ==================== METADATA EDITOR DROP ZONE ====================

const metaInputDrop = document.getElementById("meta-input-drop");
const metaInputPath = document.getElementById("meta-input");

if (metaInputDrop && metaInputPath) {
  setupDragDrop(metaInputDrop, async (files) => {
    if (files.length === 1) {
      metaInputPath.value = files[0];
      metaInputPath.dataset.pathLabel = displayPathLabel(files[0]);
      metaInputPath.classList.remove("hidden");
      metaInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
    } else {
      showToast("Selecciona una carpeta", "info");
    }
  });
}

if (metaInputDrop) metaInputDrop.addEventListener("click", async () => {
  if (!metaInputPath) return;
  const path = await selectDirectory("Selecciona carpeta con archivos de audio");
  if (path) {
    metaInputPath.value = path;
    metaInputPath.dataset.pathLabel = displayPathLabel(path);
    metaInputPath.classList.remove("hidden");
    metaInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  }
});

const navButtons = document.querySelectorAll(".nav-btn");
const panels = {
  classifier: document.getElementById("tab-classifier"),
  sets: document.getElementById("tab-sets"),
  converter: document.getElementById("tab-converter"),
  metadata: document.getElementById("tab-metadata"),
  bpm: document.getElementById("tab-bpm"),
  stems: document.getElementById("tab-stems"),
  settings: document.getElementById("tab-settings")
};

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.values(panels).forEach((panel) => panel.classList.add("hidden"));
    panels[btn.dataset.tab].classList.remove("hidden");
  });
});

const genresList = document.getElementById("genres-list");
const genresInput = document.getElementById("genres-input");
const genresAdd = document.getElementById("genres-add");
const genresSave = document.getElementById("genres-save");
let genres = [];

function renderGenres() {
  genresList.innerHTML = "";
  
  if (genres.length === 0) {
    genresList.innerHTML = '<div class="genres-empty">No hay géneros definidos. Agrega uno para comenzar.</div>';
    return;
  }
  
  genres.forEach((genre, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${genre}</span>
      <button class="chip-remove" data-idx="${idx}" title="Eliminar género">×</button>
    `;
    genresList.appendChild(chip);
  });
  
  // Add click handlers for remove buttons
  document.querySelectorAll(".chip-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.idx);
      genres.splice(idx, 1);
      renderGenres();
      showToast("Género eliminado", "info");
    });
  });
}

async function loadGenres() {
  const res = await fetch("/api/genres");
  const data = await res.json();
  if (data.ok) {
    genres = data.genres;
    renderGenres();
  }
}

genresAdd.addEventListener("click", () => {
  const value = genresInput.value.trim();
  if (!value) return;
  if (!genres.includes(value)) {
    genres.push(value);
    renderGenres();
  }
  genresInput.value = "";
});

genresSave.addEventListener("click", async () => {
  const res = await fetch("/api/genres", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ genres })
  });
  const data = await res.json();
  const status = document.getElementById("cls-status");
  status.textContent = data.ok ? "Generos guardados." : `Error: ${data.error}`;
});

const clsRun = document.getElementById("cls-run");
const clsPause = document.getElementById("cls-pause");
const clsCancel = document.getElementById("cls-cancel");
let currentProcessId = null;
let clsIsPaused = false;

clsRun.addEventListener("click", async () => {
  const inputPath = document.getElementById("cls-input").value.trim();
  const dryRun = document.getElementById("cls-dry").checked;
  const status = document.getElementById("cls-status");
  const log = document.getElementById("cls-log");
  
  // Progress elements
  const progressContainer = document.getElementById("cls-progress-container");
  const progressText = document.getElementById("cls-progress-text");
  const progressPercent = document.getElementById("cls-progress-percent");
  const progressFill = document.getElementById("cls-progress-fill");
  const currentFile = document.getElementById("cls-current-file");
  
  // Generate unique process ID
  currentProcessId = `cls-${Date.now()}`;
  
  status.textContent = "Ejecutando clasificador...";
  log.textContent = "";
  
  // Show progress bar and cancel button
  progressContainer.classList.remove("hidden");
  progressText.textContent = "Preparando...";
  progressPercent.textContent = "0%";
  progressFill.style.width = "0%";
  currentFile.textContent = "";
  
  clsRun.classList.add("hidden");
  clsPause.classList.remove("hidden");
  clsCancel.classList.remove("hidden");
  clsIsPaused = false;
  clsPause.textContent = "⏸ Pausar";

  const res = await fetch("/api/genre-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputPath, dryRun, processId: currentProcessId })
  });
  
  if (!res.ok) {
    const data = await res.json();
    status.textContent = `Error: ${data.error}`;
    log.textContent = data.error || "";
    progressContainer.classList.add("hidden");
    clsRun.classList.remove("hidden");
    clsPause.classList.add("hidden");
    clsCancel.classList.add("hidden");
    clsIsPaused = false;
    return;
  }

  // Handle streaming response
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress') {
            progressText.textContent = `Procesando archivo ${data.processed} de ${data.total}`;
            progressPercent.textContent = `${data.percentage}%`;
            progressFill.style.width = `${data.percentage}%`;
            currentFile.textContent = data.current || "";
            status.textContent = `(${data.processed}/${data.total}) ${data.current}`;
            if (data.current) {
              log.textContent += `${log.textContent ? "\n" : ""}[${data.processed}/${data.total}] Analizando: ${data.current}`;
              log.scrollTop = log.scrollHeight;
            }
          } else if (data.type === 'log') {
            if (data.message) {
              log.textContent += `${log.textContent ? "\n" : ""}${data.message}`;
              log.scrollTop = log.scrollHeight;
            }
          } else if (data.type === 'complete') {
            status.textContent = data.success ? "Clasificacion completada." : "Proceso cancelado o error.";
            progressText.textContent = data.success ? "Completado" : "Cancelado";
            progressFill.style.width = data.success ? "100%" : "0%";
            if (data.error) {
              log.textContent += `${log.textContent ? "\n\n" : ""}Error:\n${data.error}`;
            } else if (data.message) {
              log.textContent += `${log.textContent ? "\n\n" : ""}${data.message}`;
            }
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }

  // Hide progress bar and restore buttons after delay
  setTimeout(() => {
    progressContainer.classList.add("hidden");
    clsRun.classList.remove("hidden");
    clsPause.classList.add("hidden");
    clsCancel.classList.add("hidden");
    clsIsPaused = false;
    currentProcessId = null;
  }, 2000);
});

clsCancel.addEventListener("click", async () => {
  if (!currentProcessId) return;
  const confirmed = confirm("¿Estás seguro que deseas cancelar la clasificación?");
  if (!confirmed) return;
  try {
    if (clsIsPaused) {
      await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
    }
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: currentProcessId })
    });
    clsIsPaused = false;
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});

clsPause.addEventListener("click", async () => {
  if (!currentProcessId) return;
  if (clsIsPaused) {
    try {
      await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
      clsIsPaused = false;
      clsPause.textContent = "⏸ Pausar";
    } catch (e) {
      console.error('Error resuming:', e);
    }
  } else {
    try {
      await fetch("/api/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
      clsIsPaused = true;
      clsPause.textContent = "▶ Reanudar";
    } catch (e) {
      console.error('Error pausing:', e);
    }
  }
});

const setRun = document.getElementById("set-run");
const setCancel = document.getElementById("set-cancel");
let setProcessId = null;

setRun.addEventListener("click", async () => {
  const warmup = document.getElementById("set-warmup").value.trim();
  const peak = document.getElementById("set-peak").value.trim();
  const closing = document.getElementById("set-closing").value.trim();
  const pack = document.getElementById("set-pack").value.trim();
  const status = document.getElementById("set-status");
  const progressContainer = document.getElementById("set-progress-container");
  const progressText = document.getElementById("set-progress-text");
  const progressPercent = document.getElementById("set-progress-percent");
  const progressFill = document.getElementById("set-progress-fill");
  const currentFile = document.getElementById("set-current-file");
  const tableBody = document.getElementById("set-table-body");

  if (!pack) {
    status.textContent = "Selecciona el pack nuevo a evaluar.";
    return;
  }
  if (!warmup && !peak && !closing) {
    status.textContent = "Selecciona al menos una carpeta de referencia (Warmup, Peak o Closing).";
    return;
  }

  setProcessId = `set-${Date.now()}`;
  progressContainer.classList.remove("hidden");
  setRun.classList.add("hidden");
  setCancel.classList.remove("hidden");
  status.textContent = "Analizando...";
  tableBody.innerHTML = '<tr><td colspan="5" class="empty-row">Analizando...</td></tr>';

  try {
    const body = { input: pack, processId: setProcessId, analysisSeconds: parseInt(document.getElementById("set-seconds").value) };
    if (warmup) body.warmup = warmup;
    if (peak) body.peak = peak;
    if (closing) body.closing = closing;

    const res = await fetch("/api/set-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const data = await res.json();
      status.textContent = `Error: ${data.error}`;
      resetSetButtons();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "progress") {
            progressText.textContent = `Analizando ${data.processed} de ${data.total}`;
            progressPercent.textContent = `${data.percentage}%`;
            progressFill.style.width = `${data.percentage}%`;
            currentFile.textContent = data.current || "";
            status.textContent = `(${data.processed}/${data.total}) ${data.current}`;
          } else if (data.type === "complete") {
            status.textContent = data.success ? "Análisis completado." : "Proceso cancelado o error.";
            if (data.error) status.textContent += ` — ${data.error}`;
            progressText.textContent = data.success ? "Completado" : "Cancelado";
            progressFill.style.width = data.success ? "100%" : "0%";
          } else if (data.type === "result") {
            renderSetResults(data.results || [], tableBody);
          }
        } catch (e) {
          console.error("Error parsing SSE data:", e);
        }
      }
    }
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }

  resetSetButtons();
});

setCancel.addEventListener("click", async () => {
  if (!setProcessId) return;
  
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: setProcessId })
    });
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});

function resetSetButtons() {
  setTimeout(() => {
    document.getElementById("set-progress-container").classList.add("hidden");
    setRun.classList.remove("hidden");
    setCancel.classList.add("hidden");
    setProcessId = null;
  }, 2000);
}

function renderSetResults(results, tableBody) {
  tableBody.innerHTML = "";
  const SECTION_LABELS = { warmup: "★ Warmup", peak: "★ Peak", closing: "★ Closing" };
  for (const r of results) {
    const row = document.createElement("tr");
    const name = r.file ? r.file.split(/[\\/]/).pop() : "—";

    const nameTd = document.createElement("td");
    nameTd.textContent = name;
    nameTd.title = r.file || "";

    const fmt = (v) => v !== null && v !== undefined ? `${v}%` : "—";
    const scoreTd = (v, isBest) => {
      const td = document.createElement("td");
      td.textContent = fmt(v);
      if (isBest && v !== null) td.style.fontWeight = "bold";
      return td;
    };

    const best = r.best || null;
    row.appendChild(nameTd);
    row.appendChild(scoreTd(r.warmup, best === "warmup"));
    row.appendChild(scoreTd(r.peak, best === "peak"));
    row.appendChild(scoreTd(r.closing, best === "closing"));

    const bestTd = document.createElement("td");
    bestTd.textContent = best ? (SECTION_LABELS[best] || best) : "—";
    if (r.error) {
      bestTd.textContent = "Error";
      bestTd.title = r.error;
    }
    row.appendChild(bestTd);

    tableBody.appendChild(row);
  }
}

const convRun = document.getElementById("conv-run");
const convCancel = document.getElementById("conv-cancel");
let convProcessId = null;

// Converter drop zones - already declared above at line 130
const convInputPath = document.getElementById("conv-input");

// Ensure we have the correct elements (if they exist from new HTML structure)
const convInputDropZone = document.getElementById("conv-input-drop");
convRun.addEventListener("click", async () => {
  const inputPath = convInputPath.value.trim();
  const outputPath = (AppState.settings.defaultOutputDir || "output").trim();
  const format = document.getElementById("conv-format").value;
  const bitrate = document.getElementById("conv-bitrate").value;
  const status = document.getElementById("conv-status");
  const log = document.getElementById("conv-log");

  // Progress elements
  const progressContainer = document.getElementById("conv-progress-container");
  const progressText = document.getElementById("conv-progress-text");
  const progressPercent = document.getElementById("conv-progress-percent");
  const progressFill = document.getElementById("conv-progress-fill");
  const currentFile = document.getElementById("conv-current-file");

  // Generate unique process ID
  convProcessId = `conv-${Date.now()}`;

  status.textContent = "Convirtiendo...";
  log.textContent = "";

  // Show progress bar and cancel button
  if (progressContainer) {
    progressContainer.classList.remove("hidden");
    progressText.textContent = "Preparando...";
    progressPercent.textContent = "0%";
    progressFill.style.width = "0%";
    currentFile.textContent = "";
  }

  convRun.classList.add("hidden");
  convCancel.classList.remove("hidden");

  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputPath,
      outputPath,
      format,
      bitrate: format === "mp3" && bitrate ? Number(bitrate) : null,
      processId: convProcessId
    })
  });

  if (!res.ok) {
    const data = await res.json();
    status.textContent = `Error: ${data.error}`;
    log.textContent = data.error || "";
    if (progressContainer) progressContainer.classList.add("hidden");
    convRun.classList.remove("hidden");
    convCancel.classList.add("hidden");
    return;
  }

  // Handle streaming response
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress') {
            if (progressContainer) {
              progressText.textContent = `Convirtiendo archivo ${data.processed} de ${data.total}`;
              progressPercent.textContent = `${data.percentage}%`;
              progressFill.style.width = `${data.percentage}%`;
              currentFile.textContent = data.current || "";
            }
            status.textContent = `Convirtiendo... ${data.message}`;
          } else if (data.type === 'complete') {
            status.textContent = data.success ? "Conversion finalizada." : "Proceso cancelado o error.";
            if (progressContainer) {
              progressText.textContent = data.success ? "Completado" : "Cancelado";
              progressFill.style.width = data.success ? "100%" : "0%";
            }
            if (data.error) {
              log.textContent += `${log.textContent ? "\n\n" : ""}Error:\n${data.error}`;
            }
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }

  // Hide progress bar and restore buttons after delay
  setTimeout(() => {
    if (progressContainer) progressContainer.classList.add("hidden");
    convRun.classList.remove("hidden");
    convCancel.classList.add("hidden");
    convProcessId = null;
  }, 2000);
});

convCancel.addEventListener("click", async () => {
  if (!convProcessId) return;
  
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: convProcessId })
    });
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});

// ==================== METADATA EDITOR FUNCTIONALITY ====================

const metaInput = document.getElementById("meta-input");
const metaLoad = document.getElementById("meta-load");
const metaIdentifyAll = document.getElementById("meta-identify-all");
const metaCancel = document.getElementById("meta-cancel");
const metaFileList = document.getElementById("meta-file-list");
const metaProgress = document.getElementById("meta-progress");
const metaProgressText = document.getElementById("meta-progress-text");
const metaProgressPercent = document.getElementById("meta-progress-percent");
const metaProgressFill = document.getElementById("meta-progress-fill");
const metaCurrentFile = document.getElementById("meta-current-file");
const metaResults = document.getElementById("meta-results");
const metaResultsList = document.getElementById("meta-results-list");
const metaStatus = document.getElementById("meta-status");
const metaEditor = document.getElementById("meta-editor");
const metaNewFilename = document.getElementById("meta-new-filename");
const metaCancelEdit = document.getElementById("meta-cancel-edit");
const metaSave = document.getElementById("meta-save");
const metaPreviewName = document.getElementById("meta-preview-name");
const metaTitle = document.getElementById("meta-title");
const metaArtist = document.getElementById("meta-artist");
const metaAlbum = document.getElementById("meta-album");
const metaYear = document.getElementById("meta-year");
const metaGenre = document.getElementById("meta-genre");
const metaTrack = document.getElementById("meta-track");

let metaFiles = [];
let metaProcessId = null;
let metaResultsData = [];
let currentMetaFile = null;
let currentMetaData = null;

// Load files from selected folder
if (metaLoad) metaLoad.addEventListener("click", async () => {
  if (!metaInput || !metaStatus || !metaFileList || !metaResults || !metaResultsList) return;

  const dir = metaInput.value.trim();
  if (!dir) {
    metaStatus.textContent = "Selecciona una carpeta primero.";
    return;
  }
  
  metaStatus.textContent = "Cargando archivos...";
  metaFileList.innerHTML = '<div class="empty-state">Cargando...</div>';
  
  try {
    const res = await fetch(`/api/metadata/list?dir=${encodeURIComponent(dir)}&recursive=false`);
    const data = await res.json();
    
    if (!data.ok) {
      metaStatus.textContent = `Error: ${data.error}`;
      metaFileList.innerHTML = '<div class="empty-state">Error al cargar</div>';
      return;
    }
    
    if (data.files.length === 0) {
      metaStatus.textContent = "No se encontraron archivos de audio.";
      metaFileList.innerHTML = '<div class="empty-state">No hay archivos de audio en esta carpeta</div>';
      return;
    }
    
    metaFiles = data.files;
    metaStatus.textContent = `${data.files.length} archivos encontrados. Presiona "Identificar todos" para comenzar.`;
    renderMetaFileList(data.files, false);
    metaResults.classList.add("hidden");
    metaResultsList.innerHTML = "";
  } catch (e) {
    metaStatus.textContent = `Error: ${e.message}`;
    metaFileList.innerHTML = '<div class="empty-state">Error de conexion</div>';
  }
});

// Audio file extensions filter
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aiff', 'aif', 'flac', 'm4a'];

function isAudioFile(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

// Render file list
function renderMetaFileList(files, showStatus = true) {
  metaFileList.innerHTML = "";
  
  // Filter audio files only
  const audioFiles = files.filter(f => {
    const fileName = f.split("/").pop();
    return isAudioFile(fileName);
  });
  
  const rejectedCount = files.length - audioFiles.length;
  
  if (rejectedCount > 0) {
    metaFileList.innerHTML = `<div class="file-rejected">${rejectedCount} archivo(s) no válido(s) ignorado(s)</div>`;
  }
  
  if (audioFiles.length === 0) {
    metaFileList.innerHTML += '<div class="empty-state">No se encontraron archivos de audio válidos</div>';
    return;
  }
  
  metaFiles = audioFiles;
  
  audioFiles.forEach((filePath, idx) => {
    const fileName = filePath.split("/").pop();
    const ext = fileName.split(".").pop().toUpperCase();
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    fileItem.dataset.path = filePath;
    fileItem.dataset.idx = idx;
    fileItem.innerHTML = `
      <button class="file-item-remove" data-idx="${idx}" title="Quitar archivo">×</button>
      <span class="file-item-name">${fileName}</span>
      <span class="file-item-meta">${ext}</span>
      <button class="file-item-edit btn" data-path="${filePath}" title="Editar metadatos">✎</button>
    `;
    metaFileList.appendChild(fileItem);
  });
  
  // Add click handlers for remove buttons
  document.querySelectorAll(".file-item-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(e.target.dataset.idx);
      removeMetaFile(idx);
    });
  });

  // Add click handlers for edit buttons
  document.querySelectorAll(".file-item-edit").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      if (!filePath || !metaEditor) return;
      try {
        const res = await fetch(`/api/metadata?file=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (!data.ok) return;
        currentMetaFile = filePath;
        currentMetaData = data.metadata;
        if (metaTitle) metaTitle.value = data.metadata.title || "";
        if (metaArtist) metaArtist.value = data.metadata.artist || "";
        if (metaAlbum) metaAlbum.value = data.metadata.album || "";
        if (metaYear) metaYear.value = data.metadata.year || "";
        if (metaGenre) metaGenre.value = data.metadata.genre || "";
        if (metaTrack) metaTrack.value = data.metadata.track || "";
        const baseName = filePath.split("/").pop().replace(/\.[^.]+$/, "");
        if (metaNewFilename) metaNewFilename.value = baseName;
        updateMetaPreview();
        metaEditor.classList.remove("hidden");
        metaEditor.scrollIntoView({ behavior: "smooth" });
      } catch (err) {
        if (metaStatus) metaStatus.textContent = `Error al leer metadatos: ${err.message}`;
      }
    });
  });
}

function removeMetaFile(idx) {
  if (idx >= 0 && idx < metaFiles.length) {
    const removedFile = metaFiles[idx].split("/").pop();
    metaFiles.splice(idx, 1);
    
    // Re-render with updated indices
    const container = metaFileList;
    const currentScroll = container.scrollTop;
    renderMetaFileList(metaFiles, false);
    container.scrollTop = currentScroll;
    
    showToast(`"${removedFile}" removido`, "info");
    
    // If no files left, show original empty state
    if (metaFiles.length === 0) {
      metaFileList.innerHTML = '<div class="empty-state">Selecciona una carpeta para ver los archivos</div>';
    }
  }
}

// Identify all files
if (metaIdentifyAll) metaIdentifyAll.addEventListener("click", async () => {
  if (!metaStatus || !metaProgress || !metaCancel || !metaProgressText || !metaProgressPercent || !metaProgressFill || !metaCurrentFile || !metaFileList || !metaResults || !metaResultsList) return;

  if (metaFiles.length === 0) {
    metaStatus.textContent = "Carga archivos primero.";
    return;
  }
  
  metaProcessId = `meta-${Date.now()}`;
  metaResultsData = [];
  
  // Show progress
  metaProgress.classList.remove("hidden");
  metaIdentifyAll.classList.add("hidden");
  metaCancel.classList.remove("hidden");
  metaStatus.textContent = "Identificando canciones...";
  
  const total = metaFiles.length;
  let processed = 0;
  
  for (const filePath of metaFiles) {
    const fileName = filePath.split("/").pop();
    
    metaProgressText.textContent = `Identificando archivo ${processed + 1} de ${total}`;
    metaProgressPercent.textContent = `${Math.round((processed / total) * 100)}%`;
    metaProgressFill.style.width = `${(processed / total) * 100}%`;
    metaCurrentFile.textContent = fileName;
    
    try {
      const res = await fetch("/api/metadata/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, processId: metaProcessId })
      });
      
      const data = await res.json();
      
      if (data.ok) {
        metaResultsData.push({
          original: data.original,
          result: data.result,
          success: true
        });
        
        // Update file item status
        const fileItem = metaFileList.querySelector(`[data-path="${filePath}"]`);
        if (fileItem) {
          fileItem.classList.add("success");
          fileItem.innerHTML = `
            <span class="file-item-name">${data.result}</span>
            <span class="file-item-meta">OK</span>
          `;
        }
      } else {
        metaResultsData.push({
          original: fileName,
          result: data.error || "Error desconocido",
          success: false
        });
        
        const fileItem = metaFileList.querySelector(`[data-path="${filePath}"]`);
        if (fileItem) {
          fileItem.classList.add("error");
        }
      }
    } catch (e) {
      metaResultsData.push({
        original: fileName,
        result: e.message,
        success: false
      });
    }
    
    processed++;
  }
  
  // Show final results
  metaProgressText.textContent = "Completado";
  metaProgressPercent.textContent = "100%";
  metaProgressFill.style.width = "100%";
  metaStatus.textContent = `Identificados ${metaResultsData.filter(r => r.success).length} de ${total} archivos`;
  
  // Show results panel
  renderMetaResults();
  
  // Reset buttons after delay
  setTimeout(() => {
    metaProgress.classList.add("hidden");
    metaIdentifyAll.classList.remove("hidden");
    if (metaCancel) metaCancel.classList.add("hidden");
    metaProcessId = null;
  }, 2000);
});

// Cancel identification
if (metaCancel) metaCancel.addEventListener("click", async () => {
  if (!metaProcessId) return;
  
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: metaProcessId })
    });
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});

// Render results
function renderMetaResults() {
  if (!metaResults || !metaResultsList) return;
  metaResults.classList.remove("hidden");
  metaResultsList.innerHTML = "";
  
  metaResultsData.forEach(item => {
    const resultItem = document.createElement("div");
    resultItem.className = `meta-result-item ${item.success ? "success" : "error"}`;
    resultItem.innerHTML = `
      <span class="meta-result-original">${item.original}</span>
      <span class="meta-result-result">→ ${item.result}</span>
    `;
    metaResultsList.appendChild(resultItem);
  });
}

// Update filename preview
function updateMetaPreview() {
  if (!metaNewFilename || !metaPreviewName) return;
  const newName = metaNewFilename.value || "Nuevo nombre";
  const ext = currentMetaFile ? "." + currentMetaFile.split(".").pop() : "";
  metaPreviewName.textContent = newName + ext;
}

// Listen to input changes for preview
if (metaNewFilename) {
  metaNewFilename.addEventListener("input", updateMetaPreview);
}

// Cancel editing
if (metaCancelEdit) metaCancelEdit.addEventListener("click", () => {
  if (metaEditor) metaEditor.classList.add("hidden");
  currentMetaFile = null;
  currentMetaData = null;
  if (metaStatus) metaStatus.textContent = "Edicion cancelada";
});

// Save metadata changes
if (metaSave) metaSave.addEventListener("click", async () => {
  if (!metaStatus || !metaNewFilename || !metaTitle || !metaArtist || !metaAlbum || !metaYear || !metaGenre || !metaTrack) return;

  if (!currentMetaFile) {
    metaStatus.textContent = "No hay archivo seleccionado";
    return;
  }
  
  const newName = metaNewFilename.value.trim();
  if (!newName) {
    metaStatus.textContent = "El nombre no puede estar vacio";
    return;
  }
  
  metaStatus.textContent = "Guardando cambios...";
  metaSave.disabled = true;
  
  try {
    // Rename file if name changed
    const oldName = currentMetaFile.split("/").pop().replace(/\.[^.]+$/, "");
    if (newName !== oldName) {
      const renameRes = await fetch("/api/metadata/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: currentMetaFile, newName })
      });
      const renameData = await renameRes.json();
      
      if (!renameData.ok) {
        metaStatus.textContent = `Error al renombrar: ${renameData.error}`;
        metaSave.disabled = false;
        return;
      }
      
      currentMetaFile = renameData.newPath;
    }
    
    // Write metadata
    const metadata = {
      title: metaTitle.value,
      artist: metaArtist.value,
      album: metaAlbum.value,
      year: metaYear.value ? parseInt(metaYear.value) : null,
      genre: metaGenre.value,
      track: metaTrack.value ? parseInt(metaTrack.value) : null
    };
    
    const writeRes = await fetch("/api/metadata/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: currentMetaFile, metadata })
    });
    const writeData = await writeRes.json();
    
    if (!writeData.ok) {
      metaStatus.textContent = `Error al guardar metadata: ${writeData.error}`;
    } else {
      metaStatus.textContent = "Cambios guardados exitosamente";
      if (metaEditor) metaEditor.classList.add("hidden");
      // Reload file list
      if (metaLoad) metaLoad.click();
    }
  } catch (e) {
    metaStatus.textContent = `Error: ${e.message}`;
  }
  
  metaSave.disabled = false;
});

// ==================== BPM EDITOR FUNCTIONALITY ====================

const bpmBrowse = document.getElementById("bpm-browse");
const bpmInput = document.getElementById("bpm-input");
const bpmSeconds = document.getElementById("bpm-seconds");
const bpmSecondsValue = document.getElementById("bpm-seconds-value");
const bpmAnalyze = document.getElementById("bpm-analyze");
const bpmCancel = document.getElementById("bpm-cancel");
const bpmProgress = document.getElementById("bpm-progress");
const bpmProgressText = document.getElementById("bpm-progress-text");
const bpmProgressPercent = document.getElementById("bpm-progress-percent");
const bpmProgressFill = document.getElementById("bpm-progress-fill");
const bpmCurrentFile = document.getElementById("bpm-current-file");
const bpmTableBody = document.getElementById("bpm-table-body");
const bpmStatus = document.getElementById("bpm-status");

let bpmProcessId = null;
let bpmResults = [];

// Slider value display
bpmSeconds.addEventListener("input", () => {
  bpmSecondsValue.textContent = `${bpmSeconds.value}s`;
});

// Analyze BPM
bpmAnalyze.addEventListener("click", async () => {
  const dir = bpmInput.value.trim();
  if (!dir) {
    bpmStatus.textContent = "Selecciona una carpeta primero.";
    return;
  }
  
  bpmProcessId = `bpm-${Date.now()}`;
  
  // Show progress
  bpmProgress.classList.remove("hidden");
  bpmAnalyze.classList.add("hidden");
  bpmCancel.classList.remove("hidden");
  bpmStatus.textContent = "Analizando BPM...";
  bpmResults = [];
  
  // Get file list first
  try {
    const listRes = await fetch(`/api/metadata/list?dir=${encodeURIComponent(dir)}&recursive=false`);
    const listData = await listRes.json();
    
    if (!listData.ok || listData.files.length === 0) {
      bpmStatus.textContent = listData.error || "No se encontraron archivos";
      resetBpmButtons();
      return;
    }
    
    // Send files for analysis
    const analysisSeconds = parseInt(bpmSeconds.value);
    
    const res = await fetch("/api/bpm/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: listData.files,
        analysisSeconds,
        processId: bpmProcessId
      })
    });
    
    if (!res.ok) {
      const data = await res.json();
      bpmStatus.textContent = `Error: ${data.error}`;
      resetBpmButtons();
      return;
    }
    
    // Handle streaming response
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress') {
              bpmProgressText.textContent = `Analizando archivo ${data.processed} de ${data.total}`;
              bpmProgressPercent.textContent = `${data.percentage}%`;
              bpmProgressFill.style.width = `${data.percentage}%`;
              bpmCurrentFile.textContent = data.current || "";
              bpmStatus.textContent = `(${data.processed}/${data.total}) ${data.current}`;
            } else if (data.type === 'complete') {
              bpmStatus.textContent = data.success ? "Analisis completado." : "Proceso cancelado o error.";
              bpmProgressText.textContent = data.success ? "Completado" : "Cancelado";
              bpmProgressFill.style.width = data.success ? "100%" : "0%";
              if (data.error) {
                bpmStatus.textContent += ` — ${data.error}`;
              }
            } else if (data.type === 'result') {
              renderBpmResults(data.results || []);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
    
  } catch (e) {
    bpmStatus.textContent = `Error: ${e.message}`;
  }
  
  resetBpmButtons();
});

// Cancel BPM analysis
bpmCancel.addEventListener("click", async () => {
  if (!bpmProcessId) return;
  
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: bpmProcessId })
    });
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});

// Reset buttons after analysis
function resetBpmButtons() {
  setTimeout(() => {
    bpmProgress.classList.add("hidden");
    bpmAnalyze.classList.remove("hidden");
    bpmCancel.classList.add("hidden");
    bpmProcessId = null;
  }, 2000);
}

function renderBpmResults(results) {
  if (!bpmTableBody) return;
  bpmTableBody.innerHTML = "";
  for (const r of results) {
    const row = document.createElement("tr");
    const name = r.file ? r.file.split(/[\\/]/).pop() : "—";
    const cells = [
      { text: name, title: r.file || "" },
      { text: r.ok ? String(r.bpm) : "—" },
      { text: r.ok ? r.key : "—" },
      { text: r.ok ? "" : (r.error || "error"), error: !r.ok }
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      if (c.title) td.title = c.title;
      if (c.error) {
        const span = document.createElement("span");
        span.className = "error-text";
        span.textContent = c.text;
        td.appendChild(span);
      } else {
        td.textContent = c.text;
      }
      row.appendChild(td);
    }
    bpmTableBody.appendChild(row);
  }
}

// ==================== STEM SEPARATOR ====================

const stemsInputDir = document.getElementById("stems-input-dir");
const stemsInputBrowse = document.getElementById("stems-input-browse");
const stemsRun = document.getElementById("stems-run");
const stemsCancel = document.getElementById("stems-cancel");
const stemsProgress = document.getElementById("stems-progress");
const stemsProgressText = document.getElementById("stems-progress-text");
const stemsProgressPercent = document.getElementById("stems-progress-percent");
const stemsProgressFill = document.getElementById("stems-progress-fill");
const stemsCurrentFile = document.getElementById("stems-current-file");
const stemsTableBody = document.getElementById("stems-table-body");
const stemsStatus = document.getElementById("stems-status");
const stemsFormat = document.getElementById("stems-format");

let stemsProcessId = null;

stemsInputBrowse.addEventListener("click", async () => {
  const dir = Runtime.isElectron
    ? await window.electronAPI.openDirectory()
    : null;
  if (dir) stemsInputDir.value = dir;
});

stemsRun.addEventListener("click", async () => {
  const inputDir = stemsInputDir.value.trim();
  if (!inputDir) {
    stemsStatus.textContent = "Selecciona una carpeta primero.";
    return;
  }

  const stemsMode = document.querySelector('input[name="stems-mode"]:checked')?.value || "both";
  const format = stemsFormat.value || "wav";
  const outputDir = (AppState.settings.defaultOutputDir || "output").trim();

  stemsProcessId = `stems-${Date.now()}`;
  stemsProgress.classList.remove("hidden");
  stemsRun.classList.add("hidden");
  stemsCancel.classList.remove("hidden");
  stemsStatus.textContent = "Separando stems...";

  try {
    const res = await fetch("/api/stem-separate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputDir,
        outputDir,
        stems: stemsMode,
        format,
        processId: stemsProcessId
      })
    });

    if (!res.ok) {
      const data = await res.json();
      stemsStatus.textContent = `Error: ${data.error}`;
      resetStemsButtons();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "progress") {
            stemsProgressText.textContent = `Procesando ${data.processed} de ${data.total}`;
            stemsProgressPercent.textContent = `${data.percentage}%`;
            stemsProgressFill.style.width = `${data.percentage}%`;
            stemsCurrentFile.textContent = data.current || "";
            stemsStatus.textContent = `(${data.processed}/${data.total}) ${data.current}`;
          } else if (data.type === "complete") {
            stemsStatus.textContent = data.success ? "Separación completada." : "Proceso cancelado o error.";
            stemsProgressText.textContent = data.success ? "Completado" : "Cancelado";
            stemsProgressFill.style.width = data.success ? "100%" : "0%";
            if (data.error) stemsStatus.textContent += ` — ${data.error}`;
          } else if (data.type === "result") {
            renderStemsResults(data.results || []);
          }
        } catch (e) {
          console.error("Error parsing SSE data:", e);
        }
      }
    }
  } catch (e) {
    stemsStatus.textContent = `Error: ${e.message}`;
  }

  resetStemsButtons();
});

stemsCancel.addEventListener("click", async () => {
  if (!stemsProcessId) return;
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: stemsProcessId })
    });
  } catch (e) {
    console.error("Error cancelling:", e);
  }
});

function resetStemsButtons() {
  setTimeout(() => {
    stemsProgress.classList.add("hidden");
    stemsRun.classList.remove("hidden");
    stemsCancel.classList.add("hidden");
    stemsProcessId = null;
  }, 2000);
}

function renderStemsResults(results) {
  if (!stemsTableBody) return;
  stemsTableBody.innerHTML = "";
  for (const r of results) {
    const row = document.createElement("tr");
    const name = r.file ? r.file.split(/[\\/]/).pop() : "—";

    const nameTd = document.createElement("td");
    nameTd.textContent = name;
    nameTd.title = r.file || "";

    const filesTd = document.createElement("td");
    if (r.ok && r.files && r.files.length > 0) {
      filesTd.textContent = r.files.map(f => f.split(/[\\/]/).pop()).join(", ");
    } else {
      filesTd.textContent = "—";
    }

    const statusTd = document.createElement("td");
    if (!r.ok) {
      const span = document.createElement("span");
      span.className = "error-text";
      span.textContent = r.error || "error";
      statusTd.appendChild(span);
    } else {
      statusTd.textContent = "OK";
    }

    row.appendChild(nameTd);
    row.appendChild(filesTd);
    row.appendChild(statusTd);
    stemsTableBody.appendChild(row);
  }
}

// ==================== SETTINGS FUNCTIONALITY ====================

function applySettingsToUi(settings) {
  document.getElementById("cfg-spotify-id").value = settings.spotifyClientId || "";
  document.getElementById("cfg-spotify-secret").value = settings.spotifyClientSecret || "";
  document.getElementById("cfg-lastfm-key").value = settings.lastfmApiKey || "";
  document.getElementById("cfg-language").value = settings.language || "es";

  const cfgDefaultOutput = document.getElementById("cfg-output-dir");
  AppState.settings.defaultOutputDir = (settings.defaultOutputDir || "output").trim() || "output";
  if (cfgDefaultOutput) {
    cfgDefaultOutput.value = AppState.settings.defaultOutputDir;
  }
}

async function fetchFfmpegReadyOnce() {
  try {
    if (window.electronAPI?.checkFFmpeg) {
      return await window.electronAPI.checkFFmpeg();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("/api/ffmpeg-status", { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    return data.installed === true;
  } catch (error) {
    console.log("FFmpeg status check:", error.message);
    return null;
  }
}

async function initAppState() {
  try {
    const [settingsRes, ffmpegReady] = await Promise.all([
      fetch("/api/settings"),
      fetchFfmpegReadyOnce()
    ]);

    const settingsData = await settingsRes.json();
    if (settingsData.ok) {
      applySettingsToUi(settingsData.settings);
    }

    setFfmpegReady(ffmpegReady);
  } catch (error) {
    console.error("Error initializing app state:", error);
    setFfmpegReady(null);
  }
}

// Save settings
const cfgSave = document.getElementById("cfg-save");
const cfgDefaultOutput = document.getElementById("cfg-output-dir");
const cfgDefaultOutputBrowse = document.getElementById("cfg-output-dir-browse");
const cfgLastfmKey = document.getElementById("cfg-lastfm-key");
const cfgLastfmToggle = document.getElementById("cfg-lastfm-toggle");
let cfgStatusTimer = null;

if (cfgLastfmToggle && cfgLastfmKey) cfgLastfmToggle.addEventListener("click", () => {
  const isHidden = cfgLastfmKey.type === "password";
  cfgLastfmKey.type = isHidden ? "text" : "password";
  cfgLastfmToggle.innerHTML = isHidden
    ? '<span class="iconify" data-icon="mdi:eye-off-outline"></span>'
    : '<span class="iconify" data-icon="mdi:eye-outline"></span>';
});

if (cfgDefaultOutputBrowse) cfgDefaultOutputBrowse.addEventListener("click", async () => {
  if (!cfgDefaultOutput) return;
  const selected = await selectDirectory("Selecciona carpeta de salida por defecto");
  if (selected) {
    cfgDefaultOutput.value = selected;
    cfgDefaultOutput.dataset.pathLabel = displayPathLabel(selected);
  }
});

cfgSave.addEventListener("click", async () => {
  const status = document.getElementById("cfg-status");
  const settings = {
    spotifyClientId: document.getElementById("cfg-spotify-id").value.trim(),
    spotifyClientSecret: document.getElementById("cfg-spotify-secret").value.trim(),
    lastfmApiKey: document.getElementById("cfg-lastfm-key").value.trim(),
    language: document.getElementById("cfg-language").value,
    defaultOutputDir: (cfgDefaultOutput?.value || "").trim() || "output"
  };
  
  status.textContent = "Guardando...";
  
  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    
    if (data.ok) {
      status.textContent = "Configuracion guardada correctamente.";
      status.style.color = "var(--accent-2)";
      showToast("Configuracion guardada correctamente.", "success", 2500);
      
      // Apply language change
      applyLanguage(settings.language);
      AppState.settings.defaultOutputDir = settings.defaultOutputDir;
      if (cfgStatusTimer) clearTimeout(cfgStatusTimer);
      cfgStatusTimer = setTimeout(() => {
        status.textContent = "";
      }, 3000);
    } else {
      status.textContent = `Error: ${data.error}`;
      status.style.color = "var(--accent)";
      if (cfgStatusTimer) clearTimeout(cfgStatusTimer);
    }
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    status.style.color = "var(--accent)";
    if (cfgStatusTimer) clearTimeout(cfgStatusTimer);
  }
});

// FFmpeg check button
const ffmpegCheck = document.getElementById("ffmpeg-check");
ffmpegCheck.addEventListener("click", async () => {
  const statusText = document.getElementById("ffmpeg-status-text");
  statusText.textContent = "Verificando...";

  const isInstalled = await fetchFfmpegReadyOnce();
  setFfmpegReady(isInstalled);
});

// FFmpeg install button
const ffmpegInstall = document.getElementById("ffmpeg-install");
ffmpegInstall.addEventListener("click", async () => {
  const statusText = document.getElementById("ffmpeg-status-text");
  statusText.textContent = "Instalando...";
  statusText.className = "ffmpeg-value";
  
  if (window.electronAPI && window.electronAPI.installFFmpeg) {
    // Use Electron API for installation
    const result = await window.electronAPI.installFFmpeg();
    statusText.textContent = result.message;
    statusText.className = result.success ? "ffmpeg-value ok" : "ffmpeg-value error";
    setFfmpegReady(result.success ? true : false);
  } else {
    statusText.textContent = "Instalacion solo disponible en app de escritorio";
    statusText.className = "ffmpeg-value error";
  }
});

function applyLanguage(lang) {
  const t = translations[lang] || translations.es;

  // Select each nav button by its data-tab attribute — never by array index
  const tabLabels = ["classifier", "sets", "converter", "metadata", "bpm", "style", "stems", "settings"];
  for (const key of tabLabels) {
    const btn = document.querySelector(`.nav-btn[data-tab='${key}']`);
    if (btn && t[key]) btn.textContent = t[key];
  }

  // Update hero
  document.querySelector(".hero h1").textContent = t.panelTitle;
  document.querySelector(".hero p").textContent = t.panelSubtitle;

  // Update sidebar note
  document.querySelector(".sidebar-note").textContent = t.sidebarNote;

  // Save language preference
  localStorage.setItem("musickind-lang", lang);
}

function onFfmpegStateChangeRender(ready) {
  const statusText = document.getElementById("ffmpeg-status-text");
  if (statusText) {
    if (ready === true) {
      statusText.textContent = "Instalado";
      statusText.className = "ffmpeg-value ok";
    } else if (ready === false) {
      statusText.textContent = "No instalado";
      statusText.className = "ffmpeg-value error";
    } else {
      statusText.textContent = "Desconocido";
      statusText.className = "ffmpeg-value";
    }
  }

  FFMPEG_WARNING_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (ready === false) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
}

// Go to settings handler for warning buttons
function setupFFmpegWarningButtons() {
  const goToSettingsBtns = document.querySelectorAll("[id$='-goto-settings']");
  goToSettingsBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // Switch to settings tab
      navButtons.forEach(b => b.classList.remove("active"));
      Object.values(panels).forEach(panel => panel.classList.add("hidden"));
      document.getElementById("tab-settings").classList.remove("hidden");
      document.querySelector("[data-tab='settings']").classList.add("active");
    });
  });
}

// Toast notification system
function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close">×</button>
  `;
  
  container.appendChild(toast);
  
  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => hideToast(toast));
  
  if (duration > 0) {
    setTimeout(() => hideToast(toast), duration);
  }
  
  return toast;
}

function hideToast(toast) {
  if (!toast) return;
  toast.classList.add("hiding");
  setTimeout(() => toast.remove(), 300);
}

// Apply saved language
const savedLang = localStorage.getItem("musickind-lang");
if (savedLang) {
  document.getElementById("cfg-language").value = savedLang;
  applyLanguage(savedLang);
}

onFfmpegStateChange(onFfmpegStateChangeRender);
loadGenres();
initAppState();
setupFFmpegWarningButtons();
