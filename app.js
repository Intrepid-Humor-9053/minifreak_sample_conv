// app.js

// ——— Global state ———
const dropArea     = document.getElementById('drop-area');
const dlBtn        = document.getElementById('download-selection-btn');
let samplesForCanvas;   // Float32Array of full preview
let sampleRate;         // e.g. 48000
let maxDuration;        // preview length
let currentFileName;    // original file base
let currentFade;        // boolean
let currentNormalize;   // boolean

// Default selection
let selectedStart = 0;
let selectedEnd   = 3.0;

// ——— Drag/drop & file-picker ———
dropArea.addEventListener('dragover', e => {
  e.preventDefault();
  dropArea.classList.add('active');
});
dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('active');
});
dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.classList.remove('active');
  handleFiles(e.dataTransfer.files);
});
dropArea.addEventListener('click', () => {
  document.getElementById('fileElem').click();
});
document.getElementById('fileElem')
  .addEventListener('change', e => handleFiles(e.target.files));

function handleFiles(files) {
  const fade      = document.getElementById('fade-checkbox').checked;
  const normalize = document.getElementById('normalize-checkbox').checked;
  let duration    = parseFloat(document.getElementById('duration-seconds').value);
  if (isNaN(duration) || duration <= 0) duration = 3.0;

  // For simplicity, only process the first file
  const file = files[0];
  if (!file) return;

  currentFade      = fade;
  currentNormalize = normalize;
  loadAndPreview(file, fade, normalize, duration);
}

// ——— Step 1–3: Decode, resample, preview ———
async function loadAndPreview(file, fade, normalize, durationSec) {
  try {
    // (1) decode
    const arrayBuffer = await file.arrayBuffer();
    const decodeCtx   = new (window.AudioContext || window.webkitAudioContext)();
    const decoded     = await decodeCtx.decodeAudioData(arrayBuffer);

    // (2) resample + truncate to durationSec
    const SAMPLE_RATE = 48000;
    const FRAME_COUNT = Math.floor(SAMPLE_RATE * durationSec);
    const offline     = new OfflineAudioContext({
      numberOfChannels: 1,
      length: FRAME_COUNT,
      sampleRate: SAMPLE_RATE
    });
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();

    // store for later
    samplesForCanvas = rendered.getChannelData(0).slice(); 
    sampleRate       = SAMPLE_RATE;
    maxDuration      = durationSec;
    currentFileName  = file.name.replace(/\.[^/.]+$/, '');

    // draw + labels
    drawWaveform(samplesForCanvas);
    updateSelectionLabels();

    // enable download button once preview is ready
    dlBtn.disabled = false;
  } catch (err) {
    showErrorDialog(err.message);
  }
}

// ——— Step 4–8: Crop + optional fade/normalize + export ———
dlBtn.addEventListener('click', downloadSelection);

function downloadSelection() {
  if (!samplesForCanvas) return;

  // (4) crop
  const startSample = Math.floor(selectedStart * sampleRate);
  const endSample   = Math.floor(selectedEnd   * sampleRate);
  let samples       = samplesForCanvas.slice(startSample, endSample);

  // (5) fade
  if (currentFade) {
    const FADE_SAMPLES = Math.floor(sampleRate * 0.020);
    for (let i = 0; i < FADE_SAMPLES; i++) {
      samples[i]                       *= i / FADE_SAMPLES;
      samples[samples.length - 1 - i] *= i / FADE_SAMPLES;
    }
  }

  // (6) normalize
  if (currentNormalize) {
    let maxAbs = 0;
    for (let s of samples) maxAbs = Math.max(maxAbs, Math.abs(s));
    if (maxAbs > 0) {
      const scale = 1 / maxAbs;
      for (let i = 0; i < samples.length; i++) {
        samples[i] *= scale;
      }
    } else {
      samples = new Float32Array(samples.length);
    }
  }

  // (7) to 8-bit signed PCM
  const int8 = new Int8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let v = Math.round(samples[i] * 127);
    int8[i] = Math.max(-128, Math.min(127, v));
  }

  // trigger download
  const blob = new Blob([int8], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${currentFileName}.raw12b`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ——— waveform + selection UI ———
function drawWaveform(samples) {
  const canvas = document.getElementById('waveform-canvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  // bg
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // wave
  ctx.strokeStyle = '#ff9933';
  ctx.beginPath();
  const step = Math.floor(samples.length / W) || 1;
  for (let i = 0; i < W; i++) {
    const s = samples[i * step] || 0;
    const y = (1 - s) * H / 2;
    i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
  }
  ctx.stroke();

  // selection lines
  const startX = (selectedStart / maxDuration) * W;
  const endX   = (selectedEnd   / maxDuration) * W;

  ctx.strokeStyle = '#00ffff';
  ctx.beginPath();
  ctx.moveTo(startX, 0); ctx.lineTo(startX, H); ctx.stroke();

  ctx.strokeStyle = '#ff00ff';
  ctx.beginPath();
  ctx.moveTo(endX,   0); ctx.lineTo(endX,   H); ctx.stroke();
}

function updateSelectionLabels() {
  document.getElementById('start-label').textContent = selectedStart.toFixed(2);
  document.getElementById('end-label').textContent   = selectedEnd  .toFixed(2);
}

// ——— drag-to-select on canvas ———
const canvas = document.getElementById('waveform-canvas');
let isDragging = false, dragStartX = 0, dragEndX = 0;

canvas.addEventListener('mousedown', e => {
  isDragging = true;
  dragStartX = e.offsetX;
  dragEndX   = dragStartX;
});
canvas.addEventListener('mousemove', e => {
  if (!isDragging) return;
  dragEndX = e.offsetX;
  updateSelection();
});
canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

function updateSelection() {
  const W = canvas.width;
  let x0 = Math.min(dragStartX, dragEndX);
  let x1 = Math.max(dragStartX, dragEndX);

  selectedStart = Math.max(0, Math.min((x0 / W) * maxDuration, maxDuration));
  selectedEnd   = Math.max(0, Math.min((x1 / W) * maxDuration, maxDuration));
  if (selectedEnd - selectedStart < 0.05) {
    selectedEnd = selectedStart + 0.05;
  }

  updateSelectionLabels();
  drawWaveform(samplesForCanvas);
}

// ——— error dialog ———
function showErrorDialog(message) {
  if (
    message.includes('unknown content type') ||
    message.includes('Decoding audio data failed')
  ) {
    message = 'Invalid file type';
  }
  const dialog = document.getElementById('error-dialog');
  dialog.textContent   = message;
  dialog.classList.add('visible');
  dialog.style.display = 'flex';
  setTimeout(() => {
    dialog.classList.remove('visible');
    setTimeout(() => dialog.style.display = 'none', 200);
  }, 5000);
}

