import { ContentShell, ContentSection } from "@/components/ContentShell";

const FAQS = [
  {
    q: "Is this a real government election system?",
    a: "No. This is a development sandbox with synthetic data, clearly labelled on every screen. Verification results are sandbox results — never real UIDAI verification. The Aadhaar production adapter exists behind configuration so real credentials can be connected later without rewriting the app.",
  },
  {
    q: "How is double voting prevented?",
    a: "A unique database constraint on (election, voter) makes a second vote physically impossible — even two simultaneous requests. The constraint is enforced server-side; the frontend is never trusted.",
  },
  {
    q: "Can administrators see who I voted for?",
    a: "No. Ballot records are AES-256-GCM encrypted and carry no voter reference. The system knows THAT you voted (a vote mark exists), but the choice is cryptographically separated from your identity and cannot be read without the ballot encryption key, which administrators never hold.",
  },
  {
    q: "What happens to my face image?",
    a: "Camera captures are analysed by the verification provider and immediately discarded. Only minimal metadata is kept: status, confidence, and quality metrics. Images are never written to the database or disk.",
  },
  {
    q: "How does the liveness check work?",
    a: "The server generates a random challenge sequence (blink, turn left, turn right, look up, smile) with a one-time nonce and short expiry. Frames are compared pairwise to defeat photo replay, and timing is checked to defeat automation.",
  },
  {
    q: "What is the vote receipt for?",
    a: "It proves your ballot was recorded and anchored in the ledger — without revealing your candidate. Anyone holding the receipt ID can confirm inclusion; nobody can recover the choice from it.",
  },
  {
    q: "When are results visible?",
    a: "Only after an authorized Results Officer publishes them. Counts are computed exclusively from encrypted ballots — there is no endpoint that can edit a vote count.",
  },
  {
    q: "Can real Aadhaar authentication be connected later?",
    a: "Yes. The IdentityProvider interface defines initiateAuthentication, checkAuthenticationStatus and getVerifiedAttributes. AadhaarIdentityProvider is isolated behind environment variables (AADHAAR_PROVIDER, client id/secret, API URL, license key) and refuses to operate without credentials so sandbox output can never masquerade as real verification.",
  },
];

export default function FAQ() {
  return (
    <ContentShell
      title="Frequently asked questions"
      lede="Straight answers about verification, secrecy, receipts and the ledger."
      testid="faq-page"
    >
      <div className="flex flex-col gap-3">
        {FAQS.map((f, i) => (
          <details
            key={i}
            data-testid={`faq-item-${i + 1}`}
            className="group rounded-xl border border-border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-heading text-base font-bold text-slate-900">
              {f.q}
              <span className="text-slate-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{f.a}</p>
          </details>
        ))}
      </div>
      <ContentSection title="Still have a question?">
        <p>
          Use the <a href="/contact" className="font-semibold text-[#1D4ED8] hover:underline">contact form</a> —
          messages are delivered to the console email provider in this sandbox.
        </p>
      </ContentSection>
    </ContentShell>
  );
}
