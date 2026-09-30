// Camera + capture helpers for face verification and liveness (spec §9, §10).
//
// Real webcam captures use getUserMedia; frame quality metrics (brightness, detail
// variance, single-face confidence heuristic) are computed client-side on the canvas.
// When the environment has NO camera (headless test browsers, kiosks), a clearly
// labelled SIMULATED capture is generated so the sandbox flow stays end-to-end
// testable — the UI always states "Simulated capture" in that mode.

export interface CaptureFrame {
  dataUrl: string;
  brightness: number;
  variance: number;
  faceConfidence: number;
  simulated: boolean;
}

const W = 320;
const H = 240;

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function cameraAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function analyzeCanvas(ctx: CanvasRenderingContext2D): { brightness: number; variance: number } {
  const { data } = ctx.getImageData(0, 0, W, H);
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { brightness: mean, variance };
}

function drawSimulatedFace(ctx: CanvasRenderingContext2D): void {
  // Synthetic "person in frame": dark backdrop, warm oval, subtle noise. Clearly a
  // simulation — used only when no camera hardware is present.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1e293b");
  bg.addColorStop(1, "#0f172a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#d9a066";
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2 - 10, 62, 84, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d2005";
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2 - 90, 74, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(W / 2 - 18, H / 2 + 18, 12, 4);
  ctx.fillRect(W / 2 + 6, H / 2 + 18, 12, 4);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}

export async function captureFrame(
  video: HTMLVideoElement | null,
  simulated: boolean,
): Promise<CaptureFrame> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  if (simulated || !video || video.readyState < 2) {
    drawSimulatedFace(ctx);
    const { brightness, variance } = analyzeCanvas(ctx);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.85),
      brightness,
      variance,
      faceConfidence: 0.82,
      simulated: true,
    };
  }

  ctx.drawImage(video, 0, 0, W, H);
  const { brightness, variance } = analyzeCanvas(ctx);
  // Sandbox single-face heuristic: detail variance + centre-weighted luma contrast.
  const centre = analyzeCanvasRegion(ctx, W * 0.3, H * 0.15, W * 0.4, H * 0.6);
  const faceConfidence = Math.min(1, Math.max(0, variance * 5 + Math.abs(centre - brightness) * 1.5));
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.85),
    brightness,
    variance,
    faceConfidence,
    simulated: false,
  };
}

function analyzeCanvasRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const { data } = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }
  return sum / n;
}
