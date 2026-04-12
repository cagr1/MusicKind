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
  converter: document.getElementById("tab-converter")
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
clsRun.addEventListener("click", async () => {
  const inputPath = document.getElementById("cls-input").value.trim();
  const dryRun = document.getElementById("cls-dry").checked;
  const status = document.getElementById("cls-status");
  const log = document.getElementById("cls-log");
  status.textContent = "Ejecutando clasificador...";
  log.textContent = "";

  // Check FFmpeg availability first
  const ffmpegRes = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputPath, outputPath: "temp", format: "mp3" })
  });
  const ffmpegData = await ffmpegRes.json();
  const ffmpegAvailable = ffmpegData.ok;

  const res = await fetch("/api/genre-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputPath, dryRun })
  });
  
  if (!res.ok) {
    const data = await res.json();
    status.textContent = `Error: ${data.error}`;
    log.textContent = data.error || "";
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
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress') {
            status.textContent = `Procesando... ${data.message}`;
          } else if (data.type === 'complete') {
            status.textContent = data.success ? "Listo. Revisa la carpeta de salida." : "Error en el proceso.";
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }

  // Get final result
  const finalRes = await fetch("/api/genre-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputPath, dryRun })
  });
  const finalData = await finalRes.json();
  
  if (finalData.ok) {
    status.textContent = "Listo. Revisa la carpeta de salida.";
    log.textContent = finalData.output || "";
  } else {
    status.textContent = `Error: ${finalData.error}`;
    log.textContent = finalData.error || "";
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

  if (tempConvert && !tempFormat) {
    status.textContent = "Selecciona un formato para la conversion temporal.";
    return;
  }

  spinner.classList.add("active");
  status.textContent = "Analizando audio...";
  log.textContent = "";

  const res = await fetch("/api/set-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseDj,
      newPack,
      outputDir,
      analysisSeconds,
      tempFormat: tempConvert ? tempFormat : "",
      tempBitrate: tempConvert && tempFormat === "mp3" ? Number(tempBitrate) : null
    })
  });

  if (!res.ok) {
    const data = await res.json();
    spinner.classList.remove("active");
    status.textContent = `Error: ${data.error}`;
    log.textContent = data.error || "";
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
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress') {
            status.textContent = `Analizando audio... ${data.message}`;
          } else if (data.type === 'complete') {
            spinner.classList.remove("active");
            status.textContent = data.success ? "Listo. Revisa los archivos en output." : "Error en el análisis.";
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }

  // Get final result
  const finalRes = await fetch("/api/set-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseDj,
      newPack,
      outputDir,
      analysisSeconds,
      tempFormat: tempConvert ? tempFormat : "",
      tempBitrate: tempConvert && tempFormat === "mp3" ? Number(tempBitrate) : null
    })
  });
  const finalData = await finalRes.json();
  
  spinner.classList.remove("active");
  if (finalData.ok) {
    status.textContent = "Listo. Revisa los archivos en output.";
    log.textContent = finalData.output || "";
  } else {
    status.textContent = `Error: ${finalData.error}`;
    log.textContent = finalData.error || "";
  }
});

const convRun = document.getElementById("conv-run");
convRun.addEventListener("click", async () => {
  const inputPath = document.getElementById("conv-input").value.trim();
  const outputPath = document.getElementById("conv-output").value.trim();
  const format = document.getElementById("conv-format").value;
  const bitrate = document.getElementById("conv-bitrate").value;
  const status = document.getElementById("conv-status");
  const log = document.getElementById("conv-log");

  status.textContent = "Convirtiendo...";
  log.textContent = "";

  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputPath,
      outputPath,
      format,
      bitrate: format === "mp3" && bitrate ? Number(bitrate) : null
    })
  });

  if (!res.ok) {
    const data = await res.json();
    status.textContent = `Error: ${data.error}`;
    log.textContent = data.error || "";
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
    buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress') {
            status.textContent = `Convirtiendo... ${data.message}`;
          } else if (data.type === 'complete') {
            status.textContent = data.success ? "Conversion finalizada." : "Error en la conversion.";
          }
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }

  // Get final result
  const finalRes = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputPath,
      outputPath,
      format,
      bitrate: format === "mp3" && bitrate ? Number(bitrate) : null
    })
  });
  const finalData = await finalRes.json();
  
  if (finalData.ok) {
    status.textContent = "Conversion finalizada.";
    log.textContent = finalData.output || "";
  } else {
    status.textContent = `Error: ${finalData.error}`;
    log.textContent = finalData.error || "";
  }
});

loadGenres();
checkFFmpegStatus();
