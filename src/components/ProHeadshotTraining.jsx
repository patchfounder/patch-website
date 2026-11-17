import { useState } from 'react';
import './ActivationTraining.css';
import './ProHeadshotTraining.css';

// Preparation source: Coaches/Training/email/pre-masterclass-photo.html.
// M1 keeps PRE.05 historically; this page does not rewrite the approved email or its ledger.
export const HEADSHOT_PROMPT = 'Create a professional LinkedIn headshot of me in the style of one of these examples. Keep me recognisable, with the same pose and a natural smile showing my teeth. Use a white top, blue blazer, soft lighting and a simple background.';
export const HEADSHOT_RESOURCE_PATH = '/training/resources/pro-headshot-examples.jpeg';

export const COACH_PROFILE_EXAMPLES = Object.freeze([
  { name: 'Kalista Zuchowska', url: 'https://www.linkedin.com/in/kalista-zuchowska/' },
  { name: 'Mariem Naguib', url: 'https://www.linkedin.com/in/mariem-naguib/' },
  { name: 'Evie May Cassidy', url: 'https://www.linkedin.com/in/evie-may-cassidy/' },
  { name: 'Josh Hack', url: 'https://www.linkedin.com/in/joshjhack/' },
  { name: 'Iwan Price', url: 'https://www.linkedin.com/in/iwan-price/' },
]);

function SectionHeading({ number, eyebrow, title, id }) {
  return <div className="activation-training-section-heading">
    <span aria-hidden="true">{number}</span>
    <div><p className="activation-training-eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div>
  </div>;
}

export default function ProHeadshotTraining() {
  const [copyStatus, setCopyStatus] = useState('');
  const resourceUrl = new URL(HEADSHOT_RESOURCE_PATH,
    typeof window === 'undefined' ? 'https://www.patch.app' : window.location.origin).href;

  async function copyPrompt() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(HEADSHOT_PROMPT);
      setCopyStatus('Prompt copied.');
    } catch {
      setCopyStatus('Select the prompt above to copy it.');
    }
  }

  return <div className="activation-training-page pro-headshot-page">
    <header className="activation-training-header">
      <div className="activation-training-brand">
        <img src="/patch-logo-2.png" width="96" height="42" alt="Patch" />
        <span className="activation-training-brand-caption">Academy</span>
      </div>
      <span className="activation-training-stage">Module 1 of 5</span>
    </header>

    <main className="activation-training-shell">
      <header className="activation-training-intro">
        <p className="activation-training-eyebrow">M1 · Your professional brand</p>
        <h1>Pro Headshot Stage</h1>
        <p>A strong LinkedIn profile starts with a great photograph. Let’s create a professional headshot that still looks like you.</p>
        <div className="activation-training-progress" aria-label="Module 1 of 5">
          {Array.from({ length: 5 }, (_, index) => <span key={index} className={index === 0 ? 'is-current' : undefined} />)}
        </div>
      </header>

      <section className="activation-training-section" aria-labelledby="m1-examples-title">
        <SectionHeading number="01" eyebrow="The starting point" title="A photograph you’re proud of" id="m1-examples-title" />
        <p>We’re building your professional brand to strengthen your training contract applications. Use these examples as a guide to your LinkedIn profile picture.</p>
        <figure className="pro-headshot-examples">
          <img src={resourceUrl} width="1125" height="1130" alt="Examples of professional Patch Coach headshots, with natural smiles, smart clothing and simple backgrounds" decoding="async" />
          <figcaption>Headshot examples · JPEG</figcaption>
        </figure>
        <p className="pro-headshot-resource-label">Save the examples to use with your photo:</p>
        <a className="activation-training-resource activation-training-download pro-headshot-download" href={resourceUrl} download="PRE.05 Headshot Examples.jpeg">{resourceUrl}</a>
      </section>

      <section className="activation-training-section" aria-labelledby="m1-steps-title">
        <SectionHeading number="02" eyebrow="Before your review" title="Create your headshot in five steps" id="m1-steps-title" />
        <ol className="pro-headshot-steps">
          <li>
            <h3>Look at the examples</h3>
            <p>Review the headshots above and the LinkedIn examples below.</p>
          </li>
          <li>
            <h3>Take a clear photograph of yourself</h3>
            <p>Cross your arms, put one shoulder slightly back, look directly at the camera and <strong>smile with your teeth showing</strong>. Ideally, wear a white top and blue blazer.</p>
          </li>
          <li>
            <h3>Add your photo and the examples to ChatGPT</h3>
            <p>Drop your photograph and the headshot examples into the same ChatGPT conversation.</p>
          </li>
          <li>
            <h3>Use this prompt</h3>
            <blockquote className="pro-headshot-prompt">{HEADSHOT_PROMPT}</blockquote>
            <div className="pro-headshot-copy-row">
              <button type="button" className="pro-headshot-copy" onClick={copyPrompt}>Copy prompt</button>
              <span className="pro-headshot-copy-status" role="status" aria-live="polite">{copyStatus}</span>
            </div>
          </li>
          <li>
            <h3>Send Patrick your finished headshot</h3>
            <p>Email ChatGPT’s finished photograph to <strong>patrick@patch.app</strong> before your Pro Headshot review. We’ll look at it together and agree any final changes.</p>
          </li>
        </ol>
      </section>

      <section className="activation-training-section" aria-labelledby="m1-call-title">
        <SectionHeading number="03" eyebrow="Review it together" title="Your Module Call" id="m1-call-title" />
        <p>Once you’ve sent your photograph, we’ll review it with you before moving on to your LinkedIn Makeover.</p>
        <div className="pro-headshot-call-card">
          <p>Your personal Module Call link comes with your confirmed appointment.</p>
        </div>
      </section>

      <section className="activation-training-section pro-headshot-profile-section" aria-labelledby="m1-profiles-title">
        <details className="pro-headshot-profiles">
          <summary id="m1-profiles-title">LinkedIn examples from our Coaches</summary>
          <div className="pro-headshot-profile-list">
            {COACH_PROFILE_EXAMPLES.map(profile => <div key={profile.url} className="pro-headshot-profile">
              <p>{profile.name}</p>
              <a href={profile.url} target="_blank" rel="noopener noreferrer">{profile.url}</a>
            </div>)}
          </div>
        </details>
      </section>

      <footer className="activation-training-footer"><span>PATCH ACADEMY</span><span>Your professional brand, one step at a time.</span></footer>
    </main>
  </div>;
}
