import { DownloadAction } from './Hero.jsx';

export default function AppDownloadCTA({ onDownloadClick }) {
  return (
    <section className="final-cta" id="download">
      <div className="page-shell final-cta-layout">
        <div>
          <p className="eyebrow eyebrow-light">Your next call starts here</p>
          <h2>Build a stronger speaking consistency with Patch</h2>
        </div>
        <div className="final-cta-action">
          <DownloadAction light onDownloadClick={onDownloadClick} />
          <p>
            <strong>4 sessions to try.</strong> Download Patch and book your first call.
          </p>
        </div>
      </div>
    </section>
  );
}
