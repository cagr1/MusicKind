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
    settings: "Settings",
    dashboard: "Dashboard",
    sidebarNote: "Control panel for DJs"
  }
};

// File dialog functionality
async function selectDirectory(title) {
  try {
    // For Electron environment - use native dialog
    if (window.electronAPI && window.electronAPI.openDirectory) {
      const result = await window.electronAPI.openDirectory(title);
      return result;
    }
    
    // For web environment - use File System Access API
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        // Get the path from the handle - we'll use a workaround to get the path
        // since the API doesn't directly expose the path
        // We store the handle and use it later for file access
        return dirHandle;
      } catch (err) {
        if (err.name === 'AbortError') {
          return null; // User cancelled
        }
        throw err;
      }
    }
    
    // Fallback for browsers without File System Access API
    showToast("Tu navegador no soporta selección de carpetas. Usa la app de escritorio o arrastra archivos aquí.", "error");
    return null;
  } catch (error) {
    console.error('Error selecting directory:', error);
    showToast("Error al seleccionar carpeta: " + error.message, "error");
    return null;
  }
}

// Check if we have a valid directory handle (for web File System Access API)
function isValidDirectoryHandle(handle) {
  return handle && typeof handle === 'object' && 'kind' in handle && handle.kind === 'directory';
}

// Resolve a directory handle to actual files (for File System Access API)
async function getFilesFromHandle(dirHandle) {
  const files = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      // Get file to get its path
      const file = await entry.getFile();
      file.handle = entry; // Store the handle reference
      files.push(file);
    }
  }
  return files;
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
    // For Electron environment - use native dialog
    if (window.electronAPI && window.electronAPI.openFiles) {
      const result = await window.electronAPI.openFiles(title, multiple);
      return result;
    }
    
    // Fallback: use HTML file input
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = multiple;
      input.accept = ".mp3,.wav,.aiff,.aif,.flac,.m4a";
      
      input.onchange = (e) => {
        const files = Array.from(e.target.files).map(f => f.path || f.name);
        resolve(multiple ? files : files[0] || null);
      };
      
      input.click();
    });
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

// Check FFmpeg status on startup
async function checkFFmpegStatus() {
  if (!window.electronAPI || !window.electronAPI.checkFFmpeg) {
    return; // Not running in Electron
  }
  
  try {
    const isInstalled = await window.electronAPI.checkFFmpeg();
    
    if (!isInstalled) {
      const statusEl = document.getElementById('cls-status') || document.getElementById('set-status') || document.getElementById('conv-status');
      if (statusEl) {
        const install = confirm('FFmpeg no está instalado. ¿Deseas instalarlo ahora?\n\nFFmpeg es necesario para el análisis y conversión de audio.');
        if (install) {
          statusEl.textContent = 'Instalando FFmpeg...';
          const result = await window.electronAPI.installFFmpeg();
          statusEl.textContent = result.message;
          if (result.success) {
            alert('FFmpeg instalado correctamente. La aplicación está lista para usar.');
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking FFmpeg:', error);
  }
}

// Browse button handlers
document.getElementById('cls-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona carpeta a clasificar');
  if (path) {
    document.getElementById('cls-input').value = path;
  }
});

document.getElementById('set-base-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona carpeta base DJ');
  if (path) {
    document.getElementById('set-base').value = path;
  }
});

document.getElementById('set-pack-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona pack nuevo');
  if (path) {
    document.getElementById('set-pack').value = path;
  }
});

document.getElementById('set-output-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona carpeta de salida');
  if (path) {
    document.getElementById('set-output').value = path;
  }
});

// Converter drop zones
const convInputDrop = document.getElementById("conv-input-drop");
const convOutputDrop = document.getElementById("conv-output-drop");
const convInput = document.getElementById("conv-input");
const convOutput = document.getElementById("conv-output");

// Setup drag & drop for converter input
setupDragDrop(convInputDrop, async (files) => {
  if (files.length === 1) {
    convInput.value = files[0];
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
    convInput.classList.remove("hidden");
    convInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  }
});

// Setup drag & drop for converter output
setupDragDrop(convOutputDrop, async (files) => {
  if (files.length === 1) {
    convOutput.value = files[0];
    convOutput.classList.remove("hidden");
    convOutputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  } else {
    showToast("Selecciona una carpeta", "info");
  }
});

