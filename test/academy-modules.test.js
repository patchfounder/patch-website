import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import * as modules from '../src/academy-modules.js';
import { TRAINING_STAGES } from '../src/training-stages.js';

const require = createRequire(import.meta.url);
const sourceUrl = new URL('../src/components/AcademyModule.jsx', import.meta.url);
const { code } = await transformWithEsbuild(readFileSync(sourceUrl, 'utf8'), sourceUrl.pathname, {
  loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}',
});
const expected = [
  ['M1', 'Activation', 'KLXFHB4zVMI'],
  ['M2', 'Pro Headshot', 'RSmXZOyff4U'],
  ['M3', 'LinkedIn Makeover', null],
  ['M4', 'LinkedIn Activity', '8jfKkfdnL0o'],
  ['M5', 'Know Your Coach', null],
  ['M6', 'Certification', null],
];

function fixture(module, clipboard) {
  let status;
  const effects = [];
  const blocked = action => () => { throw new Error(`Preparation page attempted ${action}`); };
  const component = { exports: {} };
  vm.runInNewContext(code, {
    module: component, exports: component.exports, URL,
    navigator: { clipboard, mediaDevices: { getUserMedia: blocked('camera/microphone access') } },
    fetch: blocked('a network request'), setInterval: blocked('background polling'),
    WebSocket: blocked('a websocket connection'),
    require(name) {
      if (name.endsWith('.css')) return {};
      if (name === '../academy-modules.js') return modules;
      if (name === 'react') return {
        ...React,
        useState: initial => [initial, value => { status = value; }],
        useEffect: effect => { effects.push(effect); },
        useLayoutEffect: effect => { effects.push(effect); },
      };
      if (name === 'react/jsx-runtime') return require(name);
      throw new Error(`Unexpected preparation-page dependency: ${name}`);
    },
  });
  const tree = component.exports.default({ module });
  const html = renderToStaticMarkup(tree);
  for (const effect of effects) {
    const cleanup = effect();
    if (typeof cleanup === 'function') cleanup();
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    if (typeof node.type === 'function') {
      const match = find(node.type(node.props), predicate);
      if (match) return match;
    }
    const children = Array.isArray(node.props?.children)
      ? node.props.children.flat(Infinity) : [node.props?.children];
    for (const child of children) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return null;
  }
  return { html, tree, find, status: () => status };
}

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function visibleText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join('');
  return visibleText(node.props?.children);
}

test('six public module addresses match the approved new sequence without renumbering legacy stages', () => {
  assert.equal(modules.ACADEMY_MODULES.length, expected.length);
  for (const [index, [code, title]] of expected.entries()) {
    const module = modules.ACADEMY_MODULES[index];
    assert.equal(module.code, code);
    assert.equal(module.number, index + 1);
    assert.equal(module.title, title);
    assert.equal(module.path, '/' + code);
    assert.equal(module.url, 'https://www.patch.app/' + code);
    assert.equal(modules.getAcademyModule(module.path), module);
    assert.equal(modules.getAcademyModule(module.path + '/'), module);
  }
  for (const pathname of ['/M0', '/M7', '/M1/host', '/M1/anything', '/not-a-module']) {
    assert.equal(modules.getAcademyModule(pathname), null);
  }
  assert.deepEqual(TRAINING_STAGES.map(stage => stage.code), ['activa', 'premas', 'linkmc', 'linkac', 'knowyc', 'certif']);
  assert.equal(TRAINING_STAGES[1].moduleNumber, 1);
  assert.equal(TRAINING_STAGES[1].path, '/training/premas');
  assert.equal(TRAINING_STAGES[2].moduleNumber, 2);
});

test('all six pages render stage-specific preparation with meetings handled inside Patch', () => {
  for (const module of modules.ACADEMY_MODULES) {
    const { html } = fixture(module);
    assert.match(html, /<main\b/);
    assert.match(html, /<h1\b/);
    assert.ok(decode(html).includes(module.headline), module.code + ' headline');
    assert.ok(decode(html).includes(module.intro), module.code + ' introduction');
    assert.match(html, new RegExp(`Module ${module.number} of 6`));
    assert.match(html, /Your module call takes place in Patch\./);
    assert.doesNotMatch(html, /<h[1-6]\b[^>]*>Meet Patrick<\/h[1-6]>|meet\.patch\.app|meet\.google\.com|cal\.com|Book (?:your|a|the|Module)|<form\b|<video\b|\bGO\b|Starts in/i);
    assert.doesNotMatch(html, /LIVEKIT_API|participantToken|accessToken|registration.password|type="password"/);
    assert.ok(module.steps.length >= 3, module.code + ' has meaningful preparation');
    for (const step of module.steps) assert.ok(decode(html).includes(step), module.code + ' step is visible');
  }
});

test('existing tutorials appear only on their relevant modules and unfinished lessons are honest', () => {
  for (const [code, , videoId] of expected) {
    const module = modules.getAcademyModule('/' + code);
    const { html } = fixture(module);
    assert.equal(module.videoId, videoId);
    const frames = [...html.matchAll(/<iframe\b([^>]*)>/g)];
    if (videoId) {
      assert.equal(frames.length, 1, code + ' tutorial');
      assert.match(frames[0][1], new RegExp(`src="https://www\\.youtube-nocookie\\.com/embed/${videoId}(?:[?"&])`));
      assert.match(frames[0][1], /title="[^"]+"/);
      assert.doesNotMatch(frames[0][1], /autoplay=1/);
    } else {
      assert.equal(frames.length, 0, code + ' does not borrow another lesson');
      assert.match(html, /Tutorial coming soon/i);
      assert.doesNotMatch(html, /KLXFHB4zVMI|RSmXZOyff4U|8jfKkfdnL0o/);
    }
  }
});

