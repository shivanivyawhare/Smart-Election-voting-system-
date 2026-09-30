import { ContentList, ContentSection, ContentShell } from "@/components/ContentShell";

export default function Privacy() {
  return (
    <ContentShell
      title="Privacy architecture"
      lede="Data minimisation is a design constraint, not a policy paragraph."
      testid="privacy-page"
    >
      <ContentSection title="Collected and stored">
        <ContentList
          items={[
            "Registration data: name, date of birth, contact details, constituency and electoral-roll reference.",
            "Verification metadata: transaction IDs, provider, status, timestamps, risk score — never the underlying secrets.",
            "Vote marks: that a voter voted in an election, with a receipt reference.",
            "Ballot records: AES-256-GCM encrypted choices with no voter reference.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Never collected or retained">
        <ContentList
          items={[
            "Raw Aadhaar numbers — validated for format in-memory, then discarded.",
            "Face images or liveness frames — scored by the provider, then discarded.",
            "Raw OTPs — stored only as salted SHA-256 hashes with a five-minute expiry.",
            "Readable voter → candidate rows — structurally impossible by schema.",
          ]}
        />
      </ContentSection>

      <ContentSection title="Your receipt">
        <p>
          A receipt proves your ballot was included in the ledger without revealing your
          choice. Anyone holding the receipt ID can confirm inclusion; nobody — including
          administrators — can recover the candidate from it.
        </p>
      </ContentSection>
    </ContentShell>
  );
}
