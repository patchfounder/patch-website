import { useEffect, useState } from 'react';

const slides = [
  {
    label: 'Luis González García',
    title: 'Partner at Watson Farley & Williams',
    src: '/testimonial-1.png',
    quote:
      'The flexibility made it easy to keep practising, even during a demanding working week.',
  },
  {
    label: 'Javier Tarjuelo',
    title: 'Senior Associate at Pérez-Llorca',
    src: '/testimonial-2.png',
    quote:
      'Regular conversations with Patch help me stay clear, confident, and consistent in my voice.',
  },
  {
    label: 'Idoya Fernández Elorza',
    title: 'Head of Knowledge and Innovation at Cuatrecasas',
    src: '/testimonial-3.png',
    quote:
      'The coaches are excellent. They bring warmth, judgement, and real professional insight.',
  },
  {
    label: 'Raúl Vázquez',
    title: 'Partner at Garrigues',
    src: '/testimonial-4.png',
    quote:
      'Patch is a practical way to keep improving your professional voice through regular conversation.',
  },
  {
    label: 'José María Anarte',
    title: 'Partner at Watson Farley & Williams',
    src: '/testimonial-5.png',
    quote:
      'The concierge support made the whole experience feel personal, organised, and effortless.',
  },
];

const visibleOffsets = [-2, -1, 0, 1, 2];

export default function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [timerKey, setTimerKey] = useState(0);

  const changeSlide = (direction) => {
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
    setTimerKey((current) => current + 1);
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
      setTimerKey((current) => current + 1);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [timerKey]);

  return (
    <section className="section testimonials-section" id="testimonials">
      <div className="page-shell testimonial-carousel-shell">
        <header className="testimonial-carousel-heading">
          <h2>Lawyers who believed in us</h2>
          <p>
            We are grateful to the lawyers who supported our early growth
          </p>
        </header>

        <div className="testimonial-progress" aria-label={`Slide ${activeIndex + 1} of 5`}>
          {slides.map((slide, index) => (
            <span
              className={index === activeIndex ? 'active' : ''}
              key={slide.src}
              aria-hidden="true"
            >
              {index === activeIndex && <i key={timerKey} />}
            </span>
          ))}
        </div>

        <div className="testimonial-carousel">
          <button
            className="testimonial-arrow testimonial-arrow-previous"
            type="button"
            onClick={() => changeSlide(-1)}
            aria-label="Previous testimonial"
          >
            ←
          </button>

          <div className="testimonial-track">
            {visibleOffsets.map((offset) => {
              const slideIndex = (activeIndex + offset + slides.length) % slides.length;
              const slide = slides[slideIndex];

              return (
                <article
                  className={`testimonial-slide testimonial-slide-${offset}`}
                  key={slide.src}
                  aria-hidden={offset !== 0}
                >
                  <div className="testimonial-image">
                    <img src={slide.src} alt={slide.label} />
                  </div>
                  {offset === 0 && (
                    <div className="testimonial-copy">
                      <span className="testimonial-name">{slide.label}</span>
                      <span className="testimonial-title">{slide.title}</span>
                      <blockquote className="testimonial-active-quote">{slide.quote}</blockquote>
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
            aria-label="Next testimonial"
          >
            →
          </button>
        </div>

      </div>
    </section>
  );
}
