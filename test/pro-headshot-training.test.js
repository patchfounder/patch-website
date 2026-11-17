import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

const require = createRequire(import.meta.url);
const sourceUrl = new URL('../src/components/ProHeadshotTraining.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const { code } = await transformWithEsbuild(source, sourceUrl.pathname, {
  loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}',
});
function fixture(navigator = {}) {
  let status;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, navigator,
    require(name) {
      if (name.endsWith('.css')) return {};
      if (name === 'react') return { ...React, useState: () => ['', value => { status = value; }] };
      if (name === 'react/jsx-runtime') return require(name);
      throw new Error('Unexpected M1 dependency: ' + name);
    },
  });
  const tree = module.exports.default();
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    const children = Array.isArray(node.props?.children) ? node.props.children.flat(Infinity) : [node.props?.children];
    for (const child of children) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  return { html: renderToStaticMarkup(tree), values: module.exports, button: find(tree, n => n.type === 'button'), status: () => status };
}

test('M1 teaches the five headshot steps with the exact approved prompt and profile examples', () => {
  const { html, values } = fixture();
  assert.match(html, /<h1>Pro Headshot Stage<\/h1>/);
  assert.match(html, /Module 1 of 5/);
  assert.equal((html.match(/<li>/g) || []).length, 5);
  assert.match(html, /smile with your teeth showing/);
  assert.match(html, /white top and blue blazer/);
  assert.match(html, /patrick@patch.app/);
  assert.equal(values.HEADSHOT_PROMPT, 'Create a professional LinkedIn headshot of me in the style of one of these examples. Keep me recognisable, with the same pose and a natural smile showing my teeth. Use a white top, blue blazer, soft lighting and a simple background.');
  assert.deepEqual(Array.from(values.COACH_PROFILE_EXAMPLES, p => p.url), [
    'https://www.linkedin.com/in/kalista-zuchowska/', 'https://www.linkedin.com/in/mariem-naguib/',
    'https://www.linkedin.com/in/evie-may-cassidy/', 'https://www.linkedin.com/in/joshjhack/',
    'https://www.linkedin.com/in/iwan-price/',
  ]);
  for (const profile of values.COACH_PROFILE_EXAMPLES) assert.ok(html.includes(`href="${profile.url}" target="_blank" rel="noopener noreferrer">${profile.url}</a>`));
});

test('M1 publishes the original JPEG with its full visible download URL', () => {
  const { html, values } = fixture();
  const url = 'https://www.patch.app' + values.HEADSHOT_RESOURCE_PATH;
  assert.ok(html.includes(`href="${url}" download="PRE.05 Headshot Examples.jpeg">${url}</a>`));
  const image = readFileSync(new URL('../public/training/resources/pro-headshot-examples.jpeg', import.meta.url));
  assert.equal(image.length, 86088);
  assert.equal(createHash('sha256').update(image).digest('hex'), '08f76a53b193c28be0d0ca836399a21a71fb61515597d6b708e6f334d5cdb8ed');
});

test('M1 does not substitute a shared room, self-booking page or unrelated tutorial for a Module Call', () => {
  const { html } = fixture();
  assert.match(html, /Your Module Call/);
  assert.match(html, /Your personal Module Call link comes with your confirmed appointment/);
  assert.doesNotMatch(html, /<iframe|<video|cal\.com|patch-call-process|Placeholder tutorial|<form|\bdisabled\b/);
  assert.doesNotMatch(source, /fetch\(|setInterval|livekit-client|activation-room|premas-room|sessionStorage/);
});

test('Copy prompt writes exactly the approved prompt without an account or network request', async () => {
  let copied;
  const f = fixture({ clipboard: { writeText: async text => { copied = text; } } });
  await f.button.props.onClick();
  assert.equal(copied, f.values.HEADSHOT_PROMPT);
  assert.equal(f.status(), 'Prompt copied.');
});

test('Copy prompt offers a usable fallback when clipboard permission is unavailable', async () => {
  const f = fixture();
  await f.button.props.onClick();
  assert.equal(f.status(), 'Select the prompt above to copy it.');
});
