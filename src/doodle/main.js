import { DoodleGame } from "./doodleGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";
import { loadSettings } from "../shared/settings.js";
import { mountSettingsButtons } from "../shared/settingsButtons.js";
import { SPEECH_PRESETS, createSpeaker } from "../shared/speech.js";
import { bindDelegatedTap, bindSoftTap } from "../shared/tap.js";
import { readJson, writeJson } from "../shared/storage.js";
import { loadGameConfig, showConfigError } from "../shared/config.js";
import { setText } from "../shared/dom.js";
import { buildShareCard, canRecordClip, downloadUrl, fileStamp, recordClip, wait } from "./share.js";

const SETTINGS_KEY = "doodle-settings";
const WORKS_KEY = "doodle-works";
const MAX_WORKS = 12;

const penBtn = document.querySelector("#penBtn");
const eraserBtn = document.querySelector("#eraserBtn");
const undoBtn = document.querySelector("#undoBtn");
const clearBtn = document.querySelector("#clearBtn");
const playBtn = document.querySelector("#playBtn");
const stopBtn = document.querySelector("#stopBtn");
const recordBtn = document.querySelector("#recordBtn");
const stopRecordBtn = document.querySelector("#stopRecordBtn");
const playVoiceBtn = document.querySelector("#playVoiceBtn");
const clearVoiceBtn = document.querySelector("#clearVoiceBtn");
const recordStatus = document.querySelector("#recordStatus");
const saveWorkBtn = document.querySelector("#saveWorkBtn");
const worksStatus = document.querySelector("#worksStatus");
const worksList = document.querySelector("#worksList");
const exportCardBtn = document.querySelector("#exportCardBtn");
const exportClipBtn = document.querySelector("#exportClipBtn");
const exportStatus = document.querySelector("#exportStatus");
const sizeRange = document.querySelector("#sizeRange");
const colorRow = document.querySelector("#colorRow");
const templateButtons = document.querySelector("#templateButtons");
const templateHint = document.querySelector("#templateHint");
const drawStats = document.querySelector("#drawStats");
const previewState = document.querySelector("#previewState");
const guideText = document.querySelector("#guideText");
const drawCanvas = document.querySelector("#drawCanvas");
const previewCanvas = document.querySelector("#previewCanvas");

const settingsState = loadSettings(SETTINGS_KEY);
const speak = createSpeaker(settingsState, SPEECH_PRESETS.standard);
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let latestState = null;
let templatesData = null;
let rafId = 0;
let lastFrameTime = 0;
let mediaRecorder = null;
let mediaStream = null;
let recordChunks = [];
let recordedAudioBlob = null;
let recordedAudioUrl = "";
let recordedAudio = null;
let isRecording = false;
let recordStartedAt = 0;
let autoStopTimer = 0;
let works = [];
let isExportingClip = false;

