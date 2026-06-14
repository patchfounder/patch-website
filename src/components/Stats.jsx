import { useEffect, useRef, useState } from 'react';

const stats = [
  {
    value: 87,
    decimals: 0,
    suffix: '%',
    label: 'of Patch users stay for more than 12 months',
  },
  {
    value: 2.5,
    decimals: 1,
    suffix: 'hrs',
    label: 'average speaking practice per lawyer, per month',
  },
  {
    value: 1.18,
    decimals: 2,
    prefix: '£',
    suffix: 'bn',
    label: 'average annual revenue of our top five clients',
  },
];

const finalValues = stats.map((stat) => stat.value);

export default function Stats() {
  const sectionRef = useRef(null);
  const hasAnimated = useRef(false);
  const [values, setValues] = useState(stats.map(() => 0));

  useEffect(() => {
    const section = sectionRef.current;

    if (!section) {
      return undefined;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      setValues(finalValues);
      hasAnimated.current = true;
      return undefined;
    }

    let animationFrame;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimated.current) {
          return;
        }

        hasAnimated.current = true;
        observer.disconnect();
        const start = performance.now();
        const duration = 1400;

        const animate = (time) => {
          const progress = Math.min((time - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);

          setValues(stats.map((stat) => stat.value * eased));

          if (progress < 1) {
            animationFrame = requestAnimationFrame(animate);
          } else {
            setValues(finalValues);
          }
        };

        animationFrame = requestAnimationFrame(animate);
      },
      { threshold: 0.25 },
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <section className="section stats-section" ref={sectionRef} aria-label="Patch impact statistics">
      <div className="page-shell stats-layout">
        <div className="stats-intro">
          <p>
            Patch helps lawyers build a confident speaking voice. These numbers show retention and
            engagement, and the level of firms already represented across our client base.
          </p>
        </div>

        <div className="stats-list">
          {stats.map((stat, index) => (
            <article className="stats-row" key={stat.label}>
              <strong
                className="stats-value"
                aria-label={`${stat.prefix ?? ''}${stat.value.toFixed(stat.decimals)}${stat.suffix}`}
              >
                <span aria-hidden="true">
                  {stat.prefix}
                  {values[index].toFixed(stat.decimals)}
                  {stat.suffix}
                </span>
              </strong>
              <p>{stat.label}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
