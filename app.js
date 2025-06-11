// app.js

// Global state
const dropArea = document.getElementById('drop-area');
let selectedStart     = 0;   // in seconds
let selectedEnd       = 3.0; // in seconds
let maxDuration = 3.0;
let samplesForCanvas  = [];  // full waveform samples
let sampleRate        = 48000;

// Drag & drop handlers
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

// Entry point for files
function handleFiles(files) {
  const fade      = document.getElementById('fade-checkbox').checked;
  const normalize = document.getElementById('normalize-checkbox').checked;
  let duration    = parseFloat(document.getElementById('duration-seconds').value);
  if (isNaN(duration) || duration <= 0) duration = maxDuration;

  for (let file of files) {
    processFileAndDownload(file, fade, normalize, duration);
  }
}

// Main processing + download
async function processFileAndDownload(file, fade, normalize, durationSec) {
  try {
    // 1. Read & decode
    const arrayBuffer = await file.arrayBuffer();
    const decodeCtx   = new (window.AudioContext || window.webkitAudioContext)();
    const decoded     = await decodeCtx.decodeAudioData(arrayBuffer);

    // 2. Resample to 48kHz mono, truncate to durationSec
    const SAMPLE_RATE = 48000;
    const FRAME_COUNT = Math.floor(SAMPLE_RATE * durationSec);
    const offline = new OfflineAudioContext({
      numberOfChannels: 1,
      length: FRAME_COUNT,
      sampleRate: SAMPLE_RATE
    });
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();

    // 3. Prepare full waveform for preview
    const fullSamples = rendered.getChannelData(0);
    samplesForCanvas  = fullSamples.slice();
    sampleRate        = SAMPLE_RATE;
    maxDuration = durationSec;
    drawWaveform(samplesForCanvas);
    updateSelectionLabels();

    // 4. Crop according to selection
    const startSample = Math.floor(selectedStart * SAMPLE_RATE);
    const endSample   = Math.floor(selectedEnd   * SAMPLE_RATE);
    let samples       = fullSamples.slice(startSample, endSample);

    // 5. Optional fade-in/out
    if (fade) {
      const FADE_SAMPLES = Math.floor(SAMPLE_RATE * 0.020);
      for (let i = 0; i < FADE_SAMPLES; i++) {
        samples[i]                         *= i / FADE_SAMPLES;
        samples[samples.length - 1 - i]   *= i / FADE_SAMPLES;
      }
    }

    // 6. Optional peak-normalization
    if (normalize) {
      let maxAbs = 0;
      for (let s of samples) maxAbs = Math.max(maxAbs, Math.abs(s));
      if (maxAbs > 0) {
        const scale = 1 / maxAbs;
        for (let i = 0; i < samples.length; i++) samples[i] *= scale;
      } else {
        samples = new Float32Array(samples.length);
      }
    }

    // 7. Convert to signed 8-bit PCM
    const int8 = new Int8Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      let v = Math.round(samples[i] * 127);
      int8[i] = Math.max(-128, Math.min(127, v));
    }

    // 8. Trigger download
    const blob = new Blob([int8], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const base = file.name.replace(/\.[^/.]+$/, '');
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${base}.raw12b`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (err) {
    showErrorDialog(err.message || "Unknown error");
  }
}

// Error dialog
function showErrorDialog(message) {
  const dialog = document.getElementById('error-dialog');
  if (
    message === "The buffer passed to decodeAudioData contains an unknown content type." ||
    message === "Decoding audio data failed."
  ) {
    message = "Invalid file type";
  }
  dialog.textContent    = message;
  dialog.classList.add('visible');
  dialog.style.display  = 'flex';
  setTimeout(() => {
    dialog.classList.remove('visible');
    setTimeout(() => { dialog.style.display = 'none'; }, 200);
  }, 5000);
}

// Draw waveform and selection lines
function drawWaveform(samples) {
  const canvas = document.getElementById('waveform-canvas');
  const ctx    = canvas.getContext('2d');
  const width  = canvas.width;
  const height = canvas.height;

  // Background
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // Waveform
  ctx.strokeStyle = '#ff9933';
  ctx.beginPath();
  const step = Math.floor(samples.length / width);
  for (let i = 0; i < width; i++) {
    const s = samples[i * step] || 0;
    const y = (1 - s) * height / 2;
    i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
  }
  ctx.stroke();

  // Selection lines
  const startX = (selectedStart / maxDuration) * width;
  const endX   = (selectedEnd   / maxDuration) * width;

  ctx.strokeStyle = '#00ffff';
  ctx.beginPath();
  ctx.moveTo(startX, 0);
  ctx.lineTo(startX, height);
  ctx.stroke();

  ctx.strokeStyle = '#ff00ff';
  ctx.beginPath();
  ctx.moveTo(endX, 0);
  ctx.lineTo(endX, height);
  ctx.stroke();
}

// Update start/end labels
function updateSelectionLabels() {
  const sLbl = document.getElementById('start-label');
  const eLbl = document.getElementById('end-label');
  if (sLbl && eLbl) {
    sLbl.textContent = selectedStart.toFixed(2);
    eLbl.textContent = selectedEnd.toFixed(2);
  }
}

// Canvas drag-to-select interaction
const canvas = document.getElementById('waveform-canvas');
let isDragging = false, dragStartX = 0, dragEndX = 0;

canvas.addEventListener('mousedown', e => {
  isDragging  = true;
  const rect  = canvas.getBoundingClientRect();
  dragStartX  = e.clientX - rect.left;
  dragEndX    = dragStartX;
  updateSelectionFromCanvas();
});
canvas.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const rect  = canvas.getBoundingClientRect();
  dragEndX    = e.clientX - rect.left;
  updateSelectionFromCanvas();
});
canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

function updateSelectionFromCanvas() {
  const width = canvas.width;
  let startX  = Math.min(dragStartX, dragEndX);
  let endX    = Math.max(dragStartX, dragEndX);

  selectedStart = Math.max(0, Math.min((startX / width) * maxDuration, maxDuration));
  selectedEnd   = Math.max(0, Math.min((endX   / width) * maxDuration, maxDuration));
  if (selectedEnd - selectedStart < 0.05) selectedEnd = selectedStart + 0.05;

  updateSelectionLabels();
  drawWaveform(samplesForCanvas);
}
