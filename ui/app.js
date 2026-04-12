// File dialog functionality
async function selectDirectory(title) {
  try {
    // For Electron environment - use native dialog
    if (window.electronAPI && window.electronAPI.openDirectory) {
      const result = await window.electronAPI.openDirectory(title);
      return result;
    }
    
    // For web environment (development server) - show manual input prompt
    alert('Para seleccionar carpetas, ejecuta la aplicación como app de escritorio: npm run electron');
    const input = prompt(`Ingresa la ruta manualmente para: ${title}`);
    return input;
  } catch (error) {
    console.error('Error selecting directory:', error);
    return null;
  }
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

document.getElementById('conv-input-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona carpeta de entrada');
  if (path) {
    document.getElementById('conv-input').value = path;
  }
});

document.getElementById('conv-output-browse').addEventListener('click', async () => {
  const path = await selectDirectory('Selecciona carpeta de salida');
  if (path) {
    document.getElementById('conv-output').value = path;
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
  genres.forEach((genre, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span>${genre}</span>`;
    const remove = document.createElement("button");
    remove.textContent = "x";
    remove.addEventListener("click", () => {
      genres.splice(idx, 1);
      renderGenres();
    });
    chip.appendChild(remove);
    genresList.appendChild(chip);
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

convRun.addEventListener("click", async () => {
  const inputPath = document.getElementById("conv-input").value.trim();
  const outputPath = document.getElementById("conv-output").value.trim();
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

const metaBrowse = document.getElementById("meta-browse");
const metaInput = document.getElementById("meta-input");
const metaLoad = document.getElementById("meta-load");
const metaFileList = document.getElementById("meta-file-list");
const metaEditor = document.getElementById("meta-editor");
const metaFilename = document.getElementById("meta-filename");
const metaNewFilename = document.getElementById("meta-new-filename");
const metaTitle = document.getElementById("meta-title");
const metaArtist = document.getElementById("meta-artist");
const metaAlbum = document.getElementById("meta-album");
const metaYear = document.getElementById("meta-year");
const metaGenre = document.getElementById("meta-genre");
const metaTrack = document.getElementById("meta-track");
const metaPreviewName = document.getElementById("meta-preview-name");
const metaSave = document.getElementById("meta-save");
const metaCancelEdit = document.getElementById("meta-cancel-edit");
const metaStatus = document.getElementById("meta-status");

let currentMetaFile = null;
let currentMetaData = null;

// Browse for folder
metaBrowse.addEventListener("click", async () => {
  const path = await selectDirectory("Selecciona carpeta con archivos de audio");
  if (path) {
    metaInput.value = path;
  }
});

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
    
    metaStatus.textContent = `${data.files.length} archivos encontrados`;
    renderMetaFileList(data.files);
  } catch (e) {
    metaStatus.textContent = `Error: ${e.message}`;
    metaFileList.innerHTML = '<div class="empty-state">Error de conexion</div>';
  }
});

// Render file list
function renderMetaFileList(files) {
  metaFileList.innerHTML = "";
  
  files.forEach((filePath, index) => {
    const fileName = filePath.split("/").pop();
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    fileItem.innerHTML = `
      <span class="file-item-name">${fileName}</span>
      <span class="file-item-meta">${(filePath.split(".").pop()).toUpperCase()}</span>
      <button class="btn btn-small file-item-edit">Editar</button>
    `;
    
    fileItem.querySelector(".file-item-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      loadMetaFile(filePath);
    });
    
    fileItem.addEventListener("click", () => loadMetaFile(filePath));
    metaFileList.appendChild(fileItem);
  });
}

// Load a file for editing
async function loadMetaFile(filePath) {
  metaStatus.textContent = "Cargando metadata...";
  
  try {
    const res = await fetch(`/api/metadata?file=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    
    if (!data.ok) {
      metaStatus.textContent = `Error: ${data.error}`;
      return;
    }
    
    currentMetaFile = filePath;
    currentMetaData = data.metadata;
    
    // Populate form
    const fileName = filePath.split("/").pop();
    const baseName = fileName.replace(/\.[^.]+$/, "");
    metaFilename.textContent = fileName;
    metaNewFilename.value = baseName;
    metaTitle.value = data.metadata.title || "";
    metaArtist.value = data.metadata.artist || "";
    metaAlbum.value = data.metadata.album || "";
    metaYear.value = data.metadata.year || "";
    metaGenre.value = data.metadata.genre || "";
    metaTrack.value = data.metadata.track || "";
    
    // Show editor
    metaEditor.classList.remove("hidden");
    metaStatus.textContent = "Editando: " + fileName;
    
    updateMetaPreview();
  } catch (e) {
    metaStatus.textContent = `Error: ${e.message}`;
  }
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

// Browse for folder
bpmBrowse.addEventListener("click", async () => {
  const path = await selectDirectory("Selecciona carpeta con archivos de audio");
  if (path) {
    bpmInput.value = path;
  }
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

// Language translations
const translations = {
  es: {
    panelTitle: "Panel de Control",
    panelSubtitle: "Clasifica por genero, crea sets y convierte audio sin escribir comandos.",
    classifier: "Clasificador",
    sets: "Creador de Sets",
    converter: "Convertidor",
    settings: "Configuracion",
    sidebarNote: "Panel de control para DJs"
  },
  en: {
    panelTitle: "Dashboard",
    panelSubtitle: "Classify by genre, create sets and convert audio without writing commands.",
    classifier: "Classifier",
    sets: "Set Creator",
    converter: "Converter",
    settings: "Settings",
    sidebarNote: "Control panel for DJs"
  }
};

function applyLanguage(lang) {
  const t = translations[lang] || translations.es;
  
  // Update navigation
  const navBtns = document.querySelectorAll(".nav-btn");
  if (navBtns[0]) navBtns[0].textContent = t.classifier;
  if (navBtns[1]) navBtns[1].textContent = t.sets;
  if (navBtns[2]) navBtns[2].textContent = t.converter;
  if (navBtns[3]) navBtns[3].textContent = t.settings;
  
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
  if (!statusText) return;
  
  let isInstalled = false;
  
  if (window.electronAPI && window.electronAPI.checkFFmpeg) {
    isInstalled = await window.electronAPI.checkFFmpeg();
  } else {
    try {
      const res = await fetch("/api/ffmpeg-status");
      const data = await res.json();
      isInstalled = data.installed;
    } catch (e) {
      // Ignore
    }
  }
  
  if (isInstalled) {
    statusText.textContent = "Instalado";
    statusText.className = "ffmpeg-value ok";
    // Hide all warnings
    document.getElementById("cls-ffmpeg-warning")?.classList.add("hidden");
    document.getElementById("set-ffmpeg-warning")?.classList.add("hidden");
    document.getElementById("conv-ffmpeg-warning")?.classList.add("hidden");
  } else {
    statusText.textContent = "No instalado";
    statusText.className = "ffmpeg-value error";
    // Show warnings in tabs
    document.getElementById("cls-ffmpeg-warning")?.classList.remove("hidden");
    document.getElementById("set-ffmpeg-warning")?.classList.remove("hidden");
    document.getElementById("conv-ffmpeg-warning")?.classList.remove("hidden");
  }
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

// Apply saved language
const savedLang = localStorage.getItem("musickind-lang");
if (savedLang) {
  document.getElementById("cfg-language").value = savedLang;
  applyLanguage(savedLang);
}

initFFmpegStatus();
setupFFmpegWarningButtons();
