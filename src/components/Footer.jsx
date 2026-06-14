export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-shell footer-main">
        <div className="footer-brand">
          <a className="brand-footer" href="#top" aria-label="Patch home">
            <img className="footer-logo" src="/patch-logo-2.png" alt="Patch" />
          </a>
          <p>The speaking coach for lawyers</p>
          <small>
            Short, focused speaking sessions for international legal professionals who want their
            voice to match the quality of their work.
          </small>
        </div>
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
            <a href="mailto:hello@patch.app">Support</a>
          </div>
          <div>
            <strong>Legal</strong>
            <a href="#top">Privacy</a>
            <a href="#top">Terms</a>
          </div>
        </div>
      </div>
      <div className="page-shell footer-bottom">
        <span>© 2026 Patch. All rights reserved.</span>
        <span>Designed for international legal professionals.</span>
      </div>
    </footer>
  );
}