convOutputDrop.addEventListener("click", async () => {
  const path = await selectDirectory("Selecciona carpeta de salida");
  if (path) {
    convOutput.value = path;
    convOutput.classList.remove("hidden");
    convOutputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  }
});

// ==================== BPM EDITOR DROP ZONE ====================

const bpmInputDrop = document.getElementById("bpm-input-drop");
const bpmInputPath = document.getElementById("bpm-input");

setupDragDrop(bpmInputDrop, async (files) => {
  if (files.length === 1) {
    bpmInputPath.value = files[0];
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
    bpmInputPath.classList.remove("hidden");
    bpmInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  }
});

// ==================== METADATA EDITOR DROP ZONE ====================

const metaInputDrop = document.getElementById("meta-input-drop");
const metaInputPath = document.getElementById("meta-input");

setupDragDrop(metaInputDrop, async (files) => {
  if (files.length === 1) {
    metaInputPath.value = files[0];
    metaInputPath.classList.remove("hidden");
    metaInputDrop.querySelector(".conv-drop-content").classList.add("hidden");
  } else {
    showToast("Selecciona una carpeta", "info");
  }
});

metaInputDrop.addEventListener("click", async () => {
  const path = await selectDirectory("Selecciona carpeta con archivos de audio");
  if (path) {
    metaInputPath.value = path;
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
const clsCancel = document.getElementById("cls-cancel");
let currentProcessId = null;

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
  clsCancel.classList.remove("hidden");

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
    clsCancel.classList.add("hidden");
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
          } else if (data.type === 'complete') {
            status.textContent = data.success ? "Clasificacion completada." : "Proceso cancelado o error.";
            progressText.textContent = data.success ? "Completado" : "Cancelado";
            progressFill.style.width = data.success ? "100%" : "0%";
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
    clsCancel.classList.add("hidden");
    currentProcessId = null;
  }, 2000);
});

clsCancel.addEventListener("click", async () => {
  if (!currentProcessId) return;
  
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: currentProcessId })
    });
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});

const analysisSlider = document.getElementById("analysis-seconds");
const analysisValue = document.getElementById("analysis-value");
analysisSlider.addEventListener("input", () => {
  analysisValue.textContent = `${analysisSlider.value}s`;
});

const setCountCheck = document.getElementById("set-count-check");
setCountCheck.addEventListener("click", async () => {
  const baseDj = document.getElementById("set-base").value.trim();
  const status = document.getElementById("set-counts");
  status.textContent = "Revisando...";
  const res = await fetch("/api/set-counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseDj })
  });
  const data = await res.json();
  if (!data.ok) {
    status.textContent = `Error: ${data.error}`;
    return;
  }
  const { warmup, peak, closing, total } = data.counts;
  const inRange = total >= 15 && total <= 25;
  status.textContent = `Warmup ${warmup} | Peak ${peak} | Closing ${closing} | Total ${total} ${inRange ? "(OK)" : "(Fuera de rango)"}`;
});

const setRun = document.getElementById("set-run");
const setCancel = document.getElementById("set-cancel");
let setProcessId = null;

