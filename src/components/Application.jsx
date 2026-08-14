import { useEffect, useState } from 'react';
import Footer from './Footer.jsx';

const LAW_FIRMS = [
  'Ashurst',
  'Clifford Chance',
  'Dentons',
  'Simmons & Simmons',
  'Pinsent Masons',
  'Watson Farley & Williams',
  'Eversheds Sutherland',
];

const PREVIOUS_INTERNS = [
  {
    name: 'Josh Hack',
    href: 'https://www.linkedin.com/in/joshjhack/',
  },
  {
    name: 'Uzma Kadri',
    href: 'https://www.linkedin.com/in/uzma-kadri-law/',
  },
  {
    name: 'Sahib Singh',
    href: 'https://www.linkedin.com/in/sahibsingh-/',
  },
  {
    name: 'Iman Wissanji',
    href: 'https://www.linkedin.com/in/imanwissanji/',
  },
  {
    name: 'Antonia Pintilie',
    href: 'https://www.linkedin.com/in/antonia-pintilie-law/',
  },
];

const COACHES = [
  { name: 'Josh Hack' },
  { name: 'Uzma' },
  { name: 'Saheeb' },
  { name: 'Iman' },
  { name: 'Antonia' },
];

const visibleOffsets = [-1, 0, 1];

// TODO: Replace with Patch recruitment WhatsApp link.
const WHATSAPP_CTA_HREF = '#whatsapp';

function useNoIndexPage(title) {
  useEffect(() => {
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobotsContent = robotsMeta?.getAttribute('content');
    const routeRobotsMeta = robotsMeta || document.createElement('meta');
    const previousTitle = document.title;

    routeRobotsMeta.setAttribute('name', 'robots');
    routeRobotsMeta.setAttribute('content', 'noindex, nofollow');
    document.title = title;

    if (!robotsMeta) {
      document.head.appendChild(routeRobotsMeta);
    }

    return () => {
      document.title = previousTitle;

      if (!robotsMeta) {
        routeRobotsMeta.remove();
      } else if (previousRobotsContent) {
        robotsMeta.setAttribute('content', previousRobotsContent);
      }
    };
  }, [title]);
}

function CoachCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [timerKey, setTimerKey] = useState(0);

  const changeSlide = (direction) => {
    setActiveIndex((current) => (current + direction + COACHES.length) % COACHES.length);
    setTimerKey((current) => current + 1);
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % COACHES.length);
      setTimerKey((current) => current + 1);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [timerKey]);

  return (
    <section className="application-section application-coaches-section" aria-labelledby="coaches-title">
      <div className="page-shell testimonial-carousel-shell">
        <header className="testimonial-carousel-heading">
          <h2 id="coaches-title">Meet the coaches</h2>
        </header>

        <div className="testimonial-progress" aria-label={`Coach ${activeIndex + 1} of ${COACHES.length}`}>
          {COACHES.map((coach, index) => (
            <span className={index === activeIndex ? 'active' : ''} key={coach.name} aria-hidden="true">
              {index === activeIndex && <i key={timerKey} />}
            </span>
          ))}
        </div>

        <div className="testimonial-carousel">
          <button
            className="testimonial-arrow testimonial-arrow-previous"
            type="button"
            onClick={() => changeSlide(-1)}
            aria-label="Previous coach"
          >
            ←
          </button>

          <div className="testimonial-track">
            {visibleOffsets.map((offset) => {
              const coachIndex = (activeIndex + offset + COACHES.length) % COACHES.length;
              const coach = COACHES[coachIndex];

              return (
                <article
                  className={`testimonial-slide testimonial-slide-${offset}`}
                  key={coach.name}
                  aria-hidden={offset !== 0}
                >
                  <div className="testimonial-image application-coach-image" aria-label={`${coach.name} photo placeholder`}>
                    <span>Coach photo</span>
                  </div>
                  {offset === 0 && (
                    <div className="testimonial-copy">
                      <span className="testimonial-name">{coach.name}</span>
                      <span className="testimonial-title">University of</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <button
            className="testimonial-arrow testimonial-arrow-next"
            type="button"
            onClick={() => changeSlide(1)}
            aria-label="Next coach"
          >
            →
          </button>
        </div>
      </div>
    </section>
  );
}

export default function Application() {
  useNoIndexPage('Law Student Intern | Patch');

  return (
    <div className="application-page">
      <main>
        <section className="application-hero">
          <div className="page-shell application-hero-shell">
            <span className="application-kicker">Application stage one: voice note submission</span>
            <h1>Law Student Intern</h1>
            <p className="application-hero-subtitle">
              A unique internship within the legal sector. Work with top-tier lawyers from European
              offices.
            </p>
          </div>
        </section>

        <section className="application-section">
          <div className="page-shell application-split">
            <div>
              <span className="application-section-label">The opportunity</span>
              <h2>The Role</h2>
            </div>
            <div className="application-copy">
              <p>
                We coach lawyers who need a speaking voice that is precise and professional, so
                they can demonstrate excellence to their clients. As a Legal Speaking Coach, you
                will coach lawyers through our platform using our exclusive coaching system.
              </p>
              <p>
                The six-month internship will give you valuable experience to draw on when applying
                for training contracts. You will receive one-to-one mentoring from our CEO and
                founder to help develop your professional strategy, including practical guidance on
                building a network with top-tier lawyers at major global firms.
              </p>
            </div>
          </div>
        </section>

        <section className="application-section application-logo-section">
          <div className="page-shell">
            <div className="application-section-heading">
              <span className="application-section-label">Credibility</span>
              <h2>Lawyers using Patch have worked at firms including</h2>
            </div>
            <div className="application-logo-grid" aria-label="Law firms">
              {LAW_FIRMS.map((firm) => (
                <div className="application-logo-card" key={firm} role="img" aria-label={firm}>
                  <span>{firm}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="application-section">
          <div className="page-shell">
            <div className="application-instructions">
              <div className="application-instructions-copy">
                <span className="application-section-label">Stage one</span>
                <h2>Voice Note Recording Instructions</h2>
                <p>
                  Congratulations on being invited to the first stage of our application process.
                  The position is competitive and we like to give everyone a fair opportunity.
                </p>
                <p>
                  Please record a 30 to 60 second audio recording outlining why you would like to
                  join the Patch App team.
                </p>
                <p>
                  Send your voice note recording to us as a WhatsApp message within 48 hours of
                  receiving your invitation.
                </p>
                <p className="application-closing">
                  We believe in treating all of our applicants with respect and kindness. You will
                  hear back from us after sending in your audio message.
                </p>
              </div>

              <div className="application-steps-card">
                <h3>Instructions:</h3>
                <ol>
                  <li>Plan what you are going to say.</li>
                  <li>Mention how your values align with ours.</li>
                  <li>Record in a quiet place.</li>
                </ol>
                <a className="application-whatsapp-cta" href={WHATSAPP_CTA_HREF}>
                  Send your voice note on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>

        <CoachCarousel />

        <section className="application-section application-interns-section">
          <div className="page-shell">
            <div className="application-section-heading">
              <span className="application-section-label">Alumni</span>
              <h2>Previous Patch App interns</h2>
              <p>
                View some of the brilliant law students who completed their Patch App internship.
              </p>
            </div>

            <div className="application-intern-grid">
              {PREVIOUS_INTERNS.map((intern) => (
                <article className="application-intern-card" key={intern.href}>
                  <h3>{intern.name}</h3>
                  <p>Former Patch App intern</p>
                  <a
                    href={intern.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${intern.name}'s LinkedIn profile`}
                  >
                    View LinkedIn profile
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer hideColumns logoSrc="/patch-logo-2.png" />
    </div>
  );
}
