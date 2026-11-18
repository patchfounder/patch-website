import { isRetiredTrainingPage } from '../src/retired-training-pages.js';

// Mount before static serving and the SPA fallback. Match page URLs exactly so
// that the resources kept below /training and the room APIs are unaffected.
export function retireTrainingPages(req, res, next) {
  if (!['GET', 'HEAD'].includes(req.method) || !isRetiredTrainingPage(req.path)) {
    return next();
  }
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, noarchive');
  return res.status(404).type('text/plain').send('Not found.');
}
