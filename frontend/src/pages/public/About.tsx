import { ContentList, ContentSection, ContentShell } from "@/components/ContentShell";

export default function About() {
  return (
    <ContentShell
      title="About the project"
      lede="Traditional digital voting systems face challenges involving identity verification, duplicate voting, impersonation, auditability and trust. This project answers with a layered platform."
      testid="about-page"
    >
      <ContentSection title="The problem">
        <ContentList
          items={[
            "Remote digital voting is hard to verify: who is actually voting, and are they who they claim to be?",
            "Impersonation and duplicate voting are the classic attacks on any election system.",
            "Voters are asked to trust a black box — with no way to check their ballot was recorded or the count is honest.",
            "Centralised databases with readable voter-to-candidate rows put secrecy and coercion-resistance at risk.",
          ]}
        />
      </ContentSection>

      <ContentSection title="The proposed solution — nine layered defences">
        <ContentList
          items={[
            "1. Identity verification — a consent-first identity-provider flow (sandbox in development, Aadhaar adapter behind configuration for production).",
            "2. Face verification — camera capture scored by a provider abstraction; captures are never stored.",
            "3. Liveness detection — server-generated random challenges with replay and timing checks.",
            "4. Eligibility validation — an engine that checks every condition before ALLOW_VOTE.",
            "5. Secret ballot separation — identity and ballot systems are cryptographically decoupled.",
            "6. Cryptographic protection — AES-256-GCM ballot encryption and SHA-256 commitments.",
            "7. Tamper-evident ledger — every integrity event is hash-chained and verifiable.",
            "8. Automated counting — totals derive only from encrypted ballots; nobody edits counts.",
            "9. Auditable publication — results are snapshotted, hashed, anchored and only then published.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Sandbox honesty">
        <p>
          This deployment runs in DEVELOPMENT / SANDBOX mode with synthetic data. The identity
          provider is a sandbox provider and every screen labels it as such — nothing here
          claims to be a real UIDAI verification. The AadhaarIdentityProvider adapter exists
          behind environment configuration so real credentials can be connected later without
          rewriting the application.
        </p>
      </ContentSection>
    </ContentShell>
  );
}
