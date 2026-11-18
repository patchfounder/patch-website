// Retired presentation, booking and tutorial URLs. Curriculum definitions,
// videos, resources and training history remain independent of these pages.
export const RETIRED_TRAINING_PATHS = Object.freeze([
  '/M1',
  '/M2',
  '/M3',
  '/M4',
  '/M5',
  '/M6',
  '/training',
  '/training/prohea',
  '/training/activation',
  '/training/activation/host',
  '/training/activa',
  '/training/activa/host',
  '/training/premas',
  '/training/premas/host',
  '/training/linkmc',
  '/training/linkmc/host',
  '/training/linkac',
  '/training/linkac/host',
  '/training/knowyc',
  '/training/knowyc/host',
  '/training/certif',
  '/training/certif/host',
  '/activation',
  '/pre',
  '/masterclass',
  '/activity',
  '/kc',
  '/certified',
  '/premasterclass-content',
  '/activity-content',
  '/reactivate',
  '/cancel',
]);

const retiredPages = new Set(RETIRED_TRAINING_PATHS);

export function isRetiredTrainingPage(pathname) {
  if (typeof pathname !== 'string') return false;
  const path = pathname.split(/[?#]/, 1)[0]
    .replace(/\/+$/, '')
    .replace(/\/index\.html$/, '')
    .replace(/\/+$/, '');
  return retiredPages.has(path);
}