function formatDateTime(timeText) {
  const date = new Date(timeText);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function loadWorks() {
  const parsed = readJson(WORKS_KEY, []);
  works = Array.isArray(parsed) ? parsed : [];
}

function saveWorks() {
  writeJson(WORKS_KEY, works);
}

function renderWorks() {
  if (!worksList || !worksStatus) {
    return;
  }

  if (works.length === 0) {
    worksList.innerHTML = "";
    worksStatus.textContent = "还没有保存的作品，画完后点击保存即可。";
    return;
  }

  worksStatus.textContent = `已保存 ${works.length} 个作品，点击“载入”可继续创作。`;
  worksList.innerHTML = works.map((work) => {
    const strokesCount = Array.isArray(work.snapshot?.strokes) ? work.snapshot.strokes.length : 0;
    return `
      <article class="work-card" data-work-id="${work.id}">
        <img class="work-thumb" src="${work.thumbnail}" alt="作品缩略图" />
        <div class="work-meta">
          <strong>${work.name}</strong>
          <span>${formatDateTime(work.updatedAt)}</span>
        </div>
        <div class="work-meta">
          <span>模板：${work.templateName || "未设置"}</span>
          <span>笔画：${strokesCount}</span>
        </div>
        <div class="work-actions">
          <button class="load-work-btn" type="button" data-load-work-id="${work.id}">载入</button>
          <button class="delete-work-btn" type="button" data-delete-work-id="${work.id}">删除</button>
        </div>
      </article>
    `;
  }).join("");
}

function createThumbnail() {
  return drawCanvas.toDataURL("image/png", 0.9);
}

function exportShareCard() {
  if (!latestState || latestState.strokes.length === 0) {
    setExportStatus("先画点内容再导出图卡。");
    return;
  }

  const dataUrl = buildShareCard(drawCanvas, {
    templateName: latestState.activeTemplate?.name,
    strokeCount: latestState.strokes.length,
    hasVoice: Boolean(recordedAudioBlob),
  });
  downloadUrl(dataUrl, `doodle-card-${fileStamp()}.png`);
  setExportStatus("图卡已导出为 PNG，已开始下载。");
}

async function exportShortClip() {
  if (!latestState || latestState.strokes.length === 0) {
    setExportStatus("先画点内容再导出短动图。");
    return;
  }
  if (isRecording) {
    setExportStatus("录音进行中，请先结束录音再导出短动图。");
    return;
  }
  if (!canRecordClip(previewCanvas)) {
    setExportStatus("当前浏览器不支持短动图导出，可先导出 PNG 图卡。");
    return;
  }
  if (isExportingClip) {
    return;
  }

  isExportingClip = true;
  playBtn.disabled = true;
  if (exportCardBtn) {
    exportCardBtn.disabled = true;
  }
  if (exportClipBtn) {
    exportClipBtn.disabled = true;
  }
  setExportStatus("正在导出短动图，请稍候...");

  let startedByExport = false;

  try {
    if (!latestState.isPlaying) {
      startedByExport = game.startPlay();
    }
    syncPlayVoice();
    await wait(120);

    const templateDuration = latestState?.activeTemplate?.durationMs || 2000;
    const blob = await recordClip(previewCanvas, Math.min(4200, Math.max(1800, templateDuration)));
    if (!blob) {
      setExportStatus("导出失败：没有采集到画面数据，请重试。");
      return;
    }

    const url = URL.createObjectURL(blob);
    downloadUrl(url, `doodle-clip-${fileStamp()}.webm`);
    URL.revokeObjectURL(url);
    setExportStatus("短动图已导出为 WebM，已开始下载。");

    if (startedByExport) {
      game.stopPlay();
      stopRecordedAudioPlayback();
    }
  } catch {
    setExportStatus("导出短动图失败，请稍后再试或先导出 PNG 图卡。");
  } finally {
    isExportingClip = false;
    if (latestState) {
      updateUi(latestState);
    }
  }
}

function saveCurrentWork() {
  if (!latestState || latestState.strokes.length === 0) {
    setText(guideText, "先画一些内容再保存作品。");
    return;
  }

  const snapshot = game.exportSnapshot();
  const activeTemplate = latestState.activeTemplate;
  const now = new Date().toISOString();
  const newWork = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `作品 ${works.length + 1}`,
    createdAt: now,
    updatedAt: now,
    templateName: activeTemplate?.name || "未设置",
    thumbnail: createThumbnail(),
    snapshot,
  };

  works = [newWork, ...works].slice(0, MAX_WORKS);
  saveWorks();
  renderWorks();
  setText(guideText, `已保存作品：${newWork.name}`);
}

function loadWorkById(workId) {
  const work = works.find((item) => item.id === workId);
  if (!work) {
    return;
  }
  if (latestState?.isPlaying) {
    game.stopPlay();
  }
  stopRecordedAudioPlayback();

  const ok = game.loadSnapshot(work.snapshot);
  if (!ok) {
    setText(guideText, "作品载入失败，数据格式不正确。");
    return;
  }
  setText(guideText, `已载入：${work.name}，可以继续修改。`);
}

function deleteWorkById(workId) {
  const before = works.length;
  works = works.filter((item) => item.id !== workId);
  if (works.length === before) {
    return;
  }
  saveWorks();
  renderWorks();
  setText(guideText, "作品已删除。");
}

function stopRecordedAudioPlayback() {
  if (!recordedAudio) {
    return;
  }
  recordedAudio.pause();
  recordedAudio.currentTime = 0;
}

function setRecordStatus(text) {
  recordStatus.textContent = text;
}

function setExportStatus(text) {
  if (!exportStatus) {
    return;
  }
  exportStatus.textContent = text;
}

function clearRecordedAudio(keepMessage = false) {
  stopRecordedAudioPlayback();
  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
  }
  recordedAudioBlob = null;
  recordedAudioUrl = "";
  recordedAudio = null;
  if (!keepMessage) {
    setRecordStatus("还没有配音。点击“开始录音”即可录制。");
  }
}

function formatSecondText(seconds) {
  return `${Math.max(0, Number(seconds || 0)).toFixed(1)} 秒`;
}

function updateRecordButtons() {
  recordBtn.disabled = isRecording;
  stopRecordBtn.disabled = !isRecording;
  playVoiceBtn.disabled = !recordedAudioBlob || isRecording;
  clearVoiceBtn.disabled = !recordedAudioBlob || isRecording;
}

function startAutoStopTimer() {
  if (autoStopTimer) {
    window.clearTimeout(autoStopTimer);
  }
  autoStopTimer = window.setTimeout(() => {
    stopRecording();
  }, 10000);
}

