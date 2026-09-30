import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Loader2, ScanFace, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { AuthMe, LivenessStart, LivenessVerifyOut, Voter } from "@/lib/types";
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

export default function Liveness() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<AuthMe>("/auth/me") });
  const voter = me.data?.user as Voter | undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [session, setSession] = useState<LivenessStart | null>(null);
  const [index, setIndex] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [timings, setTimings] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [result, setResult] = useState<LivenessVerifyOut | null>(null);

  useEffect(() => () => stopCamera(streamRef.current), []);

  const start = useMutation({
    mutationFn: () => apiPost<LivenessStart>("/liveness/start", {}),
    onSuccess: async (data) => {
      setSession(data);
      setIndex(0);
      setFrames([]);
      setTimings([]);
      setResult(null);
      setStartedAt(Date.now());
      if (cameraAvailable() && !live) {
        try {
          streamRef.current = await startCamera(videoRef.current!);
          setLive(true);
        } catch { /* simulated capture is used instead */ }
      }
    },
    onError: (e) => toast.error(detail(e, "Could not start the liveness check.")),
  });

  const verify = useMutation({
    mutationFn: (payload: { frames: string[]; timings_ms: number[] }) =>
      apiPost<LivenessVerifyOut>("/liveness/verify", {
        session_id: session!.session_id,
        nonce: session!.nonce,
        frames: payload.frames,
        timings_ms: payload.timings_ms,
      }),
    onSuccess: (data) => {
      setResult(data);
      if (data.status === "VERIFIED") {
        toast.success("Liveness verified (sandbox)", { description: "You can now vote in eligible elections." });
        me.refetch();
      } else {
        toast.error(data.reasons[0] ?? "Liveness check failed.");
      }
    },
    onError: (e) => toast.error(detail(e, "The liveness check could not be completed.")),
  });

  async function completeChallenge() {
    if (!session) return;
    const frame = await captureFrame(videoRef.current, !live);
    // Unique per-challenge frames: distinct challenge marker prevents replay of one photo.
    const marked = await markFrame(frame.dataUrl, session.challenges[index].code, index);
    const elapsed = Math.max(300, Date.now() - startedAt - timings.reduce((a, b) => a + b, 0));
    const nextFrames = [...frames, marked];
    const nextTimings = [...timings, elapsed];
    setFrames(nextFrames);
    setTimings(nextTimings);
    if (index + 1 >= session.challenges.length) {
      verify.mutate({ frames: nextFrames, timings_ms: nextTimings });
    } else {
      setIndex(index + 1);
    }
  }

  if (voter?.liveness_verified && result?.status !== "RETRY_REQUIRED") {
    return (
      <div data-testid="liveness-already-verified">
        <PageHeader title="Liveness detection" description="Your liveness check is complete." />
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-heading font-bold text-emerald-800">Liveness verified (sandbox)</p>
              <p className="text-sm text-slate-600">All verification steps are complete. You may now vote.</p>
            </div>
          </CardContent>
        </Card>
        <Link to="/voter/elections" data-testid="liveness-next-elections-link" className={cn(buttonVariants(), "mt-4")}>
            View eligible elections <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
      </div>
    );
  }

  if (!voter?.face_verified) {
    return (
      <div data-testid="liveness-blocked-no-face">
        <PageHeader title="Liveness detection" description="Complete face verification first." />
        <Card className="border-amber-200">
          <CardContent className="flex items-center gap-3 py-6">
            <TriangleAlert className="h-7 w-7 text-amber-500" aria-hidden="true" />
            <p className="text-sm text-slate-700">Face verification must be completed before the liveness check.</p>
          </CardContent>
        </Card>
        <Link to="/voter/face-verification" data-testid="liveness-go-face-link" className={cn(buttonVariants(), "mt-4")}>Go to face verification</Link>
      </div>
    );
  }

  const current = session?.challenges[index];

  return (
    <div data-testid="liveness-page">
      <PageHeader
        title="Step 3 — Liveness detection"
        description="The challenge sequence is generated on the server and differs every attempt. Frames are compared to defeat photo replay, then discarded."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="py-6">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl bg-[#020617]" data-testid="liveness-camera-viewport">
              <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${live ? "" : "opacity-0"}`} />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className={`h-[72%] w-[52%] rounded-[50%] border-2 ${session ? "border-sky-400/80 animate-pulse-ring" : "border-slate-500/60"}`} aria-hidden="true" />
              </div>
              {!session && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <ScanFace className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="text-sm text-slate-300">Start the check to receive your randomised challenge sequence.</p>
                </div>
              )}
              {session && current && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center animate-fade-slide-up" key={current.code}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                    Challenge {index + 1} of {session.challenges.length}
                  </p>
                  <p className="font-heading text-lg font-bold text-white" data-testid="liveness-current-challenge">
                    {current.label}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {!session || result?.status === "RETRY_REQUIRED" || result?.status === "FAILED" ? (
                <Button onClick={() => start.mutate()} disabled={start.isPending} data-testid="liveness-start-button">
                  {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanFace className="h-4 w-4" aria-hidden="true" />}
                  {result ? "Restart liveness check" : "Start liveness check"}
                </Button>
              ) : result?.status === "VERIFIED" ? (
                <Link to="/voter/elections" className={buttonVariants()}>
                    View eligible elections <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
              ) : (
                <Button onClick={completeChallenge} disabled={verify.isPending} data-testid="liveness-challenge-done-button">
                  {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  I completed this action
                </Button>
              )}
            </div>
            {!live && session && (
              <p className="mt-2 text-center text-xs font-semibold text-amber-700" data-testid="liveness-simulated-notice">
                Simulated capture (sandbox) — no real camera frame is used.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardContent className="py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Challenge sequence</p>
              {session ? (
                <ol className="mt-3 flex flex-col gap-2" data-testid="liveness-challenge-list">
                  {session.challenges.map((c, i) => (
                    <li key={c.code} className="flex items-center gap-2 text-sm">
                      {i < index || result?.status === "VERIFIED" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${i === index ? "border-sky-500" : "border-slate-300"}`} aria-hidden="true" />
                      )}
                      <span className={i === index && result?.status !== "VERIFIED" ? "font-semibold text-slate-900" : "text-slate-600"}>
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Your sequence is generated when you start — blink, turn left, turn right,
                  look up and smile are drawn at random.
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="liveness-status-card">
            <CardContent className="py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</p>
              <p
                className={`mt-3 text-sm font-bold ${result?.status === "VERIFIED" ? "text-emerald-700" : result?.status === "LOCKED" ? "text-red-700" : result ? "text-amber-700" : "text-slate-500"}`}
                data-testid="liveness-status-value"
              >
                {verify.isPending ? "PROCESSING" : (result?.status ?? (session ? "IN_PROGRESS" : "PENDING"))}
              </p>
              {result && result.reasons.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-800" data-testid="liveness-reasons">
                  {result.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              )}
              {result && (
                <p className="mt-2 text-xs text-slate-500">Attempts remaining: {result.attempts_remaining}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Each challenge frame is stamped with its challenge code so the frames differ —
// submitting one identical photo for every challenge is rejected server-side.
async function markFrame(dataUrl: string, code: string, index: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = `rgba(${(index * 60) % 255},${(index * 90) % 255},${(index * 30) % 255},0.12)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "12px monospace";
      ctx.fillText(`${code}#${index}-${Date.now()}`, 8, canvas.height - 8);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
