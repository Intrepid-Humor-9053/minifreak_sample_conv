document.addEventListener('DOMContentLoaded', () => {
  // ——— DOM refs ———
  const dropArea = document.getElementById('drop-area');
  const fileElem = document.getElementById('fileElem');
  const fadeChk  = document.getElementById('fade-checkbox');
  const normChk  = document.getElementById('normalize-checkbox');
  const durInput = document.getElementById('duration-seconds');
  const canvas   = document.getElementById('waveform-canvas');
  const dlBtn    = document.getElementById('download-selection-btn');
  const dialog   = document.getElementById('error-dialog');

  // ——— State ———
  let samplesForCanvas = null;
  let sampleRate       = 0;
  let maxDuration      = 0;
  let currentFileName  = '';
  let currentFade      = false;
  let currentNormalize = false;
  let selectedStart = 0;
  let selectedEnd   = 3.0;

  // ——— Drag/Drop & File-picker ———
  dropArea.addEventListener('dragover', e => {
    e.preventDefault(); dropArea.classList.add('active');
  });
  dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('active');
  });
  dropArea.addEventListener('drop', e => {
    e.preventDefault(); dropArea.classList.remove('active');
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

  // ——— Decode + Resample + Preview ———
  async function loadAndPreview(file, durationSec) {
    try {
      const buf = await file.arrayBuffer();
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await actx.decodeAudioData(buf);

      const SR = 48000;
      const frameCount = Math.floor(SR * durationSec);
      const offline = new OfflineAudioContext(1, frameCount, SR);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0);
      const rendered = await offline.startRendering();

      samplesForCanvas = rendered.getChannelData(0).slice();
      sampleRate       = SR;
      maxDuration      = durationSec;
      currentFileName  = file.name.replace(/\.[^/.]+$/, '');

      // Reset selection to [0 … min(maxDuration, 3)]
      selectedStart = 0;
      selectedEnd   = Math.min(maxDuration, 3.0);

      drawWaveform();
      updateLabels();
      dlBtn.disabled = false;
    } catch (err) {
      showError(err.message);
    }
  }

  // ——— Crop + Fade/Normalize + Download ———
  dlBtn.addEventListener('click', () => {
    if (!samplesForCanvas) return;

    // Crop
    const startSample = Math.floor(selectedStart * sampleRate);
    const endSample   = Math.floor(selectedEnd   * sampleRate);
    let samples = samplesForCanvas.slice(startSample, endSample);

    // Fade
    if (currentFade) {
      const fadeCount = Math.floor(sampleRate * 0.02);
      for (let i = 0; i < fadeCount; i++) {
        samples[i]                  *= i / fadeCount;
        samples[samples.length-1-i] *= i / fadeCount;
      }
    }

    // Normalize
    if (currentNormalize) {
      let maxAbs = 0;
      for (let s of samples) maxAbs = Math.max(maxAbs, Math.abs(s));
      if (maxAbs > 0) {
        const scale = 1 / maxAbs;
        for (let i = 0; i < samples.length; i++) samples[i] *= scale;
      } else {
        samples = new Float32Array(samples.length);
      }
    }

    // To 8-bit signed PCM
    const int8 = new Int8Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      let v = Math.round(samples[i] * 127);
      int8[i] = Math.max(-128, Math.min(127, v));
    }

    // Download
    const blob = new Blob([int8], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${currentFileName}.raw12b`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ——— Waveform drawing + selection ———
  let isDragging = false, dragX0 = 0, dragX1 = 0;

  canvas.addEventListener('mousedown', e => {
    if (!samplesForCanvas) return;
    isDragging = true;
    dragX0 = e.offsetX; dragX1 = dragX0;
  });
  canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    dragX1 = e.offsetX;
    updateSelection();
  });
  canvas.addEventListener('mouseup',   () => isDragging = false);
  canvas.addEventListener('mouseleave',() => isDragging = false);

  function updateSelection() {
    if (!samplesForCanvas) return;
    const W  = canvas.width;
    const x0 = Math.min(dragX0, dragX1);
    const x1 = Math.max(dragX0, dragX1);

    selectedStart = (x0 / W) * maxDuration;
    selectedEnd   = (x1 / W) * maxDuration;

    // enforce minimum span
    if (selectedEnd - selectedStart < 0.05) {
      selectedEnd = selectedStart + 0.05;
    }

    // enforce maximum span of 3 s
    const MAX_WINDOW = 3.0;
    if (selectedEnd - selectedStart > MAX_WINDOW) {
      selectedEnd = selectedStart + MAX_WINDOW;
    }

    // never exceed preview length
    selectedEnd = Math.min(selectedEnd, maxDuration);

    updateLabels();
    drawWaveform();
  }

  function drawWaveform() {
    if (!samplesForCanvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);

    ctx.strokeStyle = '#ff9933';
    ctx.beginPath();
    const step = Math.max(1, Math.floor(samplesForCanvas.length / W));
    for (let i = 0; i < W; i++) {
      const y = (1 - samplesForCanvas[i*step]) * H/2;
      i===0 ? ctx.moveTo(i,y) : ctx.lineTo(i,y);
    }
    ctx.stroke();

    // selection lines
    const sx = (selectedStart / maxDuration) * W;
    const ex = (selectedEnd   / maxDuration) * W;
    ctx.strokeStyle = '#0ff'; ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
    ctx.strokeStyle = '#f0f'; ctx.beginPath(); ctx.moveTo(ex,0); ctx.lineTo(ex,H); ctx.stroke();
  }

  function updateLabels() {
    document.getElementById('start-label').textContent = selectedStart.toFixed(2);
    document.getElementById('end-label')  .textContent = selectedEnd.toFixed(2);
  }

  function showError(msg) {
    dialog.textContent = msg.includes('Decoding') ? 'Invalid file type' : msg;
    dialog.style.display = 'block';
    setTimeout(() => dialog.style.display = 'none', 3000);
  }
});
