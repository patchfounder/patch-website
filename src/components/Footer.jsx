export default function Footer({
  hideColumns = false,
  logoSrc = '/patch-logo-2.png',
  onDownloadClick,
}) {
  return (
    <footer className={`site-footer ${hideColumns ? 'site-footer-compact' : ''}`}>
      <div className="page-shell footer-main">
        <div className="footer-brand">
          <a className="brand-footer" href="#top" aria-label="Patch home">
            <img className="footer-logo" src={logoSrc} alt="Patch" />
          </a>
          <p>The speaking coach for lawyers</p>
          <small>
            Short, focused speaking sessions for lawyers who want their
            voice to match the quality of their work.
          </small>
        </div>
        {!hideColumns && (
          <div className="footer-links">
            <div>
              <strong>Product</strong>
              <a href="#product">How it works</a>
              <a href="#download" onClick={onDownloadClick}>
                The app
              </a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <strong>Patch</strong>
              <a href="#testimonials">Members</a>
              <a href="#firms">For firms</a>
              <a href="https://os.patch.app/admin-login">Admin</a>
            </div>
            <div>
              <strong>Legal</strong>
              <a href="/legal">Privacy</a>
              <a href="/legal">Terms</a>
            </div>
          </div>
        )}
      </div>
      <div className="page-shell footer-bottom">
        <span>© 2026 Patch App LLC, all rights reserved.</span>
        <span>Designed exclusively for international legal professionals</span>
      </div>
    </footer>
  );
}
