import { useEffect } from 'react';
import Footer from './Footer.jsx';

export default function Training() {
  useEffect(() => {
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobotsContent = robotsMeta?.getAttribute('content');
    const routeRobotsMeta = robotsMeta || document.createElement('meta');

    routeRobotsMeta.setAttribute('name', 'robots');
    routeRobotsMeta.setAttribute('content', 'noindex, nofollow');

    if (!robotsMeta) {
      document.head.appendChild(routeRobotsMeta);
    }

    document.title = 'Patch Coach Training | Patch';

    return () => {
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
            <h1>Patch Coach Training</h1>
            <p>A legal speaking coach is something to be...</p>
          </header>

          <section className="meeting-booking" aria-label="Patch coach training video">
            <div className="training-video">
              <iframe
                src="https://www.youtube.com/embed/KLXFHB4zVMI?si=jJNv8TurJtKlsHwA&amp;wmode=opaque"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                width="100%"
                height="100%"
              />
            </div>
          </section>
        </div>
      </main>

      <Footer hideColumns logoSrc="/patch-logo-2.png" />
    </div>
  );
}
