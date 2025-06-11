// app.js

document.addEventListener('DOMContentLoaded', () => {
  // ——— Global state ———
  const dropArea = document.getElementById('drop-area');
  const dlBtn    = document.getElementById('download-selection-btn');
  const fileElem = document.getElementById('fileElem');
  const fadeChk  = document.getElementById('fade-checkbox');
  const normChk  = document.getElementById('normalize-checkbox');
  const durInput = document.getElementById('duration-seconds');
  const canvas   = document.getElementById('waveform-canvas');
  const dialog   = document.getElementById('error-dialog');
  let samplesForCanvas = null;   // Float32Array
  let sampleRate       = 0;      // e.g. 48000
  let maxDuration      = 0;      // preview length
  let currentFileName  = '';     // file base name
  let currentFade      = false;
  let currentNormalize = false;

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
  dropArea.addEventListener('click', () => fileElem.click());
  fileElem.addEventListener('change', e => handleFiles(e.target.files));

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;

    currentFade      = fadeChk.checked;
    currentNormalize = normChk.checked;
    let duration     = parseFloat(durInput.value);
    if (isNaN(duration) || duration <= 0) duration = 3.0;

    loadAndPreview(file, duration);
  }

  // ——— Step 1–3: Decode, resample, preview ———
  async function loadAndPreview(file, durationSec) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodeCtx   = new (window.AudioContext || window.webkitAudioContext)();
      const decoded     = await decodeCtx.decodeAudioData(arrayBuffer);

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

      samplesForCanvas = rendered.getChannelData(0).slice();
      sampleRate       = SAMPLE_RATE;
      maxDuration      = durationSec;
      currentFileName  = file.name.replace(/\.[^/.]+$/, '');

      drawWaveform(samplesForCanvas);
      updateSelectionLabels();
      dlBtn.disabled = false;

    } catch (err) {
      showErrorDialog(err.message);
    }
  }

  // ——— Step 4–8: Crop + fade/normalize + export ———
  dlBtn.addEventListener('click', () => {
    if (!samplesForCanvas) return;

    // crop
    const startSample = Math.floor(selectedStart * sampleRate);
    const endSample   = Math.floor(selectedEnd   * sampleRate);
    let samples       = samplesForCanvas.slice(startSample, endSample);

    // fade
    if (currentFade) {
      const FADE_SAMPLES = Math.floor(sampleRate * 0.020);
      for (let i = 0; i < FADE_SAMPLES; i++) {
        samples[i]                       *= i / FADE_SAMPLES;
        samples[samples.length - 1 - i] *= i / FADE_SAMPLES;
      }
    }

    // normalize
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

    // to 8-bit signed PCM
    const int8 = new Int8Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      let v = Math.round(samples[i] * 127);
      int8[i] = Math.max(-128, Math.min(127, v));
    }

    // download
    const blob = new Blob([int8], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${currentFileName}.raw12b`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ——— waveform + selection UI ———
  function drawWaveform(samples) {
    if (!samples || !maxDuration) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width, H = canvas.height;

    // background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // waveform
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
    document.getElementById('end-label')  .textContent = selectedEnd  .toFixed(2);
  }

  // ——— drag-to-select on canvas ———
  let isDragging  = false;
  let dragStartX  = 0;
  let dragCurrentX= 0;

  canvas.addEventListener('mousedown', e => {
    if (!samplesForCanvas) return;
    isDragging  = true;
    dragStartX  = e.offsetX;
    dragCurrentX= dragStartX;
  });
  canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    dragCurrentX = e.offsetX;
    updateSelection();
  });
  canvas.addEventListener('mouseup', () => { isDragging = false; });
  canvas.addEventListener('mouseleave', () => { isDragging = false; });

  function updateSelection() {
    if (!samplesForCanvas) return;
    const W = canvas.width;
    const x0= Math.min(dragStartX, dragCurrentX);
    const x1= Math.max(dragStartX, dragCurrentX);

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
    dialog.textContent   = message;
    dialog.classList.add('visible');
    dialog.style.display = 'flex';
    setTimeout(() => {
      dialog.classList.remove('visible');
      setTimeout(() => dialog.style.display = 'none', 200);
    }, 5000);
  }
});
