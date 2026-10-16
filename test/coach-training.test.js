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
const sourceUrl = new URL('../src/components/Training.jsx', import.meta.url);
const { code } = await transformWithEsbuild(readFileSync(sourceUrl, 'utf8'), sourceUrl.pathname, {
  loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}',
});
const module = { exports: {} };
vm.runInNewContext(code, {
  module,
  exports: module.exports,
  require(name) {
    if (name.endsWith('.css')) return {};
    assert.ok(['react', 'react/jsx-runtime'].includes(name), `Unexpected training dependency: ${name}`);
    return require(name);
  },
});
const html = renderToStaticMarkup(React.createElement(module.exports.default));

test('training publishes the approved video and accessible downloadable manual', () => {
  assert.match(html, /<h1[^>]*>Your coach training\.<\/h1>/);
  assert.match(html, /Watch the training video/);
  assert.match(html, /Download your call script/);
  assert.equal((html.match(/<iframe\b/g) || []).length, 1);
  assert.match(html, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/KLXFHB4zVMI\?rel=0"/);
  assert.match(html, /title="How to Deliver a Patch Call in 7 Steps"/);
  assert.match(html, /href="\/training\/patch-call-process\.pdf"[^>]*download="Patch Call Process\.pdf"/);
  assert.match(html, /src="\/training\/manual-first-page\.png"/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=KLXFHB4zVMI"/);
});

test('live training has no mockup controls or false account/email confirmations', () => {
  assert.doesNotMatch(html, /Design preview|design preview|Preview confirmation email|Your account is ready|No account created|email-dialog/);
  assert.doesNotMatch(html, /<form\b|<dialog\b/);
});

test('the published manual is the exact approved PDF, with its preview image available', () => {
  const manual = readFileSync(new URL('../public/training/patch-call-process.pdf', import.meta.url));
  assert.equal(manual.length, 310243);
  assert.equal(createHash('sha256').update(manual).digest('hex'), 'aceac39df93fa169182477603e5806f151c8526c6974e72dd03513be79570224');
  const preview = readFileSync(new URL('../public/training/manual-first-page.png', import.meta.url));
  assert.equal(preview.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
