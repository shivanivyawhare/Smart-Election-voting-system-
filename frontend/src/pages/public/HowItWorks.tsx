import { ContentList, ContentSection, ContentShell } from "@/components/ContentShell";

const VOTER_STEPS = [
  "Register with your electoral-roll reference — no Aadhaar number is ever stored.",
  "An administrator approves your registration.",
  "Sign in and complete identity verification with explicit consent.",
  "Complete face verification using your camera (or a labelled sandbox simulation when no camera exists).",
  "Pass the server-generated liveness challenge sequence.",
  "Open an election, review candidates, and confirm your vote on the review screen.",
  "Receive a cryptographic receipt and verify your ballot's ledger inclusion any time.",
];

const COUNTING_STEPS = [
  "When voting closes, no endpoint accepts new ballots.",
  "A Results Officer triggers counting: ballots are decrypted, validated and tallied.",
  "A result snapshot is generated and hashed (SHA-256).",
  "The hash is anchored into the ledger as RESULT_GENERATED.",
  "After review, results are published — RESULTS_PUBLISHED — and the public portal displays them.",
];

export default function HowItWorks() {
  return (
    <ContentShell
      title="How it works"
      lede="From registration to a verifiable result — the complete voter and counting workflows."
      testid="how-it-works-page"
    >
      <ContentSection title="The voter journey">
        <ContentList items={VOTER_STEPS} />
      </ContentSection>
      <ContentSection title="Counting and publication">
        <ContentList items={COUNTING_STEPS} />
      </ContentSection>
      <ContentSection title="Election lifecycle">
        <p className="font-mono text-xs">
          DRAFT → SCHEDULED → OPEN → (PAUSED) → CLOSED → COUNTING → RESULTS_PUBLISHED → ARCHIVED
        </p>
        <p>
          The backend rejects any state transition outside this chain, audits every change,
          and anchors openings and closures into the ledger.
        </p>
      </ContentSection>
    </ContentShell>
  );
}
