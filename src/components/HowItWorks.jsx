const steps = [
  ['01', 'Download Patch', 'Choose your rhythm and begin with four sessions to try.'],
  ['02', 'Book a Call', 'Find a time that works around hearings, matters, and client work.'],
  ['03', 'Watch the topic video', 'Prepare quickly with a focused briefing before you speak.'],
  ['04', 'Start Call', 'Work one-to-one with your coach in a structured speaking session.'],
  ['05', 'Review your score', 'See clear feedback across the areas that shape confident delivery.'],
  ['06', 'Build your weekly rhythm', 'Keep improving through consistent, practical speaking time.'],
];

export default function HowItWorks() {
  return (
    <section className="section journey-section" id="how-it-works">
      <div className="page-shell">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">A better professional habit</p>
            <h2>From download to real speaking practice in minutes.</h2>
          </div>
          <p>
            No lengthy onboarding. No generic curriculum. Patch fits purposeful speaking practice
            around the working week.
          </p>
        </div>

        <div className="journey-grid">
          {steps.map(([number, title, copy]) => (
            <article className="journey-step" key={number}>
              <span className="journey-number">{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
