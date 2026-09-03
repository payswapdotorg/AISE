const services = [
  {
    title: "Backend API service",
    detail: "HTTP boundary with health/readiness and structured request logging.",
    command: "npm run dev:api",
  },
  {
    title: "Background worker",
    detail: "Separate process behind the job-queue boundary. No product authority yet.",
    command: "npm run dev:worker",
  },
  {
    title: "Shared packages (reserved)",
    detail: "shared-contracts (AISE-003) and engineering-model (AISE-011) are placeholders.",
    command: "packages/*",
  },
];

export default function Home() {
  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">AI Site Engineer</p>
        <h1>Reality-to-Engineering platform</h1>
        <p className="lede">
          Web workspace foundation. The browser engineering workspace — model review, evidence
          inspection and measurement — is implemented in AISE-015.
        </p>
      </header>

      <section aria-labelledby="foundation-heading" className="foundation">
        <h2 id="foundation-heading">AISE-001 foundation status</h2>
        <ul className="cards">
          {services.map((service) => (
            <li key={service.title} className="card">
              <h3>{service.title}</h3>
              <p>{service.detail}</p>
              <code>{service.command}</code>
            </li>
          ))}
        </ul>
        <p className="note">
          This page is a deliberate placeholder: no product features belong to the foundation
          Work Item.
        </p>
      </section>
    </div>
  );
}
