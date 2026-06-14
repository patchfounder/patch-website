import { useEffect } from 'react';
import Footer from './Footer.jsx';

export default function ActivityContent() {
  useEffect(() => {
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobotsContent = robotsMeta?.getAttribute('content');
    const routeRobotsMeta = robotsMeta || document.createElement('meta');

    routeRobotsMeta.setAttribute('name', 'robots');
    routeRobotsMeta.setAttribute('content', 'noindex, nofollow');

    if (!robotsMeta) {
      document.head.appendChild(routeRobotsMeta);
    }

    document.title = 'LinkedIn Activity | Patch';

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
            <h1>LinkedIn Activity</h1>
            <p>We are going to be looking closely at how to write the perfect post.</p>
          </header>

          <section className="meeting-booking" aria-label="LinkedIn activity video">
            <div className="training-video">
              <iframe
                src="https://www.youtube.com/embed/8jfKkfdnL0o?wmode=opaque"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
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
