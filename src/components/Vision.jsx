export default function Vision() {
  return (
    <section className="section vision-section" id="our-vision" aria-labelledby="vision-title">
      <div className="page-shell">
        <div className="vision-heading">
          <p className="eyebrow">Our Vision</p>
          <h2 id="vision-title">The future still needs a human voice</h2>
        </div>

        <div className="vision-editorial">
          <aside className="vision-founder">
            <img src="/patrickbeattie.jpeg" alt="Patrick Beattie, Founder and CEO of Patch" />
            <div>
              <strong>Patrick Beattie</strong>
              <span>Founder &amp; CEO</span>
            </div>
          </aside>

          <div className="vision-copy">
            <p>
              We value human conversations over artificial ones. Every session on Patch is a real
              conversation with a real coach, shaped around topics and situations that are
              engaging and worth exploring.
            </p>
            <p>
              Patch was built for people who are committed to self-growth and understand that
              improvement depends on consistency. For lawyers, focused practice should become part
              of a professional routine: regular enough to create progress, manageable enough to
              fit around the working day, and designed so that it does not add unnecessary
              pressure.
            </p>
            <p>
              From Menara Darussalam in Kuala Lumpur, we are building a product with a simple
              purpose: to help lawyers develop clearer communication, stronger influence and a
              more confident professional presence.
            </p>
          </div>
        </div>

        <figure className="vision-office">
          <img
            src="/office.jpeg"
            alt="Menara Darussalam in Kuala Lumpur, where Patch is based"
          />
          <figcaption>Menara Darussalam, Kuala Lumpur</figcaption>
        </figure>
      </div>
    </section>
  );
}
