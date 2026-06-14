const roles = ['Associates', 'Senior associates', 'Counsel', 'Partners'];

export default function SocialProof() {
  return (
    <section className="trust-strip" aria-label="Who Patch is for">
      <div className="page-shell trust-layout">
        <p>Designed for lawyers at top-tier and international firms</p>
        <div className="trust-roles">
          {roles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
