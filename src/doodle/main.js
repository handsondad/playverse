import { DoodleGame } from "./doodleGame.js";
import { bindUiTapSounds, createGameAudio } from "../shared/audio.js";

const GLOBAL_SETTINGS_KEY = "kids-global-settings";
const SETTINGS_KEY = "doodle-settings";
const WORKS_KEY = "doodle-works";
const MAX_WORKS = 12;

const FALLBACK_DATA = {
  templates: [
    { id: "jump-basic", name: "跳跃", durationMs: 1200, loop: true, amplitude: 26, rotateDeg: 6, hint: "上下弹跳，适合小怪兽和小球。" },
    { id: "wave-hand", name: "摆手", durationMs: 1400, loop: true, amplitude: 16, rotateDeg: 10, hint: "左右轻摆，像在打招呼。" },
    { id: "spin-round", name: "旋转", durationMs: 1600, loop: true, amplitude: 0, rotateDeg: 360, hint: "绕中心旋转，适合风车和星星。" },
  ],
};

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

const voiceBtn = document.querySelector("#voiceBtn");
const narrationBtn = document.querySelector("#narrationBtn");
const parentModeBtn = document.querySelector("#parentModeBtn");

const CARE_MODES = ["standard", "soft", "quiet"];
const settingsState = { voiceOn: true, careMode: "standard", narrationLevel: "key" };
const gameAudio = createGameAudio({ getCareMode: () => settingsState.careMode });

let latestState = null;
let templatesData = FALLBACK_DATA;
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

function careModeLabel(mode) {
  if (mode === "soft") {
    return "柔和";
  }
  if (mode === "quiet") {
    return "安静";
  }
  return "标准";
}

function nextCareMode(current) {
  const index = CARE_MODES.indexOf(current);
  return index === -1 ? "standard" : CARE_MODES[(index + 1) % CARE_MODES.length];
}

function loadSettings() {
  try {
    const globalParsed = JSON.parse(localStorage.getItem(GLOBAL_SETTINGS_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const merged = { ...localParsed, ...globalParsed };
    settingsState.voiceOn = merged.voiceOn !== false;
    settingsState.careMode = CARE_MODES.includes(merged.careMode) ? merged.careMode : "standard";
    settingsState.narrationLevel = merged.narrationLevel === "detailed" ? "detailed" : "key";
  } catch {
    settingsState.voiceOn = true;
    settingsState.careMode = "standard";
    settingsState.narrationLevel = "key";
  }
}

function saveSettings() {
  const payload = {
    voiceOn: settingsState.voiceOn,
    careMode: settingsState.careMode,
    narrationLevel: settingsState.narrationLevel,
    parentMode: settingsState.careMode !== "standard",
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(payload));
}

function speak(text) {
  if (!settingsState.voiceOn || !window.speechSynthesis || settingsState.careMode === "quiet") {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = settingsState.careMode === "standard" ? 1 : 0.92;
  window.speechSynthesis.speak(utterance);
}

function applySettingsUi() {
  voiceBtn.textContent = `语音引导：${settingsState.voiceOn ? "开" : "关"}`;
  narrationBtn.textContent = `播报模式：${settingsState.narrationLevel === "detailed" ? "详细" : "关键"}`;
  parentModeBtn.textContent = `护眼模式：${careModeLabel(settingsState.careMode)}`;
}

function formatDateTime(timeText) {
  const date = new Date(timeText);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function loadWorks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKS_KEY) || "[]");
    works = Array.isArray(parsed) ? parsed : [];
  } catch {
    works = [];
  }
}