setRun.addEventListener("click", async () => {
  const baseDj = document.getElementById("set-base").value.trim();
  const newPack = document.getElementById("set-pack").value.trim();
  const outputDir = document.getElementById("set-output").value.trim();
  const mode = document.querySelector("input[name='analysis-mode']:checked").value;
  const analysisSeconds = mode === "seconds" ? Number(analysisSlider.value) : null;
  const tempConvert = document.getElementById("temp-convert").checked;
  const tempFormat = document.getElementById("temp-format").value;
  const tempBitrate = document.getElementById("temp-bitrate").value;

  const status = document.getElementById("set-status");
  const log = document.getElementById("set-log");
  const spinner = document.getElementById("set-spinner");

  // Progress elements
  const progressContainer = document.getElementById("set-progress-container");
  const progressText = document.getElementById("set-progress-text");
  const progressPercent = document.getElementById("set-progress-percent");
  const progressFill = document.getElementById("set-progress-fill");
  const currentFile = document.getElementById("set-current-file");

  if (tempConvert && !tempFormat) {
    status.textContent = "Selecciona un formato para la conversion temporal.";
    return;
  }

  // Generate unique process ID
  setProcessId = `set-${Date.now()}`;

  spinner.classList.add("active");
  status.textContent = "Analizando audio...";
  log.textContent = "";

  // Show progress bar and cancel button
  progressContainer.classList.remove("hidden");
  progressText.textContent = "Analizando audio...";
  progressPercent.textContent = "0%";
  progressFill.style.width = "0%";
  currentFile.textContent = "";

  setRun.classList.add("hidden");
  setCancel.classList.remove("hidden");

  const res = await fetch("/api/set-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseDj,
      newPack,
      outputDir,
      analysisSeconds,
      tempFormat: tempConvert ? tempFormat : "",
      tempBitrate: tempConvert && tempFormat === "mp3" ? Number(tempBitrate) : null,
      processId: setProcessId
    })
  });

  if (!res.ok) {
    const data = await res.json();
    spinner.classList.remove("active");
    status.textContent = `Error: ${data.error}`;
    log.textContent = data.error || "";
    progressContainer.classList.add("hidden");
    setRun.classList.remove("hidden");
    setCancel.classList.add("hidden");
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
            progressText.textContent = `Analizando archivo ${data.processed} de ${data.total}`;
            progressPercent.textContent = `${data.percentage}%`;
            progressFill.style.width = `${data.percentage}%`;
            currentFile.textContent = data.current || "";
            status.textContent = data.message;
          } else if (data.type === 'complete') {
            spinner.classList.remove("active");
            status.textContent = data.success ? "Analisis completado." : "Proceso cancelado o error.";
            progressText.textContent = data.success ? "Completado" : "Cancelado";
            progressFill.style.width = data.success ? "100%" : "0%";
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
    setRun.classList.remove("hidden");
    setCancel.classList.add("hidden");
    setProcessId = null;
  }, 2000);
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

const convRun = document.getElementById("conv-run");
const convCancel = document.getElementById("conv-cancel");
let convProcessId = null;

// Converter drop zones - already declared above at line 130
const convInputPath = document.getElementById("conv-input");
const convOutputPath = document.getElementById("conv-output");

// Ensure we have the correct elements (if they exist from new HTML structure)
const convInputDropZone = document.getElementById("conv-input-drop");
const convOutputDropZone = document.getElementById("conv-output-drop");
convRun.addEventListener("click", async () => {
  const inputPath = convInputPath.value.trim();
  const outputPath = convOutputPath.value.trim();
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

let metaFiles = [];
let metaProcessId = null;
let metaResultsData = [];

// Load files from selected folder
metaLoad.addEventListener("click", async () => {
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
metaIdentifyAll.addEventListener("click", async () => {
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
    metaCancel.classList.add("hidden");
    metaProcessId = null;
  }, 2000);
});

// Cancel identification
metaCancel.addEventListener("click", async () => {
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
  const newName = metaNewFilename.value || "Nuevo nombre";
  const ext = currentMetaFile ? "." + currentMetaFile.split(".").pop() : "";
  metaPreviewName.textContent = newName + ext;
}

// Listen to input changes for preview
metaNewFilename.addEventListener("input", updateMetaPreview);

// Cancel editing
metaCancelEdit.addEventListener("click", () => {
  metaEditor.classList.add("hidden");
  currentMetaFile = null;
  currentMetaData = null;
  metaStatus.textContent = "Edicion cancelada";
});

// Save metadata changes
metaSave.addEventListener("click", async () => {
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
      metaEditor.classList.add("hidden");
      // Reload file list
      metaLoad.click();
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
            } else if (data.type === 'result') {
              bpmResults.push(data);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
    
    // Get final results
    const finalRes = await fetch("/api/bpm/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: listData.files,
        analysisSeconds,
        processId: bpmProcessId
      })
    });
    
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

// ==================== SETTINGS FUNCTIONALITY ====================

// Load settings on startup
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.ok) {
      const settings = data.settings;
      document.getElementById("cfg-spotify-id").value = settings.spotifyClientId || "";
      document.getElementById("cfg-spotify-secret").value = settings.spotifyClientSecret || "";
      document.getElementById("cfg-lastfm-key").value = settings.lastfmApiKey || "";
      document.getElementById("cfg-language").value = settings.language || "es";
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
  
  // Load FFmpeg status after settings
  initFFmpegStatus();
}

// Save settings
const cfgSave = document.getElementById("cfg-save");
cfgSave.addEventListener("click", async () => {
  const status = document.getElementById("cfg-status");
  const settings = {
    spotifyClientId: document.getElementById("cfg-spotify-id").value.trim(),
    spotifyClientSecret: document.getElementById("cfg-spotify-secret").value.trim(),
    lastfmApiKey: document.getElementById("cfg-lastfm-key").value.trim(),
    language: document.getElementById("cfg-language").value
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
      
      // Apply language change
      applyLanguage(settings.language);
    } else {
      status.textContent = `Error: ${data.error}`;
      status.style.color = "var(--accent)";
    }
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    status.style.color = "var(--accent)";
  }
});

