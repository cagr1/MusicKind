const translations = {
  es: window.MK_LANG_ES,
  en: window.MK_LANG_EN
};

function getCurrentLang() {
  return localStorage.getItem("musickind-lang") || "es";
}

function getTranslationsForLang(lang = getCurrentLang()) {
  return translations[lang] || translations.es;
}

function tr(key, vars = {}, lang = getCurrentLang()) {
  const t = getTranslationsForLang(lang);
  const template = t[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, token) => String(vars[token] ?? `{${token}}`));
}

const Runtime = {
  isElectron: Boolean(window.electronAPI?.openDirectory)
};

const AppState = {
  settings: {
    defaultOutputDir: "output"
  },
  ffmpegReady: null
};

const SETUP_DONE_KEY = "musickind-setup-done";
const PIP_PACKAGES = ["librosa", "numpy", "demucs"];

function completeSetup() {
  localStorage.setItem(SETUP_DONE_KEY, "1");
  const overlay = document.getElementById("setup-overlay");
  if (overlay) overlay.classList.add("hidden");
}

function showSetupComplete() {
  const completeMsg = document.getElementById("setup-complete-msg");
  const enterBtn = document.getElementById("setup-enter-btn");
  if (completeMsg) completeMsg.classList.remove("hidden");
  if (enterBtn && !enterBtn.dataset.bound) {
    enterBtn.dataset.bound = "1";
    enterBtn.addEventListener("click", () => completeSetup());
  }
}

async function checkFfmpegForSetup() {
  const setIcon = (id, icon) => {
    const el = document.querySelector(`#${id} .setup-check-icon`);
    if (el) el.textContent = icon;
  };
  const setStatus = (id, text) => {
    const el = document.getElementById(`${id}-status`);
    if (el) el.textContent = text;
  };

  setStatus("setup-check-ffmpeg", tr("setup.checking"));
  const ready = await fetchFfmpegReadyOnce();
  setFfmpegReady(ready);
  if (ready) {
    setIcon("setup-check-ffmpeg", "✅");
    setStatus("setup-check-ffmpeg", tr("setup.installed"));
  } else {
    setIcon("setup-check-ffmpeg", "⚠️");
    setStatus("setup-check-ffmpeg", tr("setup.ffmpegNote"));
  }
}

