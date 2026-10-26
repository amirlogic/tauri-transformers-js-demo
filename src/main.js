const MODEL_ID = "Xenova/whisper-tiny";

const audioInput = document.getElementById("audio-file");
const selectedAudio = document.getElementById("selected-audio");
const fileName = document.getElementById("file-name");
const audioPreview = document.getElementById("audio-preview");
const recordButton = document.getElementById("record-button");
const recordButtonLabel = document.getElementById("record-button-label");
const recordingTimer = document.getElementById("recording-timer");
const recordingTime = document.getElementById("recording-time");
const languageSelect = document.getElementById("language-select");
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
const exportButton = document.getElementById("export-button");

let selectedFile;
let audioUrl;
let transcriberPromise;
let isBusy = false;
let isRecording = false;
let recordingStream;
let mediaRecorder;
let recordingChunks = [];
let recordingError;
let recordingStartedAt;
let recordingInterval;

const whisperLanguages = [
  "english", "chinese", "german", "spanish", "russian", "korean", "french", "japanese",
  "portuguese", "turkish", "polish", "catalan", "dutch", "arabic", "swedish", "italian",
  "indonesian", "hindi", "finnish", "vietnamese", "hebrew", "ukrainian", "greek", "malay",
  "czech", "romanian", "danish", "hungarian", "tamil", "norwegian", "thai", "urdu",
  "croatian", "bulgarian", "lithuanian", "latin", "maori", "malayalam", "welsh", "slovak",
  "telugu", "persian", "latvian", "bengali", "serbian", "azerbaijani", "slovenian", "kannada",
  "estonian", "macedonian", "breton", "basque", "icelandic", "armenian", "nepali", "mongolian",
  "bosnian", "kazakh", "albanian", "swahili", "galician", "marathi", "punjabi", "sinhala",
  "khmer", "shona", "yoruba", "somali", "afrikaans", "occitan", "georgian", "belarusian",
  "tajik", "sindhi", "gujarati", "amharic", "yiddish", "lao", "uzbek", "faroese",
  "haitian creole", "pashto", "turkmen", "nynorsk", "maltese", "sanskrit", "luxembourgish",
  "myanmar", "tibetan", "tagalog", "malagasy", "assamese", "tatar", "hawaiian", "lingala",
  "hausa", "bashkir", "javanese", "sundanese",
];

for (const language of whisperLanguages) {
  const label = language.replace(/\b\w/g, (letter) => letter.toUpperCase());
  languageSelect.add(new Option(label, language));
}

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
  languageSelect.disabled = busy;
  recordButton.disabled = busy || isRecording;
  transcribeButton.disabled = busy || !selectedFile || isRecording;
  buttonLabel.textContent = label;
  buttonIcon.hidden = busy;
  buttonSpinner.hidden = !busy;
}

function setAudioFile(file) {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  selectedFile = file;
  audioUrl = URL.createObjectURL(file);
  audioPreview.src = audioUrl;
  fileName.textContent = file.name;
  selectedAudio.hidden = false;
  transcript.value = "";
  copyButton.disabled = true;
  exportButton.disabled = true;
  progressTrack.hidden = true;
  progressLabel.textContent = "";
  setStatus("");
  transcribeButton.disabled = isBusy || isRecording;
}

function formatRecordingTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateRecordingTime() {
  recordingTime.textContent = formatRecordingTime(Date.now() - recordingStartedAt);
}

function stopRecordingStream() {
  recordingStream?.getTracks().forEach((track) => track.stop());
  recordingStream = undefined;
  clearInterval(recordingInterval);
  recordingInterval = undefined;
}

