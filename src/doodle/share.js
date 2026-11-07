import { todayString } from "../shared/random.js";

// Canvas-to-file helpers behind the 导出 buttons. No game state lives here.

export function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function fileStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function downloadUrl(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}

export function buildShareCard(drawing, { templateName, strokeCount, hasVoice }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#f2f7ff");
  gradient.addColorStop(1, "#f0fff7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#6f82f0";
  ctx.fillRect(0, 0, canvas.width, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px Microsoft YaHei";
  ctx.fillText("我的涂鸦互动动画", 58, 92);

  const frameX = 86;
  const frameY = 214;
  const frameSize = 908;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(frameX - 16, frameY - 16, frameSize + 32, frameSize + 32);
  ctx.strokeStyle = "#d6deff";
  ctx.lineWidth = 4;
  ctx.strokeRect(frameX - 16, frameY - 16, frameSize + 32, frameSize + 32);
  ctx.drawImage(drawing, frameX, frameY, frameSize, frameSize);

  ctx.fillStyle = "#2f3b66";
  ctx.font = "bold 40px Microsoft YaHei";
  ctx.fillText(`动作模板：${templateName || "未选择"}`, 92, 1188);
  ctx.font = "32px Microsoft YaHei";
  ctx.fillStyle = "#51608f";
  ctx.fillText(`笔画数量：${strokeCount} 条`, 92, 1260);
  ctx.fillText(`配音状态：${hasVoice ? "已录制" : "未录制"}`, 92, 1320);
  ctx.fillText(`生成日期：${todayString()}`, 92, 1380);

  return canvas.toDataURL("image/png", 0.92);
}

function videoMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

export function canRecordClip(canvas) {
  return typeof canvas.captureStream === "function" && Boolean(videoMimeType());
}

// Resolves with the recorded WebM, or null when no frames were captured.
export async function recordClip(canvas, durationMs) {
  const stream = canvas.captureStream(30);
  try {
    const mimeType = videoMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.start(100);
    await wait(durationMs);
    if (recorder.state === "recording") {
      recorder.stop();
    }
    await stopped;
    return chunks.length ? new Blob(chunks, { type: recorder.mimeType || "video/webm" }) : null;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
