const dropArea = document.getElementById('drop-area');
let selectedStart = 0; // seconds
let selectedEnd = 3;   // seconds
let maxDuration = 3.0;
let samplesForCanvas = [];
let sampleRate = 48000;


dropArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropArea.classList.add('active');
});

dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('active');
});

dropArea.addEventListener('drop', (event) => {
    event.preventDefault();
    dropArea.classList.remove('active');
    const files = event.dataTransfer.files;
    handleFiles(files);
});

dropArea.addEventListener('click', () => {
    document.getElementById('fileElem').click();
});

// Handle file selection from picker
document.getElementById('fileElem').addEventListener('change', (event) => {
    handleFiles(event.target.files);
});

function handleFiles(files) {
    const fade = document.getElementById('fade-checkbox').checked;
    const normalize = document.getElementById('normalize-checkbox').checked;
    const durationInput = document.getElementById('duration-seconds');
    let duration = parseFloat(durationInput.value);
    if (isNaN(duration) || duration <= 0) duration = 3;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        processFileAndDownload(file, fade, normalize, duration);
    }
}

async function processFileAndDownload(file, fade, normalize, durationSec) {
  try {
    /* ---------- 1. Read & decode ---------- */
    const arrayBuffer = await file.arrayBuffer();
    const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer);

    /* ---------- 2. Resample to 48 kHz mono & truncate to N s ---------- */
    const SAMPLE_RATE = 48_000;
    const DURATION_SEC = durationSec;
    const FRAME_COUNT = Math.floor(SAMPLE_RATE * DURATION_SEC);

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
    let samples = rendered.getChannelData(0);

    /* ---------- 3. Optional fade-in/out ---------- */
    if (fade) {
      const FADE_SAMPLES = Math.floor(SAMPLE_RATE * 0.020); // 20 ms
      for (let i = 0; i < FADE_SAMPLES; ++i) {
        samples[i] *= i / FADE_SAMPLES;                                     // fade-in
        samples[samples.length - 1 - i] *= i / FADE_SAMPLES;               // fade-out
      }
    }

    /* ---------- 4. Optional peak-normalisation ---------- */
    if (normalize) {
      let maxAbs = 0;
      for (const s of samples) maxAbs = Math.max(maxAbs, Math.abs(s));
      if (maxAbs > 0) {
        const scale = 1 / maxAbs;
        for (let i = 0; i < samples.length; ++i) samples[i] *= scale;
      } else {
        samples = new Float32Array(samples.length); // keep silence as zeros
      }
    }

    /* ---------- 5. Convert to signed 8-bit PCM ---------- */
    const int8 = new Int8Array(samples.length);
    for (let i = 0; i < samples.length; ++i) {
      let v = Math.round(samples[i] * 127);
      v = Math.max(-128, Math.min(127, v)); // clamp
      int8[i] = v;
    }

    /* ---------- 6. Trigger download ---------- */
    const blob = new Blob([int8], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const base = file.name.replace(/\.[^/.]+$/, ''); // strip extension
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.raw12b`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showErrorDialog(err?.message || "Unknown error");
  }
}

function showErrorDialog(message) {
  const dialog = document.getElementById('error-dialog');
  if (
    message === "The buffer passed to decodeAudioData contains an unknown content type." ||
    message === "Decoding audio data failed." // for some browsers
  ) {
    message = "Invalid file type";
  }
  dialog.textContent = message;
  dialog.classList.add('visible');
  dialog.style.display = 'flex';
  setTimeout(() => {
    dialog.classList.remove('visible');
    setTimeout(() => { dialog.style.display = 'none'; }, 200);
  }, 5000);
}
