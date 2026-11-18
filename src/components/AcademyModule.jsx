import { useState } from 'react';
import {
  ACADEMY_MODULES,
  HEADSHOT_PROMPT,
  HEADSHOT_EXAMPLES_RESOURCE_URL,
  PUBLIC_COACH_PROFILE_EXAMPLES,
  KYC_VIDEO_TEXT_EXAMPLES,
} from '../academy-modules.js';
import './AcademyModule.css';

function FullUrlLink({ url, downloadName }) {
  return <a className="academy-module-url" href={url}
    {...(downloadName ? { download: downloadName } : { target: '_blank', rel: 'noopener noreferrer' })}>
    {url}
  </a>;
}

function Tutorial({ module }) {
  return <section className="academy-module-tutorial" aria-label={module.title + ' tutorial'}>
    {module.videoUrl ? <>
      <div className="academy-module-video">
        <iframe src={module.videoUrl} title={module.videoTitle} loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen />
      </div>
      <div className="academy-module-video-caption">
        <p>{module.videoTitle}</p>
        <FullUrlLink url={module.videoPageUrl} />
      </div>
    </> : <div className="academy-module-video academy-module-video-pending" role="note">
      <p className="academy-module-video-title">{module.videoTitle}</p>
      <p>Tutorial coming soon</p>
      <p className="academy-module-small">Use the preparation steps below.</p>
    </div>}
  </section>;
}

function HeadshotPrompt({ copyStatus, onCopy }) {
  return <div className="academy-module-prompt-wrap">
    <blockquote className="academy-module-prompt">{HEADSHOT_PROMPT}</blockquote>
    <div className="academy-module-copy-row">
      <button className="academy-module-copy" type="button" onClick={onCopy}>Copy prompt</button>
      <span className="academy-module-small" role="status" aria-live="polite">{copyStatus}</span>
    </div>
  </div>;
}

function KnowYourCoachText() {
  return <div className="academy-module-kyc-copy">
    <h3>1. Short text for your video</h3>
    <p>Write two paragraphs using your own actual details. Please keep each paragraph as close as possible to the length of its example, including spaces and punctuation.</p>
    {KYC_VIDEO_TEXT_EXAMPLES.map(example => <div className="academy-module-copy-example" key={example.label}>
      <p className="academy-module-example-label">{example.label} · {example.characters} characters</p>
      <p><em>{example.text}</em></p>
    </div>)}
    <p className="academy-module-small">These lengths help the text fit the video design. You do not need to use the example person’s course, interests or hobbies.</p>
    <h3>2. Text for your LinkedIn post</h3>
    <p>Separately, write a couple of sentences or a paragraph about yourself. You have more freedom here: the video’s character targets do not apply to the post.</p>
    <div className="academy-module-copy-example">
      <p>Know Your Coach | Your name</p>
      <p>Patch App would like to introduce you to another future talent in law.</p>
      <p className="academy-module-small">Your own introduction follows this opening. The post accompanies your video on the Patch App LinkedIn page.</p>
    </div>
    <p>Email both parts to <strong>patrick@patch.app</strong>, labelled “Video text” and “LinkedIn post text”.</p>
  </div>;
}

export default function AcademyModule({ module }) {
  const current = module || ACADEMY_MODULES[0];
  const [copyStatus, setCopyStatus] = useState('');
  const headingId = current.code.toLowerCase() + '-preparation';

  async function copyPrompt() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(HEADSHOT_PROMPT);
      setCopyStatus('Prompt copied.');
    } catch {
      setCopyStatus('Select the prompt above to copy it.');
    }
  }

  return <div className="academy-module-page">
    <div className="academy-module-shell">
      <header className="academy-module-header">
        <div className="academy-module-brand">
          <img src="/patch-logo-2.png" width="86" height="38" alt="Patch" />
          <span>Academy</span>
        </div>
        <p className="academy-module-stage">Module {current.number} of {ACADEMY_MODULES.length}</p>
      </header>

      <main>
        <header className="academy-module-intro">
          <p className="academy-module-eyebrow">{current.code} · {current.title}</p>
          <h1>{current.headline}</h1>
          <p>{current.intro}</p>
        </header>

        <Tutorial module={current} />

        <section className="academy-module-preparation" aria-labelledby={headingId}>
          <h2 id={headingId}>Before we meet</h2>
          <ol className="academy-module-steps">
            {current.steps.map((step, index) => <li key={step}>
              <p>{step}</p>
              {current.code === 'M2' && index === 3 && <HeadshotPrompt copyStatus={copyStatus} onCopy={copyPrompt} />}
            </li>)}
          </ol>
        </section>

        <section className="academy-module-resources" aria-labelledby={current.code.toLowerCase() + '-resources'}>
          <h2 id={current.code.toLowerCase() + '-resources'}>{current.resourceTitle}</h2>
          <p>{current.resourceDescription}</p>

          {current.code === 'M2' && <figure className="academy-module-headshot-examples">
            <img src={HEADSHOT_EXAMPLES_RESOURCE_URL} width="1125" height="1130" decoding="async" loading="lazy"
              alt="Professional Patch Coach headshot examples with natural smiles, smart clothing and simple backgrounds" />
            <figcaption>Headshot examples</figcaption>
          </figure>}

          {current.resources.map(resource => <div className="academy-module-resource" key={resource.url}>
            <h3>{resource.title}</h3>
            <FullUrlLink url={resource.url} downloadName={resource.downloadName} />
          </div>)}

          {current.checklist && <ul className="academy-module-checklist">
            {current.checklist.map(item => <li key={item}>{item}</li>)}
          </ul>}

          {current.example && <div className="academy-module-written-example">
            <h3>A structure to make your own</h3>
            <p><em>{current.example}</em></p>
          </div>}

          {current.code === 'M2' && <details className="academy-module-profile-examples">
            <summary>LinkedIn examples from our Coaches</summary>
            <div>
              {PUBLIC_COACH_PROFILE_EXAMPLES.map(profile => <div className="academy-module-profile" key={profile.url}>
                <p>{profile.name}</p>
                <FullUrlLink url={profile.url} />
              </div>)}
            </div>
          </details>}

          {current.code === 'M5' && <KnowYourCoachText />}
        </section>
      </main>

      <footer className="academy-module-footer">
        <p>Your module call takes place in Patch.</p>
        {current.nextModuleUrl ? <div className="academy-module-next">
          <p>Next: {current.nextModuleCode} · {current.nextModuleTitle}</p>
          <a className="academy-module-url" href={current.nextModuleUrl}>{current.nextModuleUrl}</a>
        </div> : <p>Final module</p>}
      </footer>
    </div>
  </div>;
}