async function runSetupAssistant() {
  if (localStorage.getItem(SETUP_DONE_KEY) === "1") return;
  if (!Runtime.isElectron || !window.electronAPI?.checkPython) return;

  const overlay = document.getElementById("setup-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");

  const actions = document.getElementById("setup-actions");
  const installBtn = document.getElementById("setup-install-btn");
  const skipBtn = document.getElementById("setup-skip-btn");
  const pythonMissing = document.getElementById("setup-python-missing");
  const pythonLink = document.getElementById("setup-python-link");
  const setupLog = document.getElementById("setup-log");

  const setIcon = (id, icon) => {
    const el = document.querySelector(`#${id} .setup-check-icon`);
    if (el) el.textContent = icon;
  };
  const setStatus = (id, text) => {
    const el = document.getElementById(`${id}-status`);
    if (el) el.textContent = text;
  };
  const showActions = ({ showInstall = false, showSkip = false } = {}) => {
    if (actions) actions.classList.remove("hidden");
    if (installBtn) installBtn.classList.toggle("hidden", !showInstall);
    if (skipBtn) skipBtn.classList.toggle("hidden", !showSkip);
  };
  const bindSkip = () => {
    if (skipBtn && !skipBtn.dataset.bound) {
      skipBtn.dataset.bound = "1";
      skipBtn.addEventListener("click", () => completeSetup());
    }
  };

  const pythonResult = await window.electronAPI.checkPython();
  if (!pythonResult.found) {
    setIcon("setup-check-python", "❌");
    setStatus("setup-check-python", tr("setup.notFound"));
    if (pythonMissing) pythonMissing.classList.remove("hidden");
    if (pythonLink && !pythonLink.dataset.bound) {
      pythonLink.dataset.bound = "1";
      pythonLink.href = "https://www.python.org/downloads/";
      pythonLink.addEventListener("click", async (event) => {
        event.preventDefault();
        if (window.electronAPI?.openExternal) {
          await window.electronAPI.openExternal("https://www.python.org/downloads/");
        }
      });
    }
    showActions({ showSkip: true });
    bindSkip();
    return;
  }

  setIcon("setup-check-python", "✅");
  setStatus("setup-check-python", pythonResult.version || pythonResult.cmd || tr("setup.installed"));

  setStatus("setup-check-libs", tr("setup.checking"));
  const missingPkgs = [];
  for (const pkg of PIP_PACKAGES) {
    const result = await window.electronAPI.checkPipPackage(pkg);
    if (!result.installed) missingPkgs.push(pkg);
  }

  if (missingPkgs.length > 0) {
    setIcon("setup-check-libs", "⚠️");
    setStatus("setup-check-libs", tr("setup.missing", { count: missingPkgs.length }));
    showActions({ showInstall: true, showSkip: true });
    bindSkip();

    if (installBtn && !installBtn.dataset.bound) {
      installBtn.dataset.bound = "1";
      installBtn.addEventListener("click", async () => {
        installBtn.disabled = true;
        installBtn.textContent = tr("setup.installing");
        if (setupLog) {
          setupLog.classList.remove("hidden");
          setupLog.textContent = "";
        }
        setStatus("setup-check-libs", tr("setup.installing"));
        setIcon("setup-check-libs", "⏳");

        let unsubscribe = null;
        if (window.electronAPI?.onPipInstallProgress) {
          unsubscribe = window.electronAPI.onPipInstallProgress((data) => {
            if (!setupLog) return;
            setupLog.textContent += data;
            setupLog.scrollTop = setupLog.scrollHeight;
          });
        }

        const result = await window.electronAPI.installPipPackages(missingPkgs);
        if (typeof unsubscribe === "function") unsubscribe();

        installBtn.disabled = false;
        installBtn.textContent = tr("setup.installBtn");

        if (result.success) {
          setIcon("setup-check-libs", "✅");
          setStatus("setup-check-libs", tr("setup.installed"));
          if (actions) actions.classList.add("hidden");
          await checkFfmpegForSetup();
          showSetupComplete();
        } else {
          setIcon("setup-check-libs", "❌");
          setStatus("setup-check-libs", tr("setup.installFailed"));
          showActions({ showSkip: true });
          bindSkip();
        }
      });
    }
    return;
  }

  setIcon("setup-check-libs", "✅");
  setStatus("setup-check-libs", tr("setup.allInstalled"));
  await checkFfmpegForSetup();
  showSetupComplete();
}

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

    const manualPath = prompt(`${title}\n\n${tr("dialog.enterPath")}`);
    return manualPath && manualPath.trim() ? manualPath.trim() : null;
  } catch (error) {
    console.error('Error selecting directory:', error);
    showToast(tr("error.selectFolder", { error: error.message }), "error");
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
    const currentLang = getCurrentLang();
    updateLangDisplay(currentLang);
    
    langToggle.addEventListener("click", () => {
      const currentLang = getCurrentLang();
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
      
      const languageLabel = newLang === "es" ? "Español" : "English";
      showToast(tr("toast.languageChanged", { language: languageLabel }, newLang), "success");
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
      ? `${title}\n\n${tr("dialog.enterCommaPaths")}`
      : `${title}\n\n${tr("dialog.enterFilePath")}`;
    const raw = prompt(promptMessage);
    if (!raw || !raw.trim()) return multiple ? [] : null;

    const values = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return multiple ? values : values[0] || null;
  } catch (error) {
    console.error('Error selecting files:', error);
    showToast(tr("error.selectFiles"), "error");
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
  const path = await selectDirectory(tr("dialog.selectFolderToClassify"));
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
    showToast(tr("common.selectFolder"), "info");
  }
});

