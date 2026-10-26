const MODEL_ID = "Xenova/whisper-tiny";

const audioInput = document.getElementById("audio-file");
const selectedAudio = document.getElementById("selected-audio");
const fileName = document.getElementById("file-name");
const audioPreview = document.getElementById("audio-preview");
const transcribeButton = document.getElementById("transcribe-button");
const buttonLabel = document.getElementById("button-label");
const buttonIcon = document.getElementById("button-icon");
const buttonSpinner = document.getElementById("button-spinner");
const statusArea = document.getElementById("status-area");
const statusMessage = document.getElementById("status-message");
const progressTrack = document.getElementById("progress-track");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const transcript = document.getElementById("transcript");
const copyButton = document.getElementById("copy-button");

let selectedFile;
let audioUrl;
let transcriberPromise;
let isBusy = false;

function setStatus(message, type = "info") {
  statusArea.hidden = !message;
  statusArea.dataset.type = type;
  statusMessage.textContent = message;
}

function setProgress(progress, label) {
  progressTrack.hidden = false;
  progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  progressTrack.setAttribute("aria-valuenow", String(Math.round(progress)));
  progressLabel.textContent = label;
}

function setBusy(busy, label = "Transcribe audio") {
  isBusy = busy;
  audioInput.disabled = busy;
  transcribeButton.disabled = busy || !selectedFile;
  buttonLabel.textContent = label;
  buttonIcon.hidden = busy;
  buttonSpinner.hidden = !busy;
}

function loadTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = import("./transformers.web.js")
      .then(({ pipeline }) =>
        pipeline("automatic-speech-recognition", MODEL_ID, {
          progress_callback: ({ status, file, progress }) => {
            if (status === "progress" && Number.isFinite(progress)) {
              const percent = Math.round(progress);
              setStatus(`Downloading model${file ? ` · ${file}` : ""}`);
              setProgress(percent, `${percent}%`);
            } else if (status === "initiate") {
              setStatus(`Preparing model${file ? ` · ${file}` : ""}`);
              progressTrack.hidden = true;
              progressLabel.textContent = "";
            } else if (status === "done") {
              setStatus("Model file ready");
            }
          },
        }),
      )
      .catch((error) => {
        transcriberPromise = undefined;
        throw error;
      });
  }
  return transcriberPromise;
}

audioInput.addEventListener("change", () => {
  const [file] = audioInput.files ?? [];
  if (!file) return;

  if (audioUrl) URL.revokeObjectURL(audioUrl);
  selectedFile = file;
  audioUrl = URL.createObjectURL(file);
  audioPreview.src = audioUrl;
  fileName.textContent = file.name;
  selectedAudio.hidden = false;
  transcript.value = "";
  copyButton.disabled = true;
  progressTrack.hidden = true;
  progressLabel.textContent = "";
  setStatus("");
  transcribeButton.disabled = false;
});

transcribeButton.addEventListener("click", async () => {
  if (!selectedFile || isBusy) return;

  setBusy(true, "Loading model");
  progressTrack.hidden = true;
  progressLabel.textContent = "";
  setStatus("Loading the speech recognition model. The first download may take a moment.");

  try {
    const transcriber = await loadTranscriber();
    setStatus(`Transcribing ${selectedFile.name}…`);
    const result = await transcriber(audioUrl, {
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    if (!result || typeof result.text !== "string") {
      throw new Error("The model returned no transcript.");
    }

    transcript.value = result.text.trim();
    copyButton.disabled = transcript.value.length === 0;
    setStatus("Transcription complete.", "success");
    progressTrack.hidden = true;
    progressLabel.textContent = "";
  } catch (error) {
    console.error("Speech transcription failed:", error);
    setStatus(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    progressTrack.hidden = true;
    progressLabel.textContent = "";
  } finally {
    setBusy(false);
  }
});

copyButton.addEventListener("click", async () => {
  if (!transcript.value) return;

  try {
    await navigator.clipboard.writeText(transcript.value);
    setStatus("Transcript copied to clipboard.", "success");
  } catch (error) {
    console.error("Could not copy transcript:", error);
    setStatus("Could not access the clipboard. Select and copy the transcript instead.", "error");
  }
});

window.addEventListener("pagehide", () => {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
});
