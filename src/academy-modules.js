// Public preparation content only. Display numbering does not rewrite historical
// PRE.05 / MC.15 / LA.05 / KC.05 / CT.10 records or create training appointments.
export const ACADEMY_ORIGIN = 'https://www.patch.app';
export const HEADSHOT_PROMPT = 'Create a professional LinkedIn headshot of me in the style of one of these examples. Keep me recognisable, with the same pose and a natural smile showing my teeth. Use a white top, blue blazer, soft lighting and a simple background.';
export const HEADSHOT_EXAMPLES_RESOURCE_URL = ACADEMY_ORIGIN + '/training/resources/pro-headshot-examples.jpeg';
export const PUBLIC_COACH_PROFILE_EXAMPLES = Object.freeze([
  { name: 'Kalista Zuchowska', url: 'https://www.linkedin.com/in/kalista-zuchowska/' },
  { name: 'Mariem Naguib', url: 'https://www.linkedin.com/in/mariem-naguib/' },
  { name: 'Evie May Cassidy', url: 'https://www.linkedin.com/in/evie-may-cassidy/' },
  { name: 'Josh Hack', url: 'https://www.linkedin.com/in/joshjhack/' },
  { name: 'Iwan Price', url: 'https://www.linkedin.com/in/iwan-price/' },
]);

// Approved examples: count paragraph text, including spaces and punctuation.
export const KYC_VIDEO_TEXT_EXAMPLES = Object.freeze([
  { label: 'Studies and legal interests', text: 'Saskia is a LLB student interested in environmental and medical law.', characters: 68 },
  { label: 'Three spare-time interests', text: 'In her spare time, Saskia enjoys reading, running and going to local art exhibitions.', characters: 85 },
]);