convInputDrop.addEventListener("click", async () => {
  const path = await selectDirectory(tr("dialog.selectInputFolder"));
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
    showToast(tr("common.selectFolder"), "info");
  }
});

bpmInputDrop.addEventListener("click", async () => {
  const path = await selectDirectory(tr("dialog.selectAudioFolder"));
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

async function loadMetaFiles(pathValue) {
  if (!pathValue || !metaInputPath || !metaFileList || !metaStatus || !metaResults || !metaResultsList) return;
  const dropContent = metaInputDrop?.querySelector(".conv-drop-content");
  metaInputPath.value = pathValue;
  metaInputPath.classList.remove("hidden");
  if (dropContent) dropContent.classList.add("hidden");

  // Single audio file — add directly without hitting /api/metadata/list
  if (isAudioFile(pathValue.split("/").pop())) {
    metaFiles = [pathValue];
    metaStatus.textContent = tr("metadata.filesFound", { count: 1 });
    renderMetaFileList([pathValue], false);
    metaResults.classList.add("hidden");
    metaResultsList.innerHTML = "";
    return;
  }

  // Directory — fetch list from server
  metaStatus.textContent = tr("metadata.loadingFiles");
  metaFileList.innerHTML = `<div class="empty-state">${tr("common.loading")}</div>`;
  try {
    const res = await fetch(`/api/metadata/list?dir=${encodeURIComponent(pathValue)}&recursive=false`);
    const data = await res.json();
    if (!data.ok) {
      metaStatus.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
      metaFileList.innerHTML = `<div class="empty-state">${tr("metadata.errorLoading")}</div>`;
      return;
    }
    if (data.files.length === 0) {
      metaStatus.textContent = tr("metadata.noAudioFound");
      metaFileList.innerHTML = `<div class="empty-state">${tr("metadata.noAudioFound")}</div>`;
      return;
    }
    metaFiles = data.files;
    metaStatus.textContent = tr("metadata.filesFound", { count: data.files.length });
    renderMetaFileList(data.files, false);
    metaResults.classList.add("hidden");
    metaResultsList.innerHTML = "";
  } catch (e) {
    metaStatus.textContent = `${tr("common.errorPrefix")}: ${e.message}`;
    metaFileList.innerHTML = `<div class="empty-state">${tr("metadata.errorConnection")}</div>`;
  }
}

if (metaInputDrop && metaInputPath) {
  setupDragDrop(metaInputDrop, async (files) => {
    const audioFiles = files.filter(f => isAudioFile(f.split("/").pop()));
    if (files.length === 1) {
      await loadMetaFiles(files[0]);
    } else if (audioFiles.length > 1) {
      metaFiles = audioFiles;
      metaInputPath.value = `${audioFiles.length} archivos`;
      metaInputPath.classList.remove("hidden");
      metaInputDrop.querySelector(".conv-drop-content")?.classList.add("hidden");
      metaStatus.textContent = tr("metadata.filesFound", { count: audioFiles.length });
      renderMetaFileList(audioFiles, false);
      metaResults.classList.add("hidden");
      metaResultsList.innerHTML = "";
    } else {
      showToast(tr("metadata.dropHint"), "info");
    }
  });
}

if (metaInputDrop) metaInputDrop.addEventListener("click", async () => {
  if (!metaInputPath) return;
  const files = await selectFiles(tr("dialog.selectAudioFiles"), true);
  if (files && files.length === 1) {
    await loadMetaFiles(files[0]);
  } else if (files && files.length > 1) {
    const audioFiles = files.filter(f => isAudioFile(f.split("/").pop()));
    if (audioFiles.length > 0) {
      metaFiles = audioFiles;
      metaInputPath.value = `${audioFiles.length} archivos`;
      metaInputPath.classList.remove("hidden");
      metaInputDrop.querySelector(".conv-drop-content")?.classList.add("hidden");
      metaStatus.textContent = tr("metadata.filesFound", { count: audioFiles.length });
      renderMetaFileList(audioFiles, false);
      metaResults.classList.add("hidden");
      metaResultsList.innerHTML = "";
    }
  }
});

const navButtons = document.querySelectorAll(".nav-btn");
const panels = {
  classifier: document.getElementById("tab-classifier"),
  sets: document.getElementById("tab-sets"),
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
    genresList.innerHTML = `<div class="genres-empty">${tr("classifier.noGenres")}</div>`;
    return;
  }
  
  genres.forEach((genre, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${genre}</span>
      <button class="chip-remove" data-idx="${idx}" title="${tr("common.cancel")}">×</button>
    `;
    genresList.appendChild(chip);
  });
  
  // Add click handlers for remove buttons
  document.querySelectorAll(".chip-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.idx);
      genres.splice(idx, 1);
      renderGenres();
      showToast(tr("toast.genreRemoved"), "info");
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
  status.textContent = data.ok ? tr("classifier.statusSaved") : `${tr("common.errorPrefix")}: ${data.error}`;
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
  
  status.textContent = tr("classifier.running");
  log.textContent = "";
  
  // Show progress bar and cancel button
  progressContainer.classList.remove("hidden");
  progressText.textContent = tr("common.preparing");
  progressPercent.textContent = "0%";
  progressFill.style.width = "0%";
  currentFile.textContent = "";
  
  clsRun.classList.add("hidden");
  clsPause.classList.remove("hidden");
  clsCancel.classList.remove("hidden");
  clsIsPaused = false;
  clsPause.textContent = tr("classifier.pause");

  const res = await fetch("/api/genre-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputPath, dryRun, processId: currentProcessId })
  });
  
  if (!res.ok) {
    const data = await res.json();
    status.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
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
            progressText.textContent = tr("classifier.progress", { processed: data.processed, total: data.total });
            progressPercent.textContent = `${data.percentage}%`;
            progressFill.style.width = `${data.percentage}%`;
            currentFile.textContent = data.current || "";
            status.textContent = `(${data.processed}/${data.total}) ${data.current}`;
            if (data.current) {
              log.textContent += `${log.textContent ? "\n" : ""}${tr("classifier.analyzing", { processed: data.processed, total: data.total, file: data.current })}`;
              log.scrollTop = log.scrollHeight;
            }
          } else if (data.type === 'log') {
            if (data.message) {
              log.textContent += `${log.textContent ? "\n" : ""}${data.message}`;
              log.scrollTop = log.scrollHeight;
            }
          } else if (data.type === 'complete') {
            status.textContent = data.success ? tr("classifier.completed") : tr("classifier.failed");
            progressText.textContent = data.success ? tr("common.completed") : tr("common.cancelled");
            progressFill.style.width = data.success ? "100%" : "0%";
            if (data.error) {
              log.textContent += `${log.textContent ? "\n\n" : ""}${tr("common.errorPrefix")}:\n${data.error}`;
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
  const confirmed = confirm(tr("confirm.cancelClassification"));
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
      clsPause.textContent = tr("classifier.pause");
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
      clsPause.textContent = tr("classifier.resume");
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
    status.textContent = tr("sets.selectPack");
    return;
  }
  if (!warmup && !peak && !closing) {
    status.textContent = tr("sets.selectReference");
    return;
  }

  setProcessId = `set-${Date.now()}`;
  progressContainer.classList.remove("hidden");
  setRun.classList.add("hidden");
  setCancel.classList.remove("hidden");
  status.textContent = tr("sets.analyzing");
  tableBody.innerHTML = `<tr><td colspan="5" class="empty-row">${tr("sets.emptyAnalyzing")}</td></tr>`;

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
      status.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
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
            progressText.textContent = tr("sets.progress", { processed: data.processed, total: data.total });
            progressPercent.textContent = `${data.percentage}%`;
            progressFill.style.width = `${data.percentage}%`;
            currentFile.textContent = data.current || "";
            status.textContent = `(${data.processed}/${data.total}) ${data.current}`;
          } else if (data.type === "complete") {
            status.textContent = data.success ? tr("sets.completed") : tr("sets.failed");
            if (data.error) status.textContent += ` — ${data.error}`;
            progressText.textContent = data.success ? tr("common.completed") : tr("common.cancelled");
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
    status.textContent = `${tr("common.errorPrefix")}: ${e.message}`;
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
  const SECTION_LABELS = { warmup: tr("sets.bestWarmup"), peak: tr("sets.bestPeak"), closing: tr("sets.bestClosing") };
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
      bestTd.textContent = tr("sets.error");
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

  status.textContent = tr("converter.running");
  log.textContent = "";

  // Show progress bar and cancel button
  if (progressContainer) {
    progressContainer.classList.remove("hidden");
    progressText.textContent = tr("common.preparing");
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
    status.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
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
              progressText.textContent = tr("converter.progress", { processed: data.processed, total: data.total });
              progressPercent.textContent = `${data.percentage}%`;
              progressFill.style.width = `${data.percentage}%`;
              currentFile.textContent = data.current || "";
            }
            status.textContent = `${tr("converter.running")} ${data.message}`;
          } else if (data.type === 'complete') {
            status.textContent = data.success ? tr("converter.completed") : tr("converter.failed");
            if (progressContainer) {
              progressText.textContent = data.success ? tr("common.completed") : tr("common.cancelled");
              progressFill.style.width = data.success ? "100%" : "0%";
            }
            if (data.error) {
              log.textContent += `${log.textContent ? "\n\n" : ""}${tr("common.errorPrefix")}:\n${data.error}`;
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
    metaFileList.innerHTML = `<div class="file-rejected">${tr("metadata.invalidIgnored", { count: rejectedCount })}</div>`;
  }
  
  if (audioFiles.length === 0) {
    metaFileList.innerHTML += `<div class="empty-state">${tr("metadata.noValidAudio")}</div>`;
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
      <button class="file-item-remove" data-idx="${idx}" title="${tr("common.cancel")}">×</button>
      <span class="file-item-name">${fileName}</span>
      <span class="file-item-meta">${ext}</span>
      <button class="file-item-edit btn" data-path="${filePath}" title="${tr("nav.metadata")}">✎</button>
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
        if (metaStatus) metaStatus.textContent = `${tr("common.errorPrefix")}: ${err.message}`;
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
    
    showToast(`"${removedFile}" ${tr("toast.genreRemoved").toLowerCase()}`, "info");
    
    // If no files left, show original empty state
    if (metaFiles.length === 0) {
      metaFileList.innerHTML = `<div class="empty-state">${tr("metadata.emptyFolder")}</div>`;
    }
  }
}

// Identify all files
if (metaIdentifyAll) metaIdentifyAll.addEventListener("click", async () => {
  if (!metaStatus || !metaProgress || !metaCancel || !metaProgressText || !metaProgressPercent || !metaProgressFill || !metaCurrentFile || !metaFileList || !metaResults || !metaResultsList) return;

  if (metaFiles.length === 0) {
    metaStatus.textContent = tr("metadata.loadFilesFirst");
    return;
  }
  
  metaProcessId = `meta-${Date.now()}`;
  metaResultsData = [];
  
  // Show progress
  metaProgress.classList.remove("hidden");
  metaIdentifyAll.classList.add("hidden");
  metaCancel.classList.remove("hidden");
  metaStatus.textContent = tr("metadata.identifyingSongs");
  
  const total = metaFiles.length;
  let processed = 0;
  
  for (const filePath of metaFiles) {
    const fileName = filePath.split("/").pop();
    
    metaProgressText.textContent = tr("metadata.identifyingFile", { processed: processed + 1, total });
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
          result: data.error || tr("metadata.unknownError"),
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
  metaProgressText.textContent = tr("common.completed");
  metaProgressPercent.textContent = "100%";
  metaProgressFill.style.width = "100%";
  metaStatus.textContent = tr("metadata.identifiedCount", { count: metaResultsData.filter(r => r.success).length, total });
  
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
  const newName = metaNewFilename.value || tr("metadata.newNamePlaceholder");
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
  if (metaStatus) metaStatus.textContent = tr("metadata.cancelEdit");
});

// Save metadata changes
if (metaSave) metaSave.addEventListener("click", async () => {
  if (!metaStatus || !metaNewFilename || !metaTitle || !metaArtist || !metaAlbum || !metaYear || !metaGenre || !metaTrack) return;

  if (!currentMetaFile) {
    metaStatus.textContent = tr("metadata.noFileSelected");
    return;
  }
  
  const newName = metaNewFilename.value.trim();
  if (!newName) {
    metaStatus.textContent = tr("metadata.emptyName");
    return;
  }
  
  metaStatus.textContent = tr("metadata.savingChanges");
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
        metaStatus.textContent = tr("metadata.renameError", { error: renameData.error });
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
      metaStatus.textContent = tr("metadata.writeError", { error: writeData.error });
    } else {
      metaStatus.textContent = tr("metadata.saved");
      if (metaEditor) metaEditor.classList.add("hidden");
      const currentPath = metaInput?.value.trim();
      if (currentPath) await loadMetaFiles(currentPath);
    }
  } catch (e) {
    metaStatus.textContent = `${tr("common.errorPrefix")}: ${e.message}`;
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
    bpmStatus.textContent = tr("common.selectFolderFirst");
    return;
  }
  
  bpmProcessId = `bpm-${Date.now()}`;
  
  // Show progress
  bpmProgress.classList.remove("hidden");
  bpmAnalyze.classList.add("hidden");
  bpmCancel.classList.remove("hidden");
  bpmStatus.textContent = tr("bpm.running");
  bpmResults = [];
  
  // Get file list first
  try {
    const listRes = await fetch(`/api/metadata/list?dir=${encodeURIComponent(dir)}&recursive=false`);
    const listData = await listRes.json();
    
    if (!listData.ok || listData.files.length === 0) {
      bpmStatus.textContent = listData.error || tr("bpm.noFiles");
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
      bpmStatus.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
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
              bpmProgressText.textContent = tr("bpm.progress", { processed: data.processed, total: data.total });
              bpmProgressPercent.textContent = `${data.percentage}%`;
              bpmProgressFill.style.width = `${data.percentage}%`;
              bpmCurrentFile.textContent = data.current || "";
              bpmStatus.textContent = `(${data.processed}/${data.total}) ${data.current}`;
            } else if (data.type === 'complete') {
              bpmStatus.textContent = data.success ? tr("bpm.completed") : tr("bpm.failed");
              bpmProgressText.textContent = data.success ? tr("common.completed") : tr("common.cancelled");
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
    bpmStatus.textContent = `${tr("common.errorPrefix")}: ${e.message}`;
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

let stemsFilePath = null;
let stemsProcessId = null;

const stemsFileDrop = document.getElementById("stems-file-drop");
const stemsFileName = document.getElementById("stems-file-name");
const stemsRun = document.getElementById("stems-run");
const stemsCancel = document.getElementById("stems-cancel");
const stemsProgress = document.getElementById("stems-progress");
const stemsProgressText = document.getElementById("stems-progress-text");
const stemsProgressPercent = document.getElementById("stems-progress-percent");
const stemsProgressFill = document.getElementById("stems-progress-fill");
const stemsCurrentFile = document.getElementById("stems-current-file");
const stemsFormat = document.getElementById("stems-format");
const stemsResultCards = document.getElementById("stems-result-cards");
const stemsOpenVocals = document.getElementById("stems-open-vocals");
const stemsOpenInstrumental = document.getElementById("stems-open-instrumental");
const stemsOutputPath = document.getElementById("stems-output-path");
const stemsStatus = document.getElementById("stems-status");

stemsFileDrop.addEventListener("click", async () => {
  const file = Runtime.isElectron
    ? await window.electronAPI.openFiles(tr("dialog.selectSong"), false)
    : null;
  if (file) {
    stemsFilePath = file;
    stemsFileName.textContent = file.split(/[\\/]/).pop();
    stemsFileName.classList.remove("hidden");
    stemsFileDrop.querySelector(".conv-drop-text").textContent = stemsFileName.textContent;
    stemsResultCards.classList.add("hidden");
  }
});

stemsFileDrop.addEventListener("dragover", (e) => { e.preventDefault(); stemsFileDrop.classList.add("drag-over"); });
stemsFileDrop.addEventListener("dragleave", () => { stemsFileDrop.classList.remove("drag-over"); });
stemsFileDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  stemsFileDrop.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.path) {
    stemsFilePath = file.path;
    stemsFileName.textContent = file.name;
    stemsFileName.classList.remove("hidden");
    stemsFileDrop.querySelector(".conv-drop-text").textContent = file.name;
    stemsResultCards.classList.add("hidden");
  }
});

stemsRun.addEventListener("click", async () => {
  if (!stemsFilePath) {
    stemsStatus.textContent = tr("stems.selectSongFirst");
    return;
  }

  const format = stemsFormat.value || "wav";
  const outputDir = (AppState.settings.defaultOutputDir || "output").trim();

  stemsProcessId = `stems-${Date.now()}`;
  stemsProgress.classList.remove("hidden");
  stemsResultCards.classList.add("hidden");
  stemsRun.classList.add("hidden");
  stemsCancel.classList.remove("hidden");
  stemsStatus.textContent = tr("stems.separating");

  let vocalsPath = null;
  let instrumentalPath = null;

  try {
    const res = await fetch("/api/stem-separate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [stemsFilePath],
        stems: "both",
        outputDir,
        format,
        processId: stemsProcessId
      })
    });

    if (!res.ok) {
      const data = await res.json();
      stemsStatus.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
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
            stemsProgressText.textContent = tr("stems.progress", { file: data.current || "" });
            stemsProgressPercent.textContent = `${data.percentage}%`;
            stemsProgressFill.style.width = `${data.percentage}%`;
            stemsCurrentFile.textContent = data.current || "";
            stemsStatus.textContent = data.current || tr("common.processing");
          } else if (data.type === "complete") {
            stemsProgressText.textContent = data.success ? tr("common.completed") : tr("common.cancelled");
            stemsProgressFill.style.width = data.success ? "100%" : "0%";
            if (data.error) stemsStatus.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
          } else if (data.type === "result") {
            const results = data.results || [];
            const first = results[0];
            if (first && first.ok && first.files) {
              for (const f of first.files) {
                const lower = f.toLowerCase();
                if (lower.includes("_vocals") || lower.includes("vocals.")) vocalsPath = f;
                else if (lower.includes("_instrumental") || lower.includes("no_vocals")) instrumentalPath = f;
              }
            }
          }
        } catch (e) {
          console.error("Error parsing SSE data:", e);
        }
      }
    }
  } catch (e) {
    stemsStatus.textContent = `${tr("common.errorPrefix")}: ${e.message}`;
  }

  if (vocalsPath || instrumentalPath) {
    stemsStatus.textContent = tr("stems.completed");
    stemsResultCards.classList.remove("hidden");
    stemsOutputPath.textContent = tr("stems.savedIn", { path: outputDir });

    const cardVocals = document.getElementById("stems-card-vocals");
    const cardInstrumental = document.getElementById("stems-card-instrumental");

    if (vocalsPath) {
      cardVocals.classList.remove("hidden");
      stemsOpenVocals.onclick = () => {
        if (Runtime.isElectron) window.electronAPI.showInFolder(vocalsPath);
      };
    } else {
      cardVocals.classList.add("hidden");
    }

    if (instrumentalPath) {
      cardInstrumental.classList.remove("hidden");
      stemsOpenInstrumental.onclick = () => {
        if (Runtime.isElectron) window.electronAPI.showInFolder(instrumentalPath);
      };
    } else {
      cardInstrumental.classList.add("hidden");
    }
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
  await runSetupAssistant();
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
  const selected = await selectDirectory(tr("dialog.selectOutputFolder"));
  if (!selected) return;
  cfgDefaultOutput.value = selected;
  cfgDefaultOutput.dataset.pathLabel = displayPathLabel(selected);
  // Auto-save immediately so the path persists without requiring a manual Save click
  AppState.settings.defaultOutputDir = selected;
  try {
    const currentSettings = {
      spotifyClientId: document.getElementById("cfg-spotify-id")?.value.trim() || "",
      spotifyClientSecret: document.getElementById("cfg-spotify-secret")?.value.trim() || "",
      lastfmApiKey: document.getElementById("cfg-lastfm-key")?.value.trim() || "",
      language: document.getElementById("cfg-language")?.value || "es",
      defaultOutputDir: selected
    };
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentSettings)
    });
    const data = await res.json();
    if (data.ok) showToast(tr("toast.settingsSaved"), "success", 2000);
  } catch {
    // Non-critical: field is updated in memory, user can still click Save manually
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
  
  status.textContent = tr("settings.saving");
  
  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    
    if (data.ok) {
      status.textContent = tr("settings.saved");
      status.style.color = "var(--accent-2)";
      showToast(tr("toast.settingsSaved"), "success", 2500);
      
      // Apply language change
      applyLanguage(settings.language);
      AppState.settings.defaultOutputDir = settings.defaultOutputDir;
      if (cfgStatusTimer) clearTimeout(cfgStatusTimer);
      cfgStatusTimer = setTimeout(() => {
        status.textContent = "";
      }, 3000);
    } else {
      status.textContent = `${tr("common.errorPrefix")}: ${data.error}`;
      status.style.color = "var(--accent)";
      if (cfgStatusTimer) clearTimeout(cfgStatusTimer);
    }
  } catch (error) {
    status.textContent = `${tr("common.errorPrefix")}: ${error.message}`;
    status.style.color = "var(--accent)";
    if (cfgStatusTimer) clearTimeout(cfgStatusTimer);
  }
});

// FFmpeg check button
const ffmpegCheck = document.getElementById("ffmpeg-check");
ffmpegCheck.addEventListener("click", async () => {
  const statusText = document.getElementById("ffmpeg-status-text");
  statusText.textContent = tr("ffmpeg.checking");

  const isInstalled = await fetchFfmpegReadyOnce();
  setFfmpegReady(isInstalled);
});

// FFmpeg install button
const ffmpegInstall = document.getElementById("ffmpeg-install");
ffmpegInstall.addEventListener("click", async () => {
  const statusText = document.getElementById("ffmpeg-status-text");
  statusText.textContent = tr("ffmpeg.installing");
  statusText.className = "ffmpeg-value";
  
  if (window.electronAPI && window.electronAPI.installFFmpeg) {
    // Use Electron API for installation
    const result = await window.electronAPI.installFFmpeg();
    statusText.textContent = result.message;
    statusText.className = result.success ? "ffmpeg-value ok" : "ffmpeg-value error";
    setFfmpegReady(result.success ? true : false);
  } else {
    statusText.textContent = tr("ffmpeg.desktopOnly");
    statusText.className = "ffmpeg-value error";
  }
});

function applyLanguage(lang) {
  const t = getTranslationsForLang(lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key && t[key] !== undefined) el.textContent = t[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key && t[key] !== undefined) el.placeholder = t[key];
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key && t[key] !== undefined) el.title = t[key];
  });
  localStorage.setItem("musickind-lang", lang);
}

function onFfmpegStateChangeRender(ready) {
  const statusText = document.getElementById("ffmpeg-status-text");
  if (statusText) {
    if (ready === true) {
      statusText.textContent = tr("ffmpeg.installed");
      statusText.className = "ffmpeg-value ok";
    } else if (ready === false) {
      statusText.textContent = tr("ffmpeg.notInstalled");
      statusText.className = "ffmpeg-value error";
    } else {
      statusText.textContent = tr("ffmpeg.unknown");
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
