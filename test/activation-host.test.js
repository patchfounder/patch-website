import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import * as stateExports from '../src/components/training-room-state.js';
import * as sharedExports from '../src/components/activation-shared-room-state.js';

const require = createRequire(import.meta.url);
async function load(name, imports = {}) {
  const file = new URL(`../src/components/${name}`, import.meta.url);
  const { code } = await transformWithEsbuild(readFileSync(file, 'utf8'), file.pathname, {
    loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}',
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (name.endsWith('.css')) return {};
      if (name === './training-room-state.js') return stateExports;
      if (name === './activation-shared-room-state.js') return sharedExports;
      if (imports[name]) return imports[name];
      assert.ok(['react', 'react/jsx-runtime'].includes(name), name);
      return require(name);
    },
  });
  return module.exports;
}
const training = await load('ActivationTraining.jsx');
const host = await load('ActivationHost.jsx', { './ActivationTraining.jsx': training });

test('host opens the same Activation page with Go and no password or manual room form', () => {
  const html = renderToStaticMarkup(React.createElement(host.default));
  assert.match(html, />Go<\/button>/);
  assert.match(html, /aria-label="Activation video call"/);
  assert.match(html, /Watch the seven steps/);
  assert.match(html, /Patch Call Process\.pdf/);
  assert.doesNotMatch(html, /<form|<input|password|access key|sign in|Add a booked session|Create five-minute room|#session=|#access=|LIVEKIT_API|TRAINING_HOST_ACCESS_KEY/i);
  assert.doesNotMatch(html, /Your next step · Module 1|Choose your Activation time/);
});