const definitions = [
  {
    code: 'M1', title: 'Activation', legacyStageCode: 'ACT.30', legacyModuleNumber: null,
    headline: 'A confident first call.',
    intro: 'Learn the Patch Call in 7 Steps, then meet Patrick for a short check-in. Bring your questions.',
    videoId: 'KLXFHB4zVMI', videoTitle: 'How to Deliver a Patch Call in 7 Steps',
    steps: [
      'Watch the tutorial and familiarise yourself with the seven steps.',
      'Read your call script and practise how you would open and guide a Patch Call.',
      'Check that you can sign in to Patch, and bring any questions to your Activation call.',
    ],
    resourceTitle: 'Your call script',
    resourceDescription: 'Keep the Patch Call Process beside you while you practise. Your individual login details are provided separately.',
    resources: [{ title: 'Patch Call Process · PDF', url: ACADEMY_ORIGIN + '/training/patch-call-process.pdf', downloadName: 'Patch Call Process.pdf' }],
  },
  {
    code: 'M2', title: 'Pro Headshot', legacyStageCode: 'PRE.05', legacyModuleNumber: 1,
    headline: 'Your professional profile starts here.',
    intro: 'Create a strong LinkedIn profile photograph—the first step in building your professional brand.',
    videoId: 'RSmXZOyff4U', videoTitle: 'Pre-Masterclass photo preparation tutorial',
    steps: [
      'Look at the headshot examples below and use them as a guide.',
      'Take a clear photograph: cross your arms, put one shoulder slightly back, look directly at the camera and smile with your teeth showing. Ideally, wear a white top and blue blazer.',
      'Add your photograph and the headshot examples to the same ChatGPT conversation.',
      'Use the prompt below to create a professional headshot that still looks like you.',
      'Email your finished headshot to patrick@patch.app before your review. We will look at it together and agree any final changes.',
    ],
    resourceTitle: 'Headshot guide and examples',
    resourceDescription: 'Save these examples to add alongside your photograph. Use your own actual appearance; Patrick will review the finished image with you.',
    resources: [{ title: 'Headshot examples · JPEG', url: HEADSHOT_EXAMPLES_RESOURCE_URL, downloadName: 'PRE.05 Headshot Examples.jpeg' }],
  },
  {
    code: 'M3', title: 'LinkedIn Makeover', legacyStageCode: 'MC.15', legacyModuleNumber: 2,
    headline: 'Make your experience stand out.',
    intro: 'Turn your photograph, experience and ambitions into a clear, professional LinkedIn profile.',
    videoId: null, videoTitle: 'Build your LinkedIn profile',
    steps: [
      'Have your approved photograph and full LinkedIn profile URL ready.',
      'Work through the profile checklist below, using your real experience and interests.',
      'Bring your profile and any questions to your review with Patrick.',
    ],
    resourceTitle: 'Your profile checklist',
    resourceDescription: 'Prepare these parts of your profile before we review it together.',
    resources: [],
    checklist: [
      'Photograph: use the professional headshot agreed during your photo review.',
      'Banner: choose a clear, professional banner that supports your profile.',
      'Headline: explain your current role or studies and the direction you want to take.',
      'About: introduce your interests, experience and what you can contribute.',
      'Experience: describe your Patch role and responsibilities accurately, with relevant examples.',
      'Education and skills: check that they are current, consistent and relevant to your goals.',
    ],
  },
  {
    code: 'M4', title: 'LinkedIn Activity', legacyStageCode: 'LA.05', legacyModuleNumber: 3,
    headline: 'Put your professional voice to work.',
    intro: 'Share your experience, develop your commercial awareness and build your professional network.',
    videoId: '8jfKkfdnL0o', videoTitle: 'LinkedIn Activity tutorial',
    steps: [
      'Watch the tutorial, then choose one idea from your experience or legal interests.',
      'Prepare a short post: explain the idea, what you learned and why it matters.',
      'Bring your draft and one practical networking goal to your review with Patrick.',
    ],
    resourceTitle: 'Your first activity draft',
    resourceDescription: 'Use these prompts to prepare your own post. Keep client conversations and personal information private.',
    resources: [],
    checklist: [
      'What did you learn, notice or become curious about?',
      'How does it connect to your experience or an area of law that interests you?',
      'What is one useful point you can share with your network?',
      'Choose one relevant professional conversation to contribute to thoughtfully.',
    ],
    example: 'During my time at Patch, I have been developing [a specific skill]. One thing I have learned is [your own insight]. It has helped me understand [why that matters to your professional development].',
  },
  {
    code: 'M5', title: 'Know Your Coach', legacyStageCode: 'KC.05', legacyModuleNumber: 4,
    headline: 'Introduce yourself to the network.',
    intro: 'Help us create your introduction video and accompanying post for the Patch App LinkedIn page.',
    videoId: null, videoTitle: 'Your Know Your Coach introduction',
    steps: [
      'We will use the professional photograph you supplied during your headshot stage. Tell Patrick if you would like to discuss a different photograph.',
      'Write two short paragraphs for the video, keeping each close to the example character count below.',
      'Email your video text and your separate LinkedIn post text to patrick@patch.app.',
    ],
    resourceTitle: 'Your two kinds of text',
    resourceDescription: 'The short video text needs to fit the design. The accompanying LinkedIn post gives you more room to introduce yourself.',
    resources: [],
  },
  {
    code: 'M6', title: 'Certification', legacyStageCode: 'CT.10', legacyModuleNumber: 5,
    headline: 'Celebrate your progress.',
    intro: 'Reflect on your development, discuss your certificate and reference, and plan your next steps.',
    videoId: null, videoTitle: 'Your final programme review',
    steps: [
      'Reflect on your experience and how your professional profile, communication and network have developed.',
      'Prepare any final questions and tell Patrick what support would be useful next.',
      'Discuss your certificate, reference and how to present your experience on LinkedIn and your CV.',
    ],
    resourceTitle: 'Your final review',
    resourceDescription: 'Patrick will confirm your certification outcome. Your individual certificate and any reference will be provided separately by email.',
    resources: [],
    checklist: [
      'Identify a few concrete examples of your responsibilities and development.',
      'Check the name and contact details you would like used for your documents.',
      'Describe your role, dates and achievements accurately when updating your CV and LinkedIn.',
      'Ask Patrick about a reference or further advice whenever you need it.',
    ],
  },
];

export const ACADEMY_MODULES = Object.freeze(definitions.map((module, index) => Object.freeze({
  ...module,
  number: index + 1,
  path: '/' + module.code,
  url: ACADEMY_ORIGIN + '/' + module.code,
  videoUrl: module.videoId ? 'https://www.youtube-nocookie.com/embed/' + module.videoId + '?rel=0' : null,
  videoPageUrl: module.videoId ? 'https://www.youtube.com/watch?v=' + module.videoId : null,
  nextModuleCode: definitions[index + 1]?.code || null,
  nextModuleUrl: definitions[index + 1] ? ACADEMY_ORIGIN + '/' + definitions[index + 1].code : null,
  nextModuleTitle: definitions[index + 1]?.title || null,
})));

export function getAcademyModule(pathname) {
  if (typeof pathname !== 'string') return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  return ACADEMY_MODULES.find(module => module.path === path) || null;
}
