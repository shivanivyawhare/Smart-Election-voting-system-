import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Camera, CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { AuthMe, FaceSession, FaceVerifyOut, Voter } from "@/lib/types";
import { captureFrame, cameraAvailable, startCamera, stopCamera } from "@/lib/camera";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

function detail(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const d = (error.body as { detail?: string }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function FaceVerification() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<AuthMe>("/auth/me") });
  const voter = me.data?.user as Voter | undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"IDLE" | "STARTING" | "LIVE" | "DENIED" | "UNAVAILABLE">("IDLE");
  const [session, setSession] = useState<FaceSession | null>(null);
  const [result, setResult] = useState<FaceVerifyOut | null>(null);

  useEffect(() => () => stopCamera(streamRef.current), []);

  const createSession = useMutation({
    mutationFn: () => apiPost<FaceSession>("/face/session", { purpose: "voting" }),
    onSuccess: (data) => setSession(data),
    onError: (e) => toast.error(detail(e, "Could not start a verification session.")),
  });

  const verify = useMutation({
    mutationFn: async () => {
      let active = session;
      if (!active) active = await createSession.mutateAsync();
      const simulated = cameraState !== "LIVE";
      const frame = await captureFrame(videoRef.current, simulated);
      return apiPost<FaceVerifyOut>("/face/verify", {
        session_id: active.session_id,
        image: frame.dataUrl,
        brightness: frame.brightness,
        variance: frame.variance,
        face_confidence: frame.faceConfidence,
        simulated: frame.simulated,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.status === "VERIFIED") {
        toast.success("Face verified (sandbox)", { description: "Continue to the liveness check." });
        me.refetch();
      } else if (data.status === "LOCKED") {
        toast.error("Face verification locked", { description: data.reasons[0] });
      } else {
        toast.warning("Retry required", { description: data.reasons[0] });
      }
    },
    onError: (e) => {
      // A new session is needed if the previous one closed.
      setSession(null);
      toast.error(detail(e, "Face verification could not be completed. Please retry."));
    },
  });

  async function enableCamera() {
    if (!cameraAvailable()) { setCameraState("UNAVAILABLE"); return; }
    setCameraState("STARTING");
    try {
      const stream = await startCamera(videoRef.current!);
      streamRef.current = stream;
      setCameraState("LIVE");
    } catch {
      setCameraState("DENIED");
    }
  }

  if (voter?.face_verified && result?.status !== "RETRY_REQUIRED") {
    return (
      <div data-testid="face-already-verified">
        <PageHeader title="Face verification" description="Your face verification step is complete." />
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-heading font-bold text-emerald-800">Face verified (sandbox)</p>
              <p className="text-sm text-slate-600">No image was stored — only the verification result.</p>
            </div>
          </CardContent>
        </Card>
        <Link to="/voter/liveness" data-testid="face-next-liveness-link" className={cn(buttonVariants(), "mt-4")}>
            Continue to liveness <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
      </div>
    );
  }

  if (!voter?.identity_verified) {
    return (
      <div data-testid="face-blocked-no-identity">
        <PageHeader title="Face verification" description="Complete identity verification first." />
        <Card className="border-amber-200">
          <CardContent className="flex items-center gap-3 py-6">
            <TriangleAlert className="h-7 w-7 text-amber-500" aria-hidden="true" />
            <p className="text-sm text-slate-700">Identity verification must be completed before the face step.</p>
          </CardContent>
        </Card>
        <Link to="/voter/verify-identity" data-testid="face-go-identity-link" className={cn(buttonVariants(), "mt-4")}>Go to identity verification</Link>
      </div>
    );
  }

  return (
    <div data-testid="face-verification-page">
      <PageHeader
        title="Step 2 — Face verification"
        description="Centre your face in the frame. The capture is scored by the verification provider and then discarded — images are never stored."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="py-6">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl bg-[#020617]" data-testid="face-camera-viewport">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`h-full w-full object-cover ${cameraState === "LIVE" ? "" : "opacity-0"}`}
              />
              {/* Elliptical alignment guide + scanline */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[72%] w-[52%] rounded-[50%] border-2 border-emerald-400/80" aria-hidden="true" />
                {verify.isPending && (
                  <div className="absolute inset-x-8 h-0.5 bg-sky-400/80 animate-scanline" aria-hidden="true" />
                )}
              </div>
              {cameraState !== "LIVE" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <Camera className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="text-sm text-slate-300" data-testid="face-camera-message">
                    {cameraState === "DENIED"
                      ? "Camera permission was denied. You can still verify using a clearly-labelled simulated capture in this sandbox."
                      : cameraState === "UNAVAILABLE"
                        ? "No camera is available in this environment. A clearly-labelled simulated capture will be used."
                        : "Enable your camera to capture a live frame, or continue with a simulated sandbox capture."}
                  </p>
                  {(cameraState === "IDLE" || cameraState === "DENIED") && (
                    <Button size="sm" variant="outline" onClick={enableCamera} data-testid="face-enable-camera-button">
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      Enable camera
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => verify.mutate()} disabled={verify.isPending || result?.status === "LOCKED"} data-testid="face-capture-button">
                {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                {cameraState === "LIVE" ? "Capture & verify" : "Verify with simulated capture"}
              </Button>
              {result && result.status !== "VERIFIED" && result.status !== "LOCKED" && (
                <Button variant="outline" onClick={() => { setResult(null); verify.mutate(); }} disabled={verify.isPending} data-testid="face-retry-button">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
                </Button>
              )}
            </div>
            {cameraState !== "LIVE" && (
              <p className="mt-2 text-center text-xs font-semibold text-amber-700" data-testid="face-simulated-notice">
                Simulated capture (sandbox) — no real camera frame is used.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Positioning instructions</p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
                <li>• Centre your face inside the oval guide</li>
                <li>• Use even lighting; avoid strong backlight</li>
                <li>• Only one face must be in frame</li>
                <li>• Remove sunglasses or face coverings</li>
              </ul>
            </CardContent>
          </Card>

          <Card data-testid="face-status-card">
            <CardContent className="py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Verification status</p>
              {verify.isPending ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-sky-700" data-testid="face-status-value">
                  <Loader2 className="h-4 w-4 animate-spin" /> PROCESSING
                </p>
              ) : result ? (
                <div className="mt-3">
                  <p
                    className={`text-sm font-bold ${result.status === "VERIFIED" ? "text-emerald-700" : result.status === "LOCKED" ? "text-red-700" : "text-amber-700"}`}
                    data-testid="face-status-value"
                  >
                    {result.status}
                  </p>
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                        style={{ width: `${Math.round(result.confidence * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500" data-testid="face-confidence-value">
                      Confidence {(result.confidence * 100).toFixed(1)}% · attempts remaining {result.attempts_remaining} · provider {result.provider}
                    </p>
                  </div>
                  {result.reasons.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-800" data-testid="face-reasons">
                      {result.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                    </ul>
                  )}
                  {result.status === "VERIFIED" && (
                    <Link to="/voter/liveness" data-testid="face-continue-liveness-button" className={cn(buttonVariants(), "mt-4 w-full")}>
                        Continue to liveness <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm font-semibold text-slate-500" data-testid="face-status-value">PENDING</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
