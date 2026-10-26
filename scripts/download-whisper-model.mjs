import { createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const modelRevision = "5332fcc35e32a33b86612b9a57a89be7906102b1";
const modelDirectory = fileURLToPath(
  new URL("../src/models/Xenova/whisper-tiny/", import.meta.url),
);
const onnxRuntimeDist = fileURLToPath(
  new URL("../node_modules/onnxruntime-web/dist/", import.meta.url),
);
const onnxRuntimeBundleDirectory = fileURLToPath(
  new URL("../src/vendor/onnxruntime-web/", import.meta.url),
);

const modelFiles = [
  ["config.json", 2248],
  ["generation_config.json", 3716],
  ["merges.txt", 493869],
  ["normalizer.json", 52666],
  ["onnx/decoder_model_merged_quantized.onnx", 30727765],
  ["onnx/encoder_model_quantized.onnx", 10124910],
  ["preprocessor_config.json", 339],
  ["special_tokens_map.json", 2194],
  ["tokenizer.json", 2480466],
  ["tokenizer_config.json", 282683],
  ["vocab.json", 1036584],
];

async function downloadModelFile(path, expectedSize) {
  const destination = join(modelDirectory, path);
  await mkdir(dirname(destination), { recursive: true });

  try {
    const existing = await stat(destination);
    if (existing.size === expectedSize) {
      console.log(`Using cached ${path}`);
      return;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const url = `https://huggingface.co/Xenova/whisper-tiny/resolve/${modelRevision}/${path}`;
  console.log(`Downloading ${path}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${path}: ${response.status} ${response.statusText}`);
  }

  const temporaryPath = `${destination}.${process.pid}.part`;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(temporaryPath, { flags: "w" }),
    );

    const downloaded = await stat(temporaryPath);
    if (downloaded.size !== expectedSize) {
      throw new Error(
        `Downloaded ${path} has ${downloaded.size} bytes; expected ${expectedSize}.`,
      );
    }

    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

await mkdir(modelDirectory, { recursive: true });
for (const [path, expectedSize] of modelFiles) {
  await downloadModelFile(path, expectedSize);
}

const runtimeFiles = [
  "ort.webgpu.min.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];

await mkdir(onnxRuntimeBundleDirectory, { recursive: true });
for (const file of runtimeFiles) {
  const source = join(onnxRuntimeDist, file);
  const destination = join(onnxRuntimeBundleDirectory, file);
  await copyFile(source, destination);
  console.log(`Bundled ONNX Runtime ${file}`);
}

console.log(`Whisper tiny model is ready in ${modelDirectory}`);
