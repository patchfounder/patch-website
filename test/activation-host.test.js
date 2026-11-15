import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

const require = createRequire(import.meta.url);
const file = new URL('../src/components/ActivationHost.jsx', import.meta.url);
const { code } = await transformWithEsbuild(readFileSync(file, 'utf8'), file.pathname, {
  loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}',
});
const module = { exports: {} };
vm.runInNewContext(code, {
  module, exports: module.exports,
  require(name) {
    if (name.endsWith('.css')) return {};
    assert.ok(['react', 'react/jsx-runtime'].includes(name));
    return require(name);
  },
});

test('private host view begins at sign in without exposing session links or invented appointments', () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  assert.match(html, /Host sign in/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /#session=|#access=|coach@example|LIVEKIT_API|TRAINING_HOST_ACCESS_KEY/);
});

test('host agenda formats the same appointment explicitly in the phone timezone', () => {
  const format = module.exports.formatHostAppointment;
  assert.match(format('2026-11-15T13:30:00Z', 'Europe/London'), /13:30|1:30/);
  assert.match(format('2026-11-15T13:30:00Z', 'Europe/Madrid'), /14:30|2:30/);
  assert.equal(format('invalid', 'Europe/London'), '');
});