// FFmpeg check button
const ffmpegCheck = document.getElementById("ffmpeg-check");
ffmpegCheck.addEventListener("click", async () => {
  const statusText = document.getElementById("ffmpeg-status-text");
  statusText.textContent = "Verificando...";
  
  let isInstalled = false;
  
  // Try Electron API first
  if (window.electronAPI && window.electronAPI.checkFFmpeg) {
    isInstalled = await window.electronAPI.checkFFmpeg();
  } else {
    // Fallback to server API
    try {
      const res = await fetch("/api/ffmpeg-status");
      const data = await res.json();
      isInstalled = data.installed;
    } catch (e) {
      console.error("Error checking FFmpeg:", e);
    }
  }
  
  if (isInstalled) {
    statusText.textContent = "Instalado";
    statusText.className = "ffmpeg-value ok";
  } else {
    statusText.textContent = "No instalado";
    statusText.className = "ffmpeg-value error";
  }
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
  } else {
    statusText.textContent = "Instalacion solo disponible en app de escritorio";
    statusText.className = "ffmpeg-value error";
  }
});

function applyLanguage(lang) {
  const t = translations[lang] || translations.es;
  
  // Update navigation (5 tabs now)
  const navBtns = document.querySelectorAll(".nav-btn");
  if (navBtns[0]) navBtns[0].textContent = t.classifier;
  if (navBtns[1]) navBtns[1].textContent = t.sets;
  if (navBtns[2]) navBtns[2].textContent = t.converter;
  if (navBtns[3]) navBtns[3].textContent = t.metadata;
  if (navBtns[4]) navBtns[4].textContent = t.bpm;
  if (navBtns[5]) navBtns[5].textContent = t.settings;
  
  // Update hero
  document.querySelector(".hero h1").textContent = t.panelTitle;
  document.querySelector(".hero p").textContent = t.panelSubtitle;
  
  // Update sidebar note
  document.querySelector(".sidebar-note").textContent = t.sidebarNote;
  
  // Save language preference
  localStorage.setItem("musickind-lang", lang);
}

// Initialize
loadGenres();
loadSettings();

// Check and display FFmpeg status on load
async function initFFmpegStatus() {
  const statusText = document.getElementById("ffmpeg-status-text");
  
  // Default: assume FFmpeg is installed (don't block UI)
  let isInstalled = true;
  
  try {
    // Add timeout to prevent indefinite loading
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch("/api/ffmpeg-status", { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (res.ok) {
      const data = await res.json();
      isInstalled = data.installed === true;
    }
  } catch (e) {
    console.log("FFmpeg status check:", e.message);
    // Keep isInstalled = true to not block UI
    // Default "Instalado" will show
  }
  
  // Update settings panel
  if (statusText) {
    if (isInstalled) {
      statusText.textContent = "Instalado";
      statusText.className = "ffmpeg-value ok";
    } else {
      statusText.textContent = "No instalado";
      statusText.className = "ffmpeg-value error";
    }
  }
  
  // Show/hide warnings based on FFmpeg status
  // Only show warnings if FFmpeg is confirmed NOT installed
  const warnings = ["cls-ffmpeg-warning", "set-ffmpeg-warning", "conv-ffmpeg-warning"];
  warnings.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (isInstalled) {
        el.classList.add("hidden");
      } else {
        el.classList.remove("hidden");
      }
    }
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

initFFmpegStatus();
setupFFmpegWarningButtons();
