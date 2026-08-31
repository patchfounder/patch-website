import { useEffect, useState } from 'react';
import Footer from './Footer.jsx';
import Header from './Header.jsx';
import CoachApplicationSuccess from './CoachApplicationSuccess.jsx';
import CoachPasswordGate from './CoachPasswordGate.jsx';
import CoachSubmissionSection from './CoachSubmissionSection.jsx';
import '../coach-application.css';

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

function ProcessArrow() {
  return (
    <svg className="application-process-arrow" viewBox="0 0 60 38" aria-hidden="true">
      <path d="M2 19h50M36 3l16 16-16 16" />
    </svg>
  );
}

function StageOneProcessIcon({ type }) {
  if (type === 'plan') {
    return (
      <svg viewBox="0 0 144 144" aria-hidden="true">
        <path d="M22 18h100a14 14 0 0 1 14 14v58a14 14 0 0 1-14 14H70l-28 22v-22H22A14 14 0 0 1 8 90V32A14 14 0 0 1 22 18z" />
        <circle className="application-process-dot" cx="49" cy="62" r="4" />
        <circle className="application-process-dot" cx="72" cy="62" r="4" />
        <circle className="application-process-dot" cx="95" cy="62" r="4" />
      </svg>
    );
  }

  if (type === 'record') {
    return (
      <svg viewBox="0 0 134 142" aria-hidden="true">
        <rect x="30" y="5" width="74" height="126" rx="10" />
        <path d="M58 18h18" />
        <path d="M43 76c6 0 6-18 12-18s6 34 12 34 6-48 12-48 6 34 12 34" />
      </svg>
    );
  }

  if (type === 'send') {
    return (
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <path d="M7 48 132 7 89 132 64 76 7 48z" />
        <path d="m64 76 68-69" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 140 140" aria-hidden="true">
      <path d="M16 72h105l17 38v22H1v-22l15-38z" />
      <path d="M1 110h43l8 12h34l8-12h44" />
      <circle className="application-process-clock-face" cx="110" cy="28" r="27" />
      <path d="M110 13v16l12 8" />
    </svg>
  );
}

function StageOneProcessFlow() {
  const steps = [
    {
      title: 'Plan',
      detail: 'Your message',
      icon: <StageOneProcessIcon type="plan" />,
    },
    {
      title: 'Record',
      detail: 'Up to 60 seconds',
      icon: <StageOneProcessIcon type="record" />,
    },
    {
      title: 'Review',
      detail: 'Listen back',
      icon: <StageOneProcessIcon type="send" />,
    },
    {
      title: 'Submit',
      detail: 'To Patch',
      icon: <StageOneProcessIcon type="wait" />,
    },
  ];

  return (
    <div className="application-process-flow" aria-label="Voice note application process">
      {steps.map((step, index) => (
        <div className="application-process-item" key={step.title}>
          <div className="application-process-icon">{step.icon}</div>
          <span className="application-process-title">{step.title}</span>
          <span className="application-process-detail">{step.detail}</span>
          {index < steps.length - 1 && <ProcessArrow />}
        </div>
      ))}
    </div>
  );
}

const PREVIOUS_INTERNS = [
  {
    name: 'Josh Hack',
    university: 'University of Nottingham',
    src: '/application-intern-josh-hack.jpg',
    href: 'https://www.linkedin.com/in/joshjhack/',
  },
  {
    name: 'Antonia Pintilie',
    university: 'Universitat Pompeu Fabra',
    src: '/application-intern-antonia-pintilie.jpg',
    href: 'https://www.linkedin.com/in/antonia-pintilie-law/',
  },
  {
    name: 'Naïa Foucan',
    university: 'King\'s College London & Paris II Panthéon-Assas',
    src: '/application-intern-naia-foucan.jpg',
    href: 'https://www.linkedin.com/in/naïa-foucan-2a2a84219/',
  },
  {
    name: 'Ross Volpi',
    university: 'University of Exeter',
    src: '/application-intern-ross-volpi.jpg',
    href: 'https://www.linkedin.com/in/ross-volpi-9aa41a2b9/',
  },
  {
    name: 'Dhilan Gudka',
    university: 'University of Warwick',
    src: '/application-intern-dhilan-gudka.jpg',
    href: 'https://www.linkedin.com/in/dhilan-gudka-9b8b30327/',
  },
];

const visibleOffsets = [-1, 0, 1];

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
    routeRobotsMeta.setAttribute('content', 'noindex, nofollow, noarchive');
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
      } else {
        robotsMeta.removeAttribute('content');
      }
    };
  }, [title]);
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) return undefined;

    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.('change', updatePreference);
    return () => mediaQuery.removeEventListener?.('change', updatePreference);
  }, []);

  return reducedMotion;
}

function PreviousInternsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const [focusWithin, setFocusWithin] = useState(false);
  const reducedMotion = useReducedMotionPreference();

  const changeSlide = (direction) => {
    setActiveIndex((current) => (current + direction + PREVIOUS_INTERNS.length) % PREVIOUS_INTERNS.length);
    setTimerKey((current) => current + 1);
  };

  useEffect(() => {
    if (reducedMotion || focusWithin) return undefined;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % PREVIOUS_INTERNS.length);
      setTimerKey((current) => current + 1);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [focusWithin, reducedMotion, timerKey]);

  return (
    <div
      className="testimonial-carousel-shell application-intern-carousel"
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
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
                <div className="testimonial-image application-intern-image">
                  <img
                    src={intern.src}
                    alt={`${intern.name}, former Patch App intern`}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                {offset === 0 && (
                  <div className="testimonial-copy application-intern-copy">
                    <a
                      className="testimonial-name application-intern-name"
                      href={intern.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${intern.name} on LinkedIn`}
                    >
                      <span>{intern.name}</span>
                      <span className="application-intern-linkedin" aria-hidden="true">in</span>
                    </a>
                    <span className="testimonial-title">{intern.university}</span>
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

export default function CoachApplication() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [successDetails, setSuccessDetails] = useState(null);
  useNoIndexPage('Legal Speaking Coach Application | Patch');

  if (successDetails) {
    return <CoachApplicationSuccess {...successDetails} />;
  }

  if (!isUnlocked) {
    return <CoachPasswordGate onUnlocked={() => setIsUnlocked(true)} />;
  }

  return (
    <div className="application-page coach-application-page coach-recruitment-ui">
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
                We work with lawyers who need a speaking voice that is precise and professional.
                As a Legal Speaking Coach, you will learn to coach lawyers using our exclusive
                system.
              </p>
              <p>
                The six-month internship will give you valuable experience to draw on when applying
                for training contracts. You will also receive one-to-one mentoring from our founder
                to help develop your professional strategy, including practical guidance on
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
                <h2>How to submit your application?</h2>
                <p>
                  Your voice is central to this role. We are looking for a clear, energetic speaking
                  voice and people whose values align with ours.
                </p>
                <p>
                  Prepare a voice note of up to 60 seconds explaining why you would like to join Patch.
                  You can also share how your values align with ours and a little about your professional
                  strategy.
                </p>
                <p className="application-closing">
                  You can listen back and record again below. Nothing is submitted until you review
                  everything and press the final Submit application button. Every applicant receives
                  an outcome by email.
                </p>
              </div>

              <div className="application-stage-one-aside">
                <div className="application-steps-card">
                  <h3>Before you record:</h3>
                  <ol>
                    <li>Plan what you are going to say.</li>
                    <li>Mention how your values align with ours.</li>
                    <li>Record, listen back and submit below.</li>
                  </ol>
                  <a className="application-whatsapp-cta coach-stage-one-cta" href="#submit-voice-note">
                    Record your voice note
                  </a>
                  <p className="application-whatsapp-cta-note">
                    You will be asked for microphone access when you start recording.
                  </p>
                </div>
                <StageOneProcessFlow />
              </div>
            </div>
          </div>
        </section>

        <CoachSubmissionSection
          onSuccess={setSuccessDetails}
          onAccessExpired={() => setIsUnlocked(false)}
        />

        <section className="application-section application-stage-two-section" id="stage-two">
          <div className="page-shell">
            <div className="application-instructions">
              <div className="application-instructions-copy">
                <span className="application-section-label">Stage Two: Interview</span>
                <h2>Video Interview</h2>
                <p className="application-closing">
                  Successful applicants receive an email linking to the{' '}
                  <a className="coach-inline-link" href="https://www.patch.app/coaching">booking page</a>.
                  Choose a time for a 30-minute video interview with Patrick on Google Meet. You will
                  discuss the role and your availability, and have time to ask questions. From there,
                  you may be invited to join the team as a Legal Speaking Coach.
                </p>
              </div>

              <div className="application-steps-card application-stage-two-card">
                <h3>What happens next:</h3>
                <ol>
                  <li>Receive your Stage Two invitation by email.</li>
                  <li>Choose a time on the booking page.</li>
                  <li>Join the video interview on Google Meet.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="application-section application-interns-section" id="interns">
          <div className="page-shell">
            <div className="application-section-heading">
              <span className="application-section-label">PATCH INTERNS</span>
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
