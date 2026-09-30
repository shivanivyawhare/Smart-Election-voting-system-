import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes, CheckCircle2, Fingerprint, Lock, ScanFace, ShieldCheck, Vote,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PublicElection } from "@/lib/types";
import { fmtDate, statusTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const PILLARS = [
  {
    icon: Fingerprint,
    title: "Identity & Face Verification",
    text: "Voters verify through an identity-provider flow with explicit consent, then a camera-based face check — captures are analysed and discarded, never stored.",
  },
  {
    icon: ScanFace,
    title: "Server-Driven Liveness",
    text: "A randomised challenge sequence (blink, turn, smile) is generated server-side with replay protection, defeating photos, videos and automation.",
  },
  {
    icon: Boxes,
    title: "Tamper-Evident Ledger",
    text: "Every election event and vote commitment is hash-chained into an append-only ledger. One click re-verifies the entire chain.",
  },
];

const PROTECTIONS = [
  "AES-256-GCM encryption of every ballot at rest",
  "Cryptographic separation of identity and ballot systems",
  "Database-enforced one-vote-per-voter constraint",
  "Idempotent vote casting with signed receipts",
  "Append-only, hash-chained audit log",
  "Role-based admin access — no role can see a voter's choice",
];

export default function Home() {
  const elections = useQuery({
    queryKey: ["public", "elections"],
    queryFn: () => apiGet<PublicElection[]>("/elections/public"),
    retry: false,
    staleTime: 30_000,
  });
  const live = (elections.data ?? []).filter((e) => e.status === "OPEN").slice(0, 2);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0B192C]" data-testid="home-hero">
        <img
          src="https://images.unsplash.com/photo-1523292562811-8fa7962a78c8?crop=entropy&cs=srgb&fm=jpg&q=85"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(11,25,44,0.95) 0%, rgba(15,32,56,0.92) 100%)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Verifiable · Secret Ballot · Sandbox Environment
          </span>
          <h1 className="mt-6 max-w-3xl font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Secure digital elections, verifiable end to end.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">
            A layered voting platform combining identity verification, face and liveness
            checks, secret-ballot cryptography, automatic counting and a tamper-evident
            hash-chained ledger — built as a production-oriented final-year system.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/voter/login" data-testid="home-cta-voter-login" className={cn(buttonVariants({ size: "lg" }), "bg-[#1D4ED8] hover:bg-[#1e40af]")}>
              Enter Voter Portal
            </Link>
            <Link to="/results" data-testid="home-cta-results" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-slate-500 bg-transparent text-white hover:bg-white/10 hover:text-white")}>
              View Live Results
            </Link>
            <Link to="/about" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "text-slate-300 hover:bg-white/10 hover:text-white")}>
              About the project
            </Link>
          </div>
        </div>
      </section>

      {/* Live election banner (real data; hidden when offline — never a fake number) */}
      {live.length > 0 && (
        <section className="border-b border-slate-200 bg-white" data-testid="home-election-banner">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            {live.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3">
                <Vote className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">
                    Voting open · {fmtDate(e.start_at)} → {fmtDate(e.end_at)} · {e.candidate_count} candidates
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "border font-semibold",
                    statusTone(e.status) === "verified" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {e.status}
                </Badge>
              </div>
            ))}
            <Link to="/results" className="text-sm font-semibold text-[#1D4ED8] hover:underline">
              Public results →
            </Link>
          </div>
        </section>
      )}

      {/* Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
          Three layers of election integrity
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Traditional digital voting struggles with impersonation, duplicate voting and
          unverifiable outcomes. Each layer below closes one of those gaps.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Card key={p.title} className="border-slate-200" data-testid={`home-pillar-${i + 1}`}>
              <CardContent className="py-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B192C] text-white">
                  <p.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-heading text-lg font-bold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Protections */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-slate-900">
              What protects the vote
            </h2>
            <ul className="mt-6 flex flex-col gap-3">
              {PROTECTIONS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#1D4ED8]" aria-hidden="true" />
              <h3 className="font-heading text-lg font-bold">Ballot secrecy by design</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Ballot records are cryptographically separated from voter identity. The system
              knows <em>that</em> you voted — a database constraint guarantees it — while the
              choice itself is AES-256-GCM encrypted with no voter reference attached.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Your receipt proves your ballot was recorded in the ledger without revealing
              your candidate. Administrators can never see or edit counts.
            </p>
            <Link to="/security" className="mt-4 inline-block text-sm font-semibold text-[#1D4ED8] hover:underline">
              Read the security model →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
