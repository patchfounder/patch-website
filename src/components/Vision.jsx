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
            <img src="/patrickbeattie.jpg" alt="Patrick Beattie, Founder and CEO of Patch" />
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
              From 447 Broadway in SoHo, New York, we are building a product with a simple
              purpose: to help lawyers develop clearer communication, stronger influence and a
              more confident professional presence.
            </p>
          </div>
        </div>

        <div className="vision-technology">
          <div className="vision-technology-copy">
            <p>
              Legal AI is changing how lawyers research, draft and prepare for complex work. Patch
              is using exciting new tools to help lawyers navigate this shift with confidence and
              understand where technology can add real value.
            </p>
            <p>
              Effective prompting is becoming a practical communication skill. Our sessions help
              lawyers turn legal judgement into clear instructions, develop more effective prompts
              and refine their approach through thoughtful iteration.
            </p>
            <p>
              The aim is not to replace expertise, but to strengthen it. By combining real
              conversations with guided practice, we help lawyers assess AI output carefully and
              present their conclusions with the judgement, clarity and confident human voice that
              clients and colleagues expect.
            </p>
          </div>

          <figure className="vision-office">
            <img
              src="/office-447-broadway-v3.jpg"
              alt="447 Broadway in SoHo, New York, where Patch is based"
            />
            <figcaption>447 Broadway, SoHo, New York</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
