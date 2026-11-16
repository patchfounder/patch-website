// Public curriculum presentation and route map. No credentials or Coach progress.
const ORIGIN = 'https://www.patch.app';
const VIDEO_URL = 'https://www.youtube-nocookie.com/embed/KLXFHB4zVMI?rel=0';
const VIDEO_PAGE_URL = 'https://www.youtube.com/watch?v=KLXFHB4zVMI';
const definitions = [
  { code: 'activa', id: 'activation', title: 'Activation', headline: 'A confident first call.', intro: 'Get to know the Patch Call in 7 Steps, then meet Patrick for a short one-to-one check-in. Bring your questions. We’re here to help you get started.', bookingUrl: 'https://cal.com/patchapp/activation', callCopy: 'We’ll answer your questions and make sure you feel ready to deliver your first Patch Call.', resourceTitle: 'Your call script', resourceCopy: 'The step-by-step Patch Call Process is here whenever you need it. Read it alongside the video, and note anything you’d like to ask Patrick.' },
  { code: 'premas', title: 'Pre-Masterclass', headline: 'Your professional profile starts here.', intro: 'Build your professional brand with a strong LinkedIn profile photograph. Email Patrick your finished photograph before your short review.', bookingUrl: ORIGIN + '/pre/', callCopy: 'Review your photograph with Patrick, ask your questions and agree the next step towards your LinkedIn Masterclass.' },
  { code: 'linkmc', title: 'LinkedIn Masterclass', headline: 'Make your experience stand out.', intro: 'Develop a LinkedIn profile that presents your experience clearly and supports your professional brand.', bookingUrl: ORIGIN + '/masterclass/', callCopy: 'Talk through your profile with Patrick and agree the improvements that will help you move forward.' },
  { code: 'linkac', title: 'LinkedIn Activity', headline: 'Put your professional voice to work.', intro: 'Learn to share your experience through thoughtful LinkedIn posts and build your professional network.', bookingUrl: ORIGIN + '/activity/', callCopy: 'Review your LinkedIn activity with Patrick, ask questions and agree your next practical step.' },
  { code: 'knowyc', title: 'Know Your Coach', headline: 'Introduce yourself to the network.', intro: 'Bring together your approved profile photograph and introduction text for your Know Your Coach video and accompanying LinkedIn post.', bookingUrl: ORIGIN + '/kc/', callCopy: 'Review your introduction with Patrick and agree the photograph, short video text and accompanying post.' },
  { code: 'certif', title: 'Certification', headline: 'Celebrate your journey.', intro: 'Reflect on your time at Patch and discuss your certificate, reference and next steps with Patrick.', bookingUrl: ORIGIN + '/certified/', callCopy: 'Look back on your development, discuss your certificate and reference, and ask Patrick about what comes next.' },
];
export const TRAINING_STAGES = Object.freeze(definitions.map((item, index) => {
  const next = definitions[index + 1];
  return Object.freeze({
    ...item,
    id: item.id || item.code,
    step: index + 1,
    moduleNumber: index || null,
    path: '/training/' + item.code,
    hostPath: '/training/' + item.code + '/host',
    apiPath: '/api/training/' + (item.id || item.code) + '-room',
    videoUrl: VIDEO_URL,
    videoPageUrl: VIDEO_PAGE_URL,
    videoTitle: index === 0 ? 'How to Deliver a Patch Call in 7 Steps' : 'Placeholder tutorial video',
    placeholderVideo: index > 0,
    resourceTitle: item.resourceTitle || 'Your training reference',
    resourceCopy: item.resourceCopy || 'Keep the Patch Call Process handy as a general coaching reference. Module-specific resources will be added here.',
    nextStageUrl: next ? ORIGIN + '/training/' + next.code : null,
    // Retain the already-published Activation API handoff for old room clients.
    handoffUrl: index === 0 ? ORIGIN + '/pre/' : next ? ORIGIN + '/training/' + next.code : null,
    nextStageTitle: next?.title || null,
    nextStageModule: next ? index + 1 : null,
    nextStageCopy: next?.intro || null,
  });
}));
export const DEFAULT_TRAINING_STAGE = TRAINING_STAGES[0];
export const getTrainingStage = code => TRAINING_STAGES.find(stage => stage.code === code) || null;
