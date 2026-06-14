import { useEffect } from 'react';
import Footer from './Footer.jsx';

const CAL_SCRIPT_ID = 'cal-inline-embed-script';
const CAL_NAMESPACE = 'kc';
const KC_CAL_LINK = 'patchapp/kc';
const KC_CAL_URL = 'https://cal.com/patchapp/kc';

function installCalLoader() {
  if (window.Cal) {
    return;
  }

  const queueCall = (target, args) => target.q.push(args);

  window.Cal = function calLoader(...args) {
    const cal = window.Cal;

    if (!cal.loaded) {
      cal.ns = {};
      cal.q = cal.q || [];

      if (!document.getElementById(CAL_SCRIPT_ID)) {
        const script = document.createElement('script');
        script.id = CAL_SCRIPT_ID;
        script.src = 'https://app.cal.com/embed/embed.js';
        script.async = true;
        document.head.appendChild(script);
      }

      cal.loaded = true;
    }

    if (args[0] === 'init') {
      const namespace = args[1];
      const namespacedCal = (...namespaceArgs) => queueCall(namespacedCal, namespaceArgs);
      namespacedCal.q = namespacedCal.q || [];
      cal.ns[namespace] = cal.ns[namespace] || namespacedCal;
      queueCall(cal.ns[namespace], args);
      queueCall(cal, ['initNamespace', namespace]);
      return;
    }

    queueCall(cal, args);
  };

  window.Cal.q = [];
}

function initialiseKcEmbed() {
  const calendarElement = document.getElementById('my-cal-inline-kc');

  if (!calendarElement || calendarElement.dataset.calInitialised === 'true') {
    return;
  }

  installCalLoader();
  window.Cal('init', CAL_NAMESPACE, { origin: 'https://app.cal.com' });
  window.Cal.ns[CAL_NAMESPACE]('inline', {
    elementOrSelector: '#my-cal-inline-kc',
    calLink: KC_CAL_LINK,
    config: {
      layout: 'month_view',
      useSlotsViewOnSmallScreen: true,
    },
  });
  window.Cal.ns[CAL_NAMESPACE]('ui', {
    hideEventTypeDetails: false,
    layout: 'month_view',
  });

  calendarElement.dataset.calInitialised = 'true';
}

export default function Kc() {
  useEffect(() => {
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobotsContent = robotsMeta?.getAttribute('content');
    const routeRobotsMeta = robotsMeta || document.createElement('meta');

    routeRobotsMeta.setAttribute('name', 'robots');
    routeRobotsMeta.setAttribute('content', 'noindex, nofollow');

    if (!robotsMeta) {
      document.head.appendChild(routeRobotsMeta);
    }

    document.title = 'Know your coach | Patch';

    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const initialiseForDesktop = (event) => {
      if (event.matches) {
        initialiseKcEmbed();
      }
    };

    initialiseForDesktop(desktopQuery);
    desktopQuery.addEventListener('change', initialiseForDesktop);

    return () => {
      desktopQuery.removeEventListener('change', initialiseForDesktop);
      document.title = 'Patch';

      if (!robotsMeta) {
        routeRobotsMeta.remove();
      } else if (previousRobotsContent) {
        robotsMeta.setAttribute('content', previousRobotsContent);
      }
    };
  }, []);

  return (
    <div className="meeting-page">
      <main className="meeting-main">
        <div className="page-shell meeting-shell">
          <header className="meeting-heading">
            <h1>Know your coach</h1>
            <p>
              A micro article about the coach to expand their professional brand as we get closer
              to the strategy stage of our journey.
            </p>
          </header>

          <section className="meeting-booking" aria-label="Choose a know your coach time">
            <div
              className="meeting-calendar"
              id="my-cal-inline-kc"
              style={{ width: '100%', minHeight: '700px' }}
              aria-label="Choose a know your coach time"
            />

            <a
              className="meeting-mobile-cta"
              href={KC_CAL_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span>View Calendar</span>
              <span className="meeting-mobile-cta-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </section>
        </div>
      </main>

      <Footer hideColumns logoSrc="/patch-logo-2.png" />
    </div>
  );
}
