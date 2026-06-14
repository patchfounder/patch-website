const plans = [
  {
    name: 'Simple',
    price: '€48',
    note:
      'One session per week for lawyers who want a steady speaking habit without adding pressure to the week.',
  },
  {
    name: 'Regular',
    price: '€88',
    note:
      'Two sessions per week for lawyers who want consistent progress and regular feedback.',
    featured: true,
  },
  {
    name: 'Fast',
    price: '€120',
    note:
      'Three sessions per week for lawyers preparing for important conversations or faster improvement.',
  },
];

export default function Pricing({ onDownloadClick }) {
  return (
    <section className="section pricing-section" id="pricing">
      <div className="page-shell">
        <div className="section-heading pricing-heading">
          <h2>Build your speaking habit today</h2>
          <p>Every plan starts with 4 sessions to try.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article className={`price-card ${plan.featured ? 'featured' : ''}`} key={plan.name}>
              {plan.featured && <span className="popular-label">Most popular</span>}
              <p className="plan-name">{plan.name}</p>
              <div className="price">
                <strong>{plan.price}</strong>
                <span>/month</span>
              </div>
              <p className="plan-note">{plan.note}</p>
              <a className="pricing-cta" href="#download" onClick={onDownloadClick}>
                <span className="pricing-cta-copy">
                  <strong>Download to try</strong>
                  <small>Visit the App Store</small>
                </span>
                <span className="pricing-cta-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
