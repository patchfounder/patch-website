import { useEffect } from 'react';
import Footer from './Footer.jsx';

const LEGAL_EMAIL = 'mail@patch.app';

const ACCOUNT_DELETION_CONTENT = {
  title: 'Account Deletion',
  sections: [
    [
      'Patch users may request deletion of their Patch account and associated app data at any time.',
      'To request account deletion, please email:',
    ],
    [
      'Use the subject line:',
      'Patch Account Deletion Request',
      'In your email, please include the email address or phone number connected with your Patch account so that we can identify the correct account.',
      'Once we receive your request, we will verify the account and process deletion within a reasonable period. When your account is deleted, we will delete or anonymise personal data associated with your Patch account unless we are required or permitted to retain certain information for legitimate legal, security, fraud prevention, tax, accounting, dispute resolution, or regulatory reasons.',
    ],
  ],
  deletedItems: [
    'Account profile information',
    'Contact details connected with the account',
    'App usage history',
    'Coaching activity connected with the account',
    'Session records connected with the account',
    'Support communications where deletion is legally and operationally possible',
  ],
};

const PRIVACY_PARAGRAPHS = [
  'Last updated: June 15, 2026',
  'Patch is operated by Patch App LLC.',
  'Patch collects and processes personal information only where necessary to provide, operate, improve, and support the Patch service.',
  'The information we may process includes account information, contact details, learning activity, communication records, payment-related information, device information, and support correspondence.',
  'We use this information to provide the service, manage user accounts, schedule and support coaching sessions, process payments, improve the product, prevent misuse, and comply with legal obligations.',
  'We do not sell personal information.',
  'Where we use third-party service providers, we do so only where necessary for hosting, analytics, communication, payments, customer support, or other operational purposes connected with the Patch service.',
  'For privacy requests, please contact:',
];

const TERMS_PARAGRAPHS = [
  'Last updated: June 15, 2026',
  'Patch is operated by Patch App LLC.',
  'By accessing or using the Patch website, mobile applications, or related services, you agree to use the service lawfully and in accordance with these terms.',
  'Patch provides speaking, communication, and coaching-related services for legal professionals and related users.',
  'You are responsible for the information you provide when using Patch and for keeping your account details accurate and secure.',
  'You must not misuse the service, interfere with its operation, attempt to access it without authorisation, or use it in a way that infringes the rights of Patch, its users, coaches, clients, or service providers.',
  'Patch may update, change, suspend, improve, or discontinue parts of the service from time to time.',
  'All content, branding, software, designs, text, graphics, and other materials made available through Patch are owned by Patch App LLC or its licensors unless otherwise stated.',
  'The service may contain links to third-party services or websites. Patch is not responsible for third-party websites, services, or content.',
  'To the maximum extent permitted by applicable law, Patch provides the service on an “as is” and “as available” basis and does not guarantee uninterrupted availability or error-free operation.',
  'To the maximum extent permitted by applicable law, Patch App LLC will not be liable for indirect, incidental, special, consequential, or exemplary damages arising from use of the service.',
  'For legal questions, please contact:',
];

const PAGE_META = {
  title: 'Legal | Patch',
  description: 'Legal information for Patch, including privacy, terms, and account deletion.',
  heading: 'Legal',
};

function useLegalMeta() {
  useEffect(() => {
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionMeta?.getAttribute('content');
    const routeDescriptionMeta = descriptionMeta || document.createElement('meta');
    const previousTitle = document.title;

    document.title = PAGE_META.title;
    routeDescriptionMeta.setAttribute('name', 'description');
    routeDescriptionMeta.setAttribute('content', PAGE_META.description);

    if (!descriptionMeta) {
      document.head.appendChild(routeDescriptionMeta);
    }

    return () => {
      document.title = previousTitle;

      if (!descriptionMeta) {
        routeDescriptionMeta.remove();
      } else if (previousDescription) {
        descriptionMeta.setAttribute('content', previousDescription);
      }
    };
  }, []);
}

function EmailLink() {
  return <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>;
}

function AccountDeletionContent({ compact = false }) {
  return (
    <div className="legal-copy">
      {!compact && <h2>{ACCOUNT_DELETION_CONTENT.title}</h2>}
      {ACCOUNT_DELETION_CONTENT.sections[0].map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>
        <EmailLink />
      </p>
      {ACCOUNT_DELETION_CONTENT.sections[1].map((paragraph) => (
        <p className={paragraph === 'Patch Account Deletion Request' ? 'legal-subject' : ''} key={paragraph}>
          {paragraph}
        </p>
      ))}

      <h3>Data That May Be Deleted</h3>
      <p>When an account deletion request is completed, the data deleted or anonymised may include:</p>
      <ul>
        {ACCOUNT_DELETION_CONTENT.deletedItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h3>Data That May Be Retained</h3>
      <p>
        Some information may be retained where necessary for legal, accounting, security, fraud
        prevention, dispute resolution, or regulatory purposes.
      </p>
      <p>
        This may include payment records, invoices, transaction logs, audit records, and records
        required to protect the rights, safety, and security of Patch, its users, coaches, clients,
        and service providers.
      </p>

      <h3>Contact</h3>
      <p>For privacy, legal, or account deletion requests, please contact:</p>
      <p>
        <EmailLink />
      </p>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div className="legal-copy">
      <h2>Privacy Policy</h2>
      {PRIVACY_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>
        <EmailLink />
      </p>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="legal-copy">
      <h2>Terms of Service</h2>
      {TERMS_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>
        <EmailLink />
      </p>
    </div>
  );
}

export default function Legal() {
  useLegalMeta();

  return (
    <div className="legal-page">
      <main className="legal-main">
        <div className="page-shell legal-shell">
          <header className="legal-heading">
            <a className="legal-home-link" href="/" aria-label="Return to Patch homepage">
              <img src="/patch-logo-2.png" alt="Patch" />
            </a>
            <span className="legal-kicker">Patch App LLC</span>
            <h1>{PAGE_META.heading}</h1>
            <p>
              Privacy, terms, and account deletion information for Patch users, app store reviewers,
              and visitors to the Patch website.
            </p>
          </header>

          <section className="legal-document" aria-label={PAGE_META.heading}>
            <PrivacyPolicy />
            <TermsOfService />
            <AccountDeletionContent />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
