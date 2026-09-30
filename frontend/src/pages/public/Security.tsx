import { ContentList, ContentSection, ContentShell } from "@/components/ContentShell";

export default function Security() {
  return (
    <ContentShell
      title="Security & blockchain model"
      lede="How the platform defends authentication, the ballot, and the count."
      testid="security-page"
    >
      <ContentSection title="Authentication">
        <ContentList
          items={[
            "Passwords hashed with PBKDF2-SHA256 (passlib); never returned by any API.",
            "HTTP-only session cookies — no tokens in JavaScript-reachable storage.",
            "Admin sign-in adds a mandatory MFA step, account lockout and login history.",
            "Refresh-token rotation with server-side revocation on logout.",
            "Sliding-window rate limiting on every sensitive route.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Ballot protection">
        <ContentList
          items={[
            "Ballots are encrypted with AES-256-GCM before storage; the key lives in server environment configuration only.",
            "Ballot records carry no voter reference — the identity and ballot systems are separated.",
            "A unique database constraint makes double voting impossible, even with simultaneous requests.",
            "Idempotency keys make retries safe: the same submission returns the original receipt.",
          ]}
        />
      </ContentSection>

      <ContentSection title="The ledger">
        <p>
          Each integrity event (election created, opened, closed, vote commitment, result
          generated, result published, audit log) becomes a block: an SHA-256 hash over the
          event payload plus the previous block's hash. Verifying the chain recomputes every
          hash and link — any tampering reports INTEGRITY VIOLATION DETECTED.
        </p>
        <p>
          The ledger stores hashes and election metadata only. Personal data, vote choices
          and credentials never touch it.
        </p>
      </ContentSection>

      <ContentSection title="What is never stored">
        <ContentList
          items={[
            "Raw Aadhaar numbers or biometric data",
            "Raw OTPs or authentication PID blocks",
            "Face images or liveness frames (analysed, then discarded)",
            "Readable voter → candidate mappings",
          ]}
        />
      </ContentSection>
    </ContentShell>
  );
}