function stopAutoStopTimer() {
  if (!autoStopTimer) {
    return;
  }
  window.clearTimeout(autoStopTimer);
  autoStopTimer = 0;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setRecordStatus("当前设备不支持录音权限接口。请换用支持麦克风的浏览器。");
    return;
  }
  if (isRecording) {
    return;
  }
  if (latestState?.isPlaying) {
    game.stopPlay();
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream);
  } catch {
    setRecordStatus("未获取到麦克风权限，请允许录音后再试。");
    return;
  }

  clearRecordedAudio(true);
  recordChunks = [];
  isRecording = true;
  recordStartedAt = Date.now();
  setRecordStatus("录音中... 最长 10 秒，至少录到 3 秒。再次点“结束录音”保存。");
  updateRecordButtons();

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const durationMs = Date.now() - recordStartedAt;
    isRecording = false;
    updateRecordButtons();
    stopAutoStopTimer();

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }
    mediaStream = null;

    if (durationMs < 3000 || recordChunks.length === 0) {
      clearRecordedAudio(true);
      setRecordStatus(`录音时长只有 ${formatSecondText(durationMs / 1000)}，请录满 3 秒后再保存。`);
      return;
    }

    recordedAudioBlob = new Blob(recordChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);
    recordedAudio = new Audio(recordedAudioUrl);
    setRecordStatus(`配音已保存，时长 ${formatSecondText(durationMs / 1000)}。播放动画时会自动同步。`);
  };

  mediaRecorder.start();
  startAutoStopTimer();
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) {
    return;
  }
  if (mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

function playRecordedVoicePreview() {
  if (!recordedAudio) {
    return;
  }
  stopRecordedAudioPlayback();
  recordedAudio.play().catch(() => {
    setRecordStatus("试听失败，请重新录制一次。");
  });
}

function syncPlayVoice() {
  if (!recordedAudio) {
    return;
  }
  stopRecordedAudioPlayback();
  recordedAudio.play().catch(() => {
    setRecordStatus("配音播放失败，请重试或重新录制。");
  });
}

function getCanvasPos(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

function drawStroke(ctx, stroke) {
  if (!stroke.points || stroke.points.length === 0) {
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.size;
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = stroke.color;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.arc(p.x, p.y, Math.max(1, stroke.size / 2), 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

function renderEditor(state) {
  const ctx = drawCanvas.getContext("2d");
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

  for (const stroke of state.strokes) {
    drawStroke(ctx, stroke);
  }
  if (state.currentStroke) {
    drawStroke(ctx, state.currentStroke);
  }
}

function renderPreview(state) {
  const ctx = previewCanvas.getContext("2d");
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, previewCanvas.height);
  gradient.addColorStop(0, "#f8fbff");
  gradient.addColorStop(1, "#f0fff7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  const baseScale = Math.min(
    previewCanvas.width / drawCanvas.width,
    previewCanvas.height / drawCanvas.height,
  );
  const stageWidth = drawCanvas.width * baseScale;
  const stageHeight = drawCanvas.height * baseScale;
  const offsetX = (previewCanvas.width - stageWidth) * 0.5;
  const offsetY = (previewCanvas.height - stageHeight) * 0.5;

  ctx.save();
  const transform = state.previewTransform || { translateX: 0, translateY: 0, rotate: 0, scale: 1 };
  ctx.translate(
    offsetX + stageWidth * 0.5 + transform.translateX * baseScale,
    offsetY + stageHeight * 0.5 + transform.translateY * baseScale,
  );
  ctx.rotate(transform.rotate);
  ctx.scale(baseScale * transform.scale, baseScale * transform.scale);
  ctx.translate(-(drawCanvas.width * 0.5), -(drawCanvas.height * 0.5));
  for (const stroke of state.strokes) {
    drawStroke(ctx, stroke);
  }
  ctx.restore();
}

function updateTemplateButtons(state) {
  templateButtons.innerHTML = state.templates.map((template) => {
    const cls = template.id === state.templateId ? "template-btn is-active" : "template-btn";
    return `<button class="${cls}" data-template-id="${template.id}" type="button"><strong>${template.name}</strong><small>${template.hint || ""}</small></button>`;
  }).join("");
}

function updateUi(state) {
  latestState = state;
  drawStats.textContent = `笔画 ${state.strokes.length} 条`;
  previewState.textContent = state.isPlaying
    ? `播放中：${state.activeTemplate?.name || "动作"}`
    : `等待播放：${state.activeTemplate?.name || "未选择动作"}`;
  penBtn.classList.toggle("is-active", state.tool === "pen");
  eraserBtn.classList.toggle("is-active", state.tool === "eraser");
  stopBtn.disabled = !state.isPlaying;
  playBtn.disabled = state.strokes.length === 0 || isRecording || isExportingClip;
  if (exportCardBtn) {
    exportCardBtn.disabled = state.strokes.length === 0 || isRecording || isExportingClip;
  }
  if (exportClipBtn) {
    exportClipBtn.disabled = state.strokes.length === 0 || isRecording || isExportingClip || !canRecordClip(previewCanvas);
  }
  updateRecordButtons();

  renderEditor(state);
  renderPreview(state);
  updateTemplateButtons(state);

  if (state.activeTemplate) {
    templateHint.textContent = state.activeTemplate.hint || "选择动作后点击播放。";
  }
}

const game = new DoodleGame({
  onStateChange: updateUi,
  onToast: (text) => {
    setText(guideText, text);
    if (settingsState.narrationLevel === "detailed") {
      speak(text);
    }
  },
});

bindUiTapSounds(document.body, gameAudio);

function frame(now) {
  if (!lastFrameTime) {
    lastFrameTime = now;
  }
  const delta = now - lastFrameTime;
  lastFrameTime = now;
  game.tick(delta);
  rafId = window.requestAnimationFrame(frame);
}

function startLoop() {
  if (rafId) {
    return;
  }
  rafId = window.requestAnimationFrame(frame);
}

async function bootstrap() {
  try {
    templatesData = await loadGameConfig("../../configs/levels/doodle-animation.templates.json", ["templates"]);
  } catch (error) {
    showConfigError(error);
    return;
  }

  const templates = templatesData.templates;

  loadWorks();
  game.init(templates);
  renderWorks();
  updateRecordButtons();
  startLoop();
}

bindSoftTap(penBtn, () => game.setTool("pen"));
bindSoftTap(eraserBtn, () => game.setTool("eraser"));
bindSoftTap(undoBtn, () => game.undo());
bindSoftTap(clearBtn, () => game.clear());

bindSoftTap(playBtn, () => {
  if (game.startPlay()) {
    gameAudio.success();
    syncPlayVoice();
    setText(guideText, "动画开始啦，画好的角色动起来了。");
    speak(guideText.textContent);
  }
});

bindSoftTap(stopBtn, () => {
  gameAudio.place(280);
  game.stopPlay();
  stopRecordedAudioPlayback();
  setText(guideText, "已停止播放，可以继续修改涂鸦。");
});

bindSoftTap(recordBtn, () => {
  startRecording();
});

bindSoftTap(stopRecordBtn, () => {
  stopRecording();
});

bindSoftTap(playVoiceBtn, () => {
  playRecordedVoicePreview();
});

bindSoftTap(clearVoiceBtn, () => {
  clearRecordedAudio();
  updateRecordButtons();
});

bindSoftTap(saveWorkBtn, () => {
  gameAudio.sparkle();
  saveCurrentWork();
});

bindSoftTap(exportCardBtn, () => {
  gameAudio.sparkle(940);
  exportShareCard();
});

bindSoftTap(exportClipBtn, () => {
  gameAudio.success(900);
  exportShortClip();
});

sizeRange.addEventListener("input", () => {
  game.setSize(Number(sizeRange.value));
});

bindDelegatedTap(colorRow, "[data-color]", (button) => {
  colorRow.querySelectorAll(".color-btn").forEach((node) => node.classList.remove("is-active"));
  button.classList.add("is-active");
  game.setColor(button.dataset.color);
});

bindDelegatedTap(templateButtons, "[data-template-id]", (button) => {
  game.setTemplate(button.dataset.templateId);
  const template = latestState?.templates?.find((item) => item.id === button.dataset.templateId);
  if (template) {
    setText(guideText, `已切换动作：${template.name}。${template.hint || ""}`);
  }
});

bindDelegatedTap(worksList, "[data-load-work-id], [data-delete-work-id]", (button) => {
  if (button.dataset.loadWorkId) {
    loadWorkById(button.dataset.loadWorkId);
    return;
  }
  if (button.dataset.deleteWorkId) {
    deleteWorkById(button.dataset.deleteWorkId);
  }
});

let pointerActive = false;

drawCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  drawCanvas.setPointerCapture(event.pointerId);
  pointerActive = true;
  game.beginStroke(getCanvasPos(drawCanvas, event));
});

drawCanvas.addEventListener("pointermove", (event) => {
  if (!pointerActive) {
    return;
  }
  event.preventDefault();
  game.extendStroke(getCanvasPos(drawCanvas, event));
});

const endPointer = (event) => {
  if (!pointerActive) {
    return;
  }
  event.preventDefault();
  pointerActive = false;
  game.endStroke();
};

drawCanvas.addEventListener("pointerup", endPointer);
drawCanvas.addEventListener("pointercancel", endPointer);
drawCanvas.addEventListener("pointerleave", endPointer);

mountSettingsButtons({
  storageKey: SETTINGS_KEY,
  settings: settingsState,
  bindTap: bindSoftTap,
});

window.addEventListener("beforeunload", () => {
  stopRecording();
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
  stopAutoStopTimer();
  clearRecordedAudio(true);
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
});

bootstrap();
