import { useEffect, useState } from 'react';
import Footer from './Footer.jsx';
import Header from './Header.jsx';

const LAW_FIRMS = [
  { name: 'Ashurst Perkins Coie', src: '/law-firm-logos/ashurst-perkins-coie-mark.png' },
  { name: 'Clifford Chance', src: '/law-firm-logos/clifford-chance-mark.png' },
  { name: 'Dentons', src: '/law-firm-logos/dentons-mark.png' },
  { name: 'Simmons & Simmons', src: '/law-firm-logos/simmons-simmons-mark.png' },
  { name: 'Pinsent Masons', src: '/law-firm-logos/pinsent-masons-mark.png' },
  { name: 'Watson Farley & Williams', src: '/law-firm-logos/wfw-mark.png' },
  { name: 'Eversheds Sutherland', src: '/law-firm-logos/eversheds-sutherland-mark.png' },
];

const CAROUSEL_FIRMS = Array.from({ length: 4 }, () => LAW_FIRMS).flat();

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

const visibleOffsets = [-1, 0, 1];

const WHATSAPP_CTA_HREF = 'https://wa.me/19049837147';

const APPLICATION_NAVIGATION = [
  { href: '#role', label: 'The Role' },
  { href: '#stage-one', label: 'Stage One' },
  { href: '#stage-two', label: 'Stage Two' },
  { href: '#interns', label: 'Interns' },
];

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

function PreviousInternsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [timerKey, setTimerKey] = useState(0);

  const changeSlide = (direction) => {
    setActiveIndex((current) => (current + direction + PREVIOUS_INTERNS.length) % PREVIOUS_INTERNS.length);
    setTimerKey((current) => current + 1);
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % PREVIOUS_INTERNS.length);
      setTimerKey((current) => current + 1);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [timerKey]);

  return (
    <div className="testimonial-carousel-shell application-intern-carousel">
      <div className="testimonial-progress" aria-label={`Intern ${activeIndex + 1} of ${PREVIOUS_INTERNS.length}`}>
        {PREVIOUS_INTERNS.map((intern, index) => (
          <span className={index === activeIndex ? 'active' : ''} key={intern.href} aria-hidden="true">
            {index === activeIndex && <i key={timerKey} />}
          </span>
        ))}
      </div>

      <div className="testimonial-carousel">
        <button
          className="testimonial-arrow testimonial-arrow-previous"
          type="button"
          onClick={() => changeSlide(-1)}
          aria-label="Previous intern"
        >
          ←
        </button>

        <div className="testimonial-track">
          {visibleOffsets.map((offset) => {
            const internIndex = (activeIndex + offset + PREVIOUS_INTERNS.length) % PREVIOUS_INTERNS.length;
            const intern = PREVIOUS_INTERNS[internIndex];

            return (
              <article
                className={`testimonial-slide testimonial-slide-${offset}`}
                key={intern.href}
                aria-hidden={offset !== 0}
              >
                <div className="testimonial-image application-intern-image" aria-label={`${intern.name} photo placeholder`}>
                  <span>Intern photo</span>
                </div>
                {offset === 0 && (
                  <div className="testimonial-copy">
                    <span className="testimonial-name">{intern.name}</span>
                    <span className="testimonial-title">Former Patch App intern</span>
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
          aria-label="Next intern"
        >
          →
        </button>
      </div>
    </div>
  );
}

export default function Application() {
  useNoIndexPage('Law Student Intern | Patch');

  return (
    <div className="application-page">
      <Header navigation={APPLICATION_NAVIGATION} logoHref="/" showDownload={false} />
      <main>
        <section className="application-hero">
          <div className="page-shell application-hero-shell">
            <span className="application-kicker">Application Stage 1</span>
            <h1>Law Student Intern</h1>
            <p className="application-hero-subtitle">
              A unique internship within the legal sector. Work with top-tier lawyers from European
              offices.
            </p>
          </div>
          <div className="application-logo-section application-hero-logo-section">
            <div className="application-logo-marquee" aria-label="Law firms represented by Patch lawyers">
            <div className="application-logo-track">
              {CAROUSEL_FIRMS.map((firm, index) => (
                <div className="application-logo-mark" key={`${firm.name}-${index}`}>
                  <img src={firm.src} alt={firm.name} />
                </div>
              ))}
            </div>
            </div>
          </div>
        </section>

        <section className="application-section application-role-section" id="role">
          <div className="page-shell application-split">
            <div>
              <span className="application-section-label">The opportunity</span>
              <h2>The Role</h2>
            </div>
            <div className="application-copy">
              <p>
                We coach lawyers who need a speaking voice that is precise and professional. As a
                Legal Speaking Coach, you will coach lawyers through our platform using our
                exclusive coaching system.
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

        <section className="application-section" id="stage-one">
          <div className="page-shell">
            <div className="application-instructions">
              <div className="application-instructions-copy">
                <span className="application-section-label">Stage 1: Voice Note Submission</span>
                <h2>How to send your application?</h2>
                <p>
                  Please send a short voice note to our WhatsApp Business number: +1 904 983 7147.
                  This gives us the opportunity to hear how you communicate. We are looking for
                  high-energy speaking voices, alongside people whose values align with ours.
                </p>
                <p>
                  Open WhatsApp and use the voice-note feature to record a 30 to 60 second message
                  explaining why you would like to join the Patch App team and how your values
                  align with ours. You are also welcome to tell us a little more about yourself and
                  your professional strategy.
                </p>
                <p className="application-closing">
                  Our team will review your recording carefully. If you are successful, we will
                  invite you to Stage Two. Every applicant will hear the outcome of their
                  application from us.
                </p>
              </div>

              <div className="application-steps-card">
                <h3>Before you send:</h3>
                <ol>
                  <li>Plan what you are going to say.</li>
                  <li>Mention how your values align with ours.</li>
                  <li>Record somewhere quiet, then send it on WhatsApp.</li>
                </ol>
                <a className="application-whatsapp-cta" href={WHATSAPP_CTA_HREF}>
                  Send your voice note on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="application-section application-stage-two-section" id="stage-two">
          <div className="page-shell">
            <div className="application-instructions">
              <div className="application-instructions-copy">
                <span className="application-section-label">Stage Two: Interview</span>
                <h2>Voice Call Interview</h2>
                <p>
                  If your voice note is successful, we will send you a WhatsApp message with an
                  invitation to arrange a call with our founder and CEO.
                </p>
                <p>
                  This will give us the opportunity to get to know you and for you to ask questions
                  about the role.
                </p>
                <p className="application-closing">
                  If the conversation goes well, you will be invited to join the team as a Legal
                  Speaking Coach.
                </p>
              </div>

              <div className="application-steps-card application-stage-two-card">
                <h3>What happens next:</h3>
                <ol>
                  <li>Receive your Stage Two invitation on WhatsApp.</li>
                  <li>Use the link to book a time in the calendar.</li>
                  <li>Join your interview over a WhatsApp call.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="application-section application-interns-section" id="interns">
          <div className="page-shell">
            <div className="application-section-heading">
              <span className="application-section-label">Patch Alumni</span>
              <h2>Legal Speaking Coaches</h2>
              <p>
                View some of the students who completed their internship with us.
              </p>
            </div>

            <PreviousInternsCarousel />
          </div>
        </section>
      </main>

      <Footer hideColumns logoSrc="/patch-logo-2.png" />
    </div>
  );
}
