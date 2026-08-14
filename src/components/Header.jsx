const DEFAULT_NAVIGATION = [
  { href: '#our-vision', label: 'Our Vision' },
  { href: '#why-patch', label: 'Why Patch' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#firms', label: 'For firms' },
];

export default function Header({
  onDownloadClick,
  navigation = DEFAULT_NAVIGATION,
  logoHref = '#top',
  showDownload = true,
}) {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <nav className="nav-links" aria-label="Main navigation">
          {navigation.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <a className="brand" href={logoHref} aria-label="Patch home">
          <span className="brand-logo-crop">
            <img className="brand-logo" src="/patch-logo.png" alt="Patch" />
          </span>
        </a>

        {showDownload && (
          <div className="nav-actions">
            <a className="nav-cta" href="#download" onClick={onDownloadClick}>
              <span>Download</span>
              <span className="nav-cta-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
