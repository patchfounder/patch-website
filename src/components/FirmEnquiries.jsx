export default function FirmEnquiries() {
  return (
    <section className="section firm-section" id="firms">
      <div className="page-shell firm-layout">
        <div>
          <p className="eyebrow">For law firms</p>
          <h2>Interested in Patch for a wider team?</h2>
        </div>
        <div className="firm-copy">
          <p>
            Patch is built first for individual lawyers. We also welcome conversations with firms
            exploring a focused speaking benefit for associates, counsel, and partners.
          </p>
          {/* TODO: Replace with the approved firm enquiry destination. */}
          <a className="text-link" href="mailto:hello@patch.app">
            Start a firm enquiry by email <span>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
