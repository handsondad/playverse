function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function createIdleState() {
  return {
    tool: "pen",
    color: "#1f78ff",
    size: 8,
    templates: [],
    templateId: "",
    strokes: [],
    drawing: false,
    isPlaying: false,
    elapsedMs: 0,
    currentStroke: null,
  };
}

export class DoodleGame {
  constructor({ onStateChange, onToast }) {
    this.onStateChange = onStateChange;
    this.onToast = onToast;
    this.state = createIdleState();
  }

  init(templates) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    const defaultTemplateId = safeTemplates[0]?.id || "";
    this.state = {
      ...createIdleState(),
      templates: safeTemplates,
      templateId: defaultTemplateId,
    };
    this.emit();
  }

  setTool(tool) {
    this.state.tool = tool === "eraser" ? "eraser" : "pen";
    this.emit();
  }

  setColor(color) {
    this.state.color = color;
    this.emit();
  }

  setSize(size) {
    const value = Number(size);
    this.state.size = Number.isFinite(value) ? Math.min(26, Math.max(2, value)) : 8;
    this.emit();
  }

  setTemplate(templateId) {
    const found = this.state.templates.find((item) => item.id === templateId);
    if (!found) {
      return;
    }
    this.state.templateId = found.id;
    this.emit();
  }

  getActiveTemplate() {
    return this.state.templates.find((item) => item.id === this.state.templateId) || null;
  }

  beginStroke(point) {
    if (this.state.isPlaying) {
      this.onToast?.("播放中不能改画，先停止再继续涂鸦。");
      return;
    }

    const stroke = {
      tool: this.state.tool,
      color: this.state.color,
      size: this.state.size,
      points: [clonePoint(point)],
    };
    this.state.currentStroke = stroke;
    this.state.drawing = true;
    this.emit();
  }

  extendStroke(point) {
    if (!this.state.drawing || !this.state.currentStroke) {
      return;
    }
    const points = this.state.currentStroke.points;
    const prev = points[points.length - 1];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance < 1.8) {
      return;
    }
    points.push(clonePoint(point));
    this.emit();
  }

  endStroke() {
    if (!this.state.drawing || !this.state.currentStroke) {
      return;
    }

    const stroke = this.state.currentStroke;
    this.state.currentStroke = null;
    this.state.drawing = false;

    if (stroke.points.length > 0) {
      this.state.strokes = [...this.state.strokes, stroke];
    }
    this.emit();
  }

  undo() {
    if (this.state.isPlaying) {
      this.onToast?.("播放时不能撤销，先停止动画。");
      return;
    }
    if (this.state.strokes.length === 0) {
      return;
    }
    this.state.strokes = this.state.strokes.slice(0, -1);
    this.emit();
  }

  clear() {
    if (this.state.isPlaying) {
      this.onToast?.("播放时不能清空，先停止动画。");
      return;
    }
    this.state.strokes = [];
    this.state.currentStroke = null;
    this.state.drawing = false;
    this.emit();
  }

  startPlay() {
    if (this.state.strokes.length === 0) {
      this.onToast?.("先画一点内容，再播放动画。");
      return false;
    }
    this.state.isPlaying = true;
    this.state.elapsedMs = 0;
    this.emit();
    return true;
  }

  stopPlay() {
    this.state.isPlaying = false;
    this.state.elapsedMs = 0;
    this.emit();
  }

  exportSnapshot() {
    return {
      templateId: this.state.templateId,
      strokes: this.state.strokes.map((stroke) => ({
        tool: stroke.tool,
        color: stroke.color,
        size: stroke.size,
        points: stroke.points.map((point) => ({ x: point.x, y: point.y })),
      })),
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.strokes)) {
      return false;
    }

    const safeStrokes = snapshot.strokes
      .map((stroke) => ({
        tool: stroke.tool === "eraser" ? "eraser" : "pen",
        color: typeof stroke.color === "string" ? stroke.color : "#1f78ff",
        size: Number.isFinite(Number(stroke.size)) ? Math.min(26, Math.max(2, Number(stroke.size))) : 8,
        points: Array.isArray(stroke.points)
          ? stroke.points
              .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
              .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          : [],
      }))
      .filter((stroke) => stroke.points.length > 0);

    this.state.strokes = safeStrokes;
    this.state.currentStroke = null;
    this.state.drawing = false;
    this.state.isPlaying = false;
    this.state.elapsedMs = 0;

    if (typeof snapshot.templateId === "string") {
      const found = this.state.templates.find((item) => item.id === snapshot.templateId);
      if (found) {
        this.state.templateId = found.id;
      }
    }

    this.emit();
    return true;
  }

  tick(deltaMs) {
    if (!this.state.isPlaying) {
      return;
    }
    const active = this.getActiveTemplate();
    const duration = Number(active?.durationMs || 1200);
    const loop = active?.loop !== false;
    const next = this.state.elapsedMs + Math.max(0, deltaMs);
    if (loop) {
      this.state.elapsedMs = next % duration;
    } else {
      this.state.elapsedMs = Math.min(duration, next);
      if (this.state.elapsedMs >= duration) {
        this.state.isPlaying = false;
      }
    }
    this.emit();
  }

  getTransformForPreview() {
    const template = this.getActiveTemplate();
    if (!template || !this.state.isPlaying) {
      return { translateX: 0, translateY: 0, rotate: 0, scale: 1 };
    }

    const duration = Math.max(300, Number(template.durationMs || 1200));
    const progress = this.state.elapsedMs / duration;
    const angle = progress * Math.PI * 2;

    if (template.id === "jump-basic") {
      return {
        translateX: 0,
        translateY: -Math.sin(angle) * Number(template.amplitude || 20),
        rotate: (Math.sin(angle) * Number(template.rotateDeg || 5)) * (Math.PI / 180),
        scale: 1,
      };
    }

    if (template.id === "wave-hand") {
      return {
        translateX: Math.sin(angle) * Number(template.amplitude || 12),
        translateY: 0,
        rotate: (Math.sin(angle) * Number(template.rotateDeg || 10)) * (Math.PI / 180),
        scale: 1,
      };
    }

    if (template.id === "spin-round") {
      return {
        translateX: 0,
        translateY: 0,
        rotate: (progress * Number(template.rotateDeg || 360)) * (Math.PI / 180),
        scale: 1,
      };
    }

    return { translateX: 0, translateY: 0, rotate: 0, scale: 1 };
  }

  emit() {
    this.onStateChange?.({
      ...this.state,
      strokes: this.state.strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      })),
      currentStroke: this.state.currentStroke
        ? {
            ...this.state.currentStroke,
            points: this.state.currentStroke.points.map((point) => ({ ...point })),
          }
        : null,
      activeTemplate: this.getActiveTemplate(),
      previewTransform: this.getTransformForPreview(),
    });
  }
}
