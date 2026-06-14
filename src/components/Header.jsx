export default function Header({ onDownloadClick }) {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#our-vision">Our Vision</a>
          <a href="#why-patch">Why Patch</a>
          <a href="#pricing">Pricing</a>
          <a href="#firms">For firms</a>
        </nav>

        <a className="brand" href="#top" aria-label="Patch home">
          <span className="brand-logo-crop">
            <img className="brand-logo" src="/patch-logo.png" alt="Patch" />
          </span>
        </a>

        <div className="nav-actions">
          <a
            className="nav-login"
            href="https://api.patch.app/login.html"
            target="_blank"
            rel="noreferrer"
          >
            Log in
          </a>
          <a className="nav-cta" href="#download" onClick={onDownloadClick}>
            <span>Download</span>
            <span className="nav-cta-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}