function saveWorks() {
  localStorage.setItem(WORKS_KEY, JSON.stringify(works));
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

function buildShareCardDataUrl() {
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
  ctx.drawImage(drawCanvas, frameX, frameY, frameSize, frameSize);

  const date = new Date();
  const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  ctx.fillStyle = "#2f3b66";
  ctx.font = "bold 40px Microsoft YaHei";
  ctx.fillText(`动作模板：${latestState?.activeTemplate?.name || "未选择"}`, 92, 1188);
  ctx.font = "32px Microsoft YaHei";
  ctx.fillStyle = "#51608f";
  ctx.fillText(`笔画数量：${latestState?.strokes?.length || 0} 条`, 92, 1260);
  ctx.fillText(`配音状态：${recordedAudioBlob ? "已录制" : "未录制"}`, 92, 1320);
  ctx.fillText(`生成日期：${dateText}`, 92, 1380);

  return canvas.toDataURL("image/png", 0.92);
}

function exportShareCard() {
  if (!latestState || latestState.strokes.length === 0) {
    setExportStatus("先画点内容再导出图卡。");
    return;
  }

  const dataUrl = buildShareCardDataUrl();
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `doodle-card-${stamp}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setExportStatus("图卡已导出为 PNG，已开始下载。");
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getSupportedVideoMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

function canExportShortClip() {
  return typeof previewCanvas.captureStream === "function" && getSupportedVideoMimeType();
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
  if (!canExportShortClip()) {
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

  let stream = null;
  let recorder = null;
  let startedByExport = false;

  try {
    if (!latestState.isPlaying) {
      startedByExport = game.startPlay();
    }
    syncPlayVoice();
    await wait(120);

    stream = previewCanvas.captureStream(30);
    const mimeType = getSupportedVideoMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    const chunks = [];
    const stoppedPromise = new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.start(100);

    const templateDuration = latestState?.activeTemplate?.durationMs || 2000;
    const clipDuration = Math.min(4200, Math.max(1800, templateDuration));
    await wait(clipDuration);

    if (recorder.state === "recording") {
      recorder.stop();
    }
    await stoppedPromise;

    if (chunks.length === 0) {
      setExportStatus("导出失败：没有采集到画面数据，请重试。");
      return;
    }

    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `doodle-clip-${stamp}.webm`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportStatus("短动图已导出为 WebM，已开始下载。");

    if (startedByExport) {
      game.stopPlay();
      stopRecordedAudioPlayback();
    }
  } catch {
    setExportStatus("导出短动图失败，请稍后再试或先导出 PNG 图卡。");
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    isExportingClip = false;
    if (latestState) {
      updateUi(latestState);
    }
  }
}

function saveCurrentWork() {
  if (!latestState || latestState.strokes.length === 0) {
    guideText.textContent = "先画一些内容再保存作品。";
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
  guideText.textContent = `已保存作品：${newWork.name}`;
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
    guideText.textContent = "作品载入失败，数据格式不正确。";
    return;
  }
  guideText.textContent = `已载入：${work.name}，可以继续修改。`;
}

function deleteWorkById(workId) {
  const before = works.length;
  works = works.filter((item) => item.id !== workId);
  if (works.length === before) {
    return;
  }
  saveWorks();
  renderWorks();
  guideText.textContent = "作品已删除。";
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
    exportClipBtn.disabled = state.strokes.length === 0 || isRecording || isExportingClip || !canExportShortClip();
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
    guideText.textContent = text;
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

function bindSoftTap(button, handler) {
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    if (button.disabled) {
      return;
    }
    handler();
  });
  button.addEventListener("click", (event) => event.preventDefault());
}

async function bootstrap() {
  try {
    const response = await fetch("../../configs/levels/doodle-animation.templates.json");
    if (!response.ok) {
      throw new Error(`Failed to load templates: ${response.status}`);
    }
    templatesData = await response.json();
  } catch {
    templatesData = FALLBACK_DATA;
    guideText.textContent = "模板加载失败，已使用内置动作。";
  }

  const templates = Array.isArray(templatesData?.templates) && templatesData.templates.length > 0
    ? templatesData.templates
    : FALLBACK_DATA.templates;

  loadSettings();
  loadWorks();
  applySettingsUi();
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
    guideText.textContent = "动画开始啦，画好的角色动起来了。";
    speak(guideText.textContent);
  }
});

bindSoftTap(stopBtn, () => {
  gameAudio.place(280);
  game.stopPlay();
  stopRecordedAudioPlayback();
  guideText.textContent = "已停止播放，可以继续修改涂鸦。";
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

colorRow.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-color]");
  if (!button) {
    return;
  }
  event.preventDefault();
  colorRow.querySelectorAll(".color-btn").forEach((node) => node.classList.remove("is-active"));
  button.classList.add("is-active");
  game.setColor(button.dataset.color);
});

templateButtons.addEventListener("pointerup", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button) {
    return;
  }
  event.preventDefault();
  game.setTemplate(button.dataset.templateId);
  const template = latestState?.templates?.find((item) => item.id === button.dataset.templateId);
  if (template) {
    guideText.textContent = `已切换动作：${template.name}。${template.hint || ""}`;
  }
});

worksList.addEventListener("pointerup", (event) => {
  const loadBtn = event.target.closest("[data-load-work-id]");
  if (loadBtn) {
    event.preventDefault();
    loadWorkById(loadBtn.dataset.loadWorkId);
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-work-id]");
  if (deleteBtn) {
    event.preventDefault();
    deleteWorkById(deleteBtn.dataset.deleteWorkId);
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

bindSoftTap(voiceBtn, () => {
  settingsState.voiceOn = !settingsState.voiceOn;
  saveSettings();
  applySettingsUi();
});

bindSoftTap(narrationBtn, () => {
  settingsState.narrationLevel = settingsState.narrationLevel === "detailed" ? "key" : "detailed";
  saveSettings();
  applySettingsUi();
});

bindSoftTap(parentModeBtn, () => {
  settingsState.careMode = nextCareMode(settingsState.careMode);
  saveSettings();
  applySettingsUi();
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
