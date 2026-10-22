import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('landing download links use the published App Store listing without a popup', () => {
  const appStoreSource = readSource('src/app-store.js');
  const appSource = readSource('src/App.jsx');
  const stylesSource = readSource('src/styles.css');
  const linkSources = [
    'src/components/Header.jsx',
    'src/components/Hero.jsx',
    'src/components/Pricing.jsx',
    'src/components/Footer.jsx',
  ].map(readSource).join('\n');

  assert.match(appStoreSource, /https:\/\/apps\.apple\.com\/app\/id6806283919/);
  assert.equal((linkSources.match(/href=\{APP_STORE_URL\}/g) || []).length, 5);
  assert.doesNotMatch(`${appSource}\n${linkSources}`, /onDownloadClick|href="#download"/);
  assert.doesNotMatch(appSource, /download-modal|openDownloadModal|isDownloadModalOpen/);
  assert.doesNotMatch(stylesSource, /\.download-modal|\.download-phone-/);
});