async function startRecording() {
  if (isBusy || isRecording) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("Microphone recording is not supported by this browser.", "error");
    return;
  }

  isRecording = true;
  recordButton.disabled = true;
  audioInput.disabled = true;
  transcribeButton.disabled = true;
  recordButtonLabel.textContent = "Requesting microphone…";
  setStatus("Waiting for microphone permission.");

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    mediaRecorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    recordingChunks = [];
    recordingError = undefined;

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordingChunks.push(event.data);
    });
    mediaRecorder.addEventListener("error", (event) => {
      console.error("Microphone recording failed:", event.error);
      recordingError = event.error?.message ?? "Unknown microphone error.";
    });
    mediaRecorder.addEventListener("stop", () => {
      const recordedType = mediaRecorder.mimeType || recordingChunks[0]?.type || "audio/webm";
      const extension = recordedType.includes("ogg") ? "ogg" : recordedType.includes("mp4") ? "m4a" : "webm";
      const recordedFile = new File(recordingChunks, `microphone-recording.${extension}`, {
        type: recordedType,
      });

      stopRecordingStream();
      mediaRecorder = undefined;
      isRecording = false;
      recordButton.disabled = isBusy;
      audioInput.disabled = isBusy;
      recordButton.classList.remove("is-recording");
      recordButton.setAttribute("aria-pressed", "false");
      recordButtonLabel.textContent = "Record audio";
      recordingTimer.hidden = true;

      if (recordingError) {
        setStatus(`Recording failed: ${recordingError}`, "error");
        recordingChunks = [];
        return;
      }

      if (recordedFile.size === 0) {
        setStatus("No audio was captured. Check microphone access and try again.", "error");
        return;
      }

      setAudioFile(recordedFile);
      setStatus("Recording ready. Click Transcribe audio when you’re ready.", "success");
    });

    mediaRecorder.start();
    recordingStartedAt = Date.now();
    recordingTimer.hidden = false;
    recordingTime.textContent = "00:00";
    recordButton.disabled = false;
    recordButton.classList.add("is-recording");
    recordButton.setAttribute("aria-pressed", "true");
    recordButtonLabel.textContent = "Stop recording";
    recordingInterval = setInterval(updateRecordingTime, 1000);
    setStatus("Recording from microphone…");
  } catch (error) {
    stopRecordingStream();
    isRecording = false;
    mediaRecorder = undefined;
    recordButton.disabled = isBusy;
    audioInput.disabled = isBusy;
    transcribeButton.disabled = isBusy || !selectedFile;
    recordButton.classList.remove("is-recording");
    recordButton.setAttribute("aria-pressed", "false");
    recordButtonLabel.textContent = "Record audio";
    recordingTimer.hidden = true;
    console.error("Could not start microphone recording:", error);
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Could not access the microphone: ${message}`, "error");
  }
}

function loadTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = import("./transformers.web.js")
      .then(({ env, pipeline }) => {
        env.allowLocalModels = true;
        env.localModelPath = new URL("./models/", import.meta.url).href;
        const wasmDirectory = new URL("./vendor/onnxruntime-web/", import.meta.url);
        env.backends.onnx.wasm.wasmPaths = {
          mjs: new URL("ort-wasm-simd-threaded.asyncify.mjs", wasmDirectory).href,
          wasm: new URL("ort-wasm-simd-threaded.asyncify.wasm", wasmDirectory).href,
        };

        return pipeline("automatic-speech-recognition", MODEL_ID, {
          dtype: "q8",
          local_files_only: true,
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
        });
      })
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

  setAudioFile(file);
});

recordButton.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") {
    recordButton.disabled = true;
    recordButtonLabel.textContent = "Finishing recording…";
    setStatus("Finishing recording…");
    mediaRecorder.stop();
    return;
  }

  startRecording();
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
      language: languageSelect.value,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    if (!result || typeof result.text !== "string") {
      throw new Error("The model returned no transcript.");
    }

    transcript.value = result.text.trim();
    copyButton.disabled = transcript.value.length === 0;
    exportButton.disabled = transcript.value.length === 0;
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

exportButton.addEventListener("click", async () => {
  if (!transcript.value) return;

  const baseName = selectedFile?.name.replace(/\.[^.]+$/, "") || "transcript";
  const fileName = `${baseName}-transcript.txt`;

  try {
    if (window.__TAURI__?.dialog?.save && window.__TAURI__?.fs?.writeTextFile) {
      const filePath = await window.__TAURI__.dialog.save({
        defaultPath: fileName,
        filters: [{ name: "Text files", extensions: ["txt"] }],
      });

      if (!filePath) return;

      await window.__TAURI__.fs.writeTextFile(filePath, transcript.value);
      setStatus(`Transcript saved to ${filePath}.`, "success");
      return;
    }

    const downloadUrl = URL.createObjectURL(
      new Blob([transcript.value], { type: "text/plain;charset=utf-8" }),
    );
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    setStatus("Transcript download started.", "success");
  } catch (error) {
    console.error("Could not export transcript:", error);
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Could not export transcript: ${message}`, "error");
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
  stopRecordingStream();
});
