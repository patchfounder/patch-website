export default function Footer({ hideColumns = false, logoSrc = '/patch-logo-2.png' }) {
  return (
    <footer className={`site-footer ${hideColumns ? 'site-footer-compact' : ''}`}>
      <div className="page-shell footer-main">
        <div className="footer-brand">
          <a className="brand-footer" href="#top" aria-label="Patch home">
            <img className="footer-logo" src={logoSrc} alt="Patch" />
          </a>
          <p>The speaking coach for lawyers</p>
          <small>
            Short, focused speaking sessions for international legal professionals who want their
            voice to match the quality of their work.
          </small>
        </div>
        {!hideColumns && (
          <div className="footer-links">
            <div>
              <strong>Product</strong>
              <a href="#how-it-works">How it works</a>
              <a href="#product">The app</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <strong>Patch</strong>
              <a href="#testimonials">Members</a>
              <a href="#firms">For firms</a>
              <a href="https://www.linkedin.com">Admin</a>
            </div>
            <div>
              <strong>Legal</strong>
              <a href="/legal">Privacy</a>
              <a href="/legal">Terms</a>
              <a className="footer-beta-link" href="https://www.linkedin.com">Beta</a>
            </div>
          </div>
        )}
      </div>
      <div className="page-shell footer-bottom">
        <span>© 2026 Patch. All rights reserved.</span>
        <span>Designed for international legal professionals.</span>
      </div>
    </footer>
  );
}