test('public resource and next-module links show their complete destinations', () => {
  for (const module of modules.ACADEMY_MODULES) {
    const { html } = fixture(module);
    for (const [, attributes, inner] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      const href = decode(attributes.match(/\bhref="([^"]+)"/)?.[1] || '');
      if (!/^https?:/.test(href)) continue;
      const text = decode(inner.replace(/<[^>]*>/g, '')).trim();
      assert.equal(text, href, `${module.code} must expose its link destination`);
      assert.equal(new URL(href).protocol, 'https:');
    }
    if (module.number < 6) {
      assert.equal(module.nextModuleUrl, `https://www.patch.app/M${module.number + 1}`);
      assert.ok(html.includes(`href="${module.nextModuleUrl}"`));
    } else {
      assert.equal(module.nextModuleUrl, null);
      assert.doesNotMatch(html, /https:\/\/www\.patch\.app\/M7/);
    }
  }
});

test('Pro Headshot retains the approved exact prompt, five instructions and original JPEG export', () => {
  const { html } = fixture(modules.getAcademyModule('/M2'));
  const expectedPrompt = 'Create a professional LinkedIn headshot of me in the style of one of these examples. Keep me recognisable, with the same pose and a natural smile showing my teeth. Use a white top, blue blazer, soft lighting and a simple background.';
  assert.equal(modules.HEADSHOT_PROMPT, expectedPrompt);
  assert.ok(decode(html).includes(expectedPrompt));
  assert.equal(modules.getAcademyModule('/M2').steps.length, 5);
  assert.match(html, /smile with your teeth showing/);
  assert.match(html, /patrick@patch.app/);
  assert.equal(modules.HEADSHOT_EXAMPLES_RESOURCE_URL, 'https://www.patch.app/training/resources/pro-headshot-examples.jpeg');
  assert.ok(html.includes(`href="${modules.HEADSHOT_EXAMPLES_RESOURCE_URL}"`));
  const jpeg = readFileSync(new URL('../public/training/resources/pro-headshot-examples.jpeg', import.meta.url));
  assert.equal(jpeg.length, 86088);
  assert.equal(createHash('sha256').update(jpeg).digest('hex'), '08f76a53b193c28be0d0ca836399a21a71fb61515597d6b708e6f334d5cdb8ed');
  assert.deepEqual(Array.from(modules.PUBLIC_COACH_PROFILE_EXAMPLES, profile => profile.url), [
    'https://www.linkedin.com/in/kalista-zuchowska/', 'https://www.linkedin.com/in/mariem-naguib/',
    'https://www.linkedin.com/in/evie-may-cassidy/', 'https://www.linkedin.com/in/joshjhack/',
    'https://www.linkedin.com/in/iwan-price/',
  ]);
  for (const example of modules.PUBLIC_COACH_PROFILE_EXAMPLES) assert.ok(html.includes(example.url));
});

test('Copy prompt uses exactly the approved headshot prompt and handles unavailable clipboard access', async () => {
  const module = modules.getAcademyModule('/M2');
  let copied;
  const working = fixture(module, { writeText: async text => { copied = text; } });
  const button = working.find(working.tree, node => node.type === 'button' && /Copy prompt/.test(visibleText(node)));
  assert.ok(button, 'headshot prompt has an accessible copy action');
  await button.props.onClick();
  assert.equal(copied, modules.HEADSHOT_PROMPT);
  assert.match(working.status(), /copied/i);
  const fallback = fixture(module);
  const fallbackButton = fallback.find(fallback.tree, node => node.type === 'button' && /Copy prompt/.test(visibleText(node)));
  await fallbackButton.props.onClick();
  assert.match(fallback.status(), /select.*copy/i);
});

test('Know Your Coach distinguishes exact-count video paragraphs from flexible LinkedIn post copy', () => {
  const examples = modules.KYC_VIDEO_TEXT_EXAMPLES;
  assert.deepEqual(Array.from(examples, example => example.characters), [68, 85]);
  const { html } = fixture(modules.getAcademyModule('/M5'));
  for (const example of examples) {
    assert.equal(example.text.length, example.characters);
    assert.ok(decode(html).includes(example.text));
    assert.ok(html.includes(String(example.characters)));
  }
  assert.match(html, /LinkedIn post/i);
  assert.match(html, /separate|longer|freedom|as much/i);
});

test('Certification describes individual review and delivery without issuing a public certificate', () => {
  const { html } = fixture(modules.getAcademyModule('/M6'));
  assert.match(html, /certificate/i);
  assert.match(html, /reference/i);
  assert.match(html, /CV/);
  assert.match(html, /LinkedIn/);
  assert.doesNotMatch(html, /MINALMODHWADIA|ISABELLAQUAGGIOTTO|Minal756|izzyquaggiotto|\/certificates\/deliveries|Your certificate is ready|Congratulations.*certified/i);
});
