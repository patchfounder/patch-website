import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

const require = createRequire(import.meta.url);
const websiteRoot = fileURLToPath(new URL('../', import.meta.url));
const description = 'A 30-minute call to activate your Patch account and show you how to deliver a Patch Call in 7 Steps.';
const readSource = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
async function compile(file) {
  const sourceUrl = new URL(`../${file}`, import.meta.url);
  return (await transformWithEsbuild(readFileSync(sourceUrl, 'utf8'), sourceUrl.pathname, {
    loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}',
  })).code;
}
const activationCode = await compile('src/components/Activation.jsx');
const mainCode = await compile('src/main.jsx');

function activationFixture(width, previousRobots = null) {
  const effects = [], nodes = [], listeners = new Set(), calendar = { dataset: {} };
  let footerProps;
  const createElement = tagName => ({
    tagName, attributes: {}, dataset: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    remove() { const index = nodes.indexOf(this); if (index >= 0) nodes.splice(index, 1); },
  });
  if (previousRobots !== null) {
    const meta = createElement('meta'); meta.setAttribute('name', 'robots'); meta.setAttribute('content', previousRobots); nodes.push(meta);
  }
  const document = {
    title: 'Patch', head: { appendChild: element => nodes.push(element) }, createElement,
    querySelector: selector => selector === 'meta[name="robots"]' ? nodes.find(node => node.attributes?.name === 'robots') : null,
    getElementById: id => id === 'my-cal-inline-activation' ? calendar : nodes.find(node => node.id === id),
  };
  const query = { matches: width >= 768, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) };
  const window = { matchMedia: value => { assert.equal(value, '(min-width: 768px)'); return query; } };
  const module = { exports: {} };
  vm.runInNewContext(activationCode, {
    module, exports: module.exports, window, document,
    require(name) {
      if (name === 'react') return { ...React, useEffect: effect => effects.push(effect) };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === './Footer.jsx') return { __esModule: true, default: props => { footerProps = props; return React.createElement('footer'); } };
      throw new Error(`Unexpected Activation dependency: ${name}`);
    },
  });
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  return {
    html, effects, document, window, calendar, nodes, listeners, footerProps,
    resize(nextWidth) { query.matches = nextWidth >= 768; for (const listener of listeners) listener({ matches: query.matches }); },
  };
}

test('Activation renders the approved call copy and existing booking-page controls', () => {
  const fixture = activationFixture(1024);
  assert.match(fixture.html, /<h1>Activation Call<\/h1>/);
  assert.ok(fixture.html.includes(description));
  assert.match(fixture.html, /class="meeting-calendar" id="my-cal-inline-activation" style="width:100%;min-height:700px"/);
  assert.match(fixture.html, /class="meeting-mobile-cta" href="https:\/\/cal\.com\/patchapp\/activation" target="_blank" rel="noreferrer"/);
  assert.match(fixture.html, /<span>View Calendar<\/span>/);
  assert.equal(fixture.footerProps.hideColumns, true);
  assert.equal(fixture.footerProps.logoSrc, '/patch-logo-2.png');
});

test('desktop embed uses its own Activation namespace and initializes once', () => {
  const fixture = activationFixture(1024, 'index, follow');
  const cleanup = fixture.effects[0]();
  assert.equal(fixture.document.title, 'Activation Call | Patch');
  assert.equal(fixture.document.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  const scripts = () => fixture.nodes.filter(node => node.tagName === 'script');
  assert.equal(scripts().length, 1);
  assert.equal(scripts()[0].src, 'https://app.cal.com/embed/embed.js');
  const calls = fixture.window.Cal.ns.activation.q;
  const inline = calls.find(call => call[0] === 'inline')[1];
  assert.equal(inline.calLink, 'patchapp/activation');
  assert.equal(inline.elementOrSelector, '#my-cal-inline-activation');
  assert.equal(inline.config.layout, 'month_view');
  assert.equal(inline.config.useSlotsViewOnSmallScreen, true);
  assert.equal(calls.find(call => call[0] === 'ui')[1].hideEventTypeDetails, false);
  const originalCalls = calls.length;
  fixture.resize(500); fixture.resize(1024);
  assert.equal(calls.length, originalCalls);
  cleanup();
  assert.equal(fixture.listeners.size, 0);
  assert.equal(fixture.document.querySelector('meta[name="robots"]').getAttribute('content'), 'index, follow');
  const repeatedCleanup = fixture.effects[0]();
  assert.equal(scripts().length, 1);
  assert.equal(calls.length, originalCalls);
  repeatedCleanup();
});

test('mobile widths keep the direct calendar link and defer the desktop embed', () => {
  for (const width of [375, 390, 430, 767]) {
    const fixture = activationFixture(width), cleanup = fixture.effects[0]();
    assert.equal(fixture.window.Cal, undefined);
    assert.equal(fixture.nodes.filter(node => node.tagName === 'script').length, 0);
    assert.match(fixture.html, /href="https:\/\/cal\.com\/patchapp\/activation"/);
    fixture.resize(768);
    assert.equal(fixture.window.Cal.ns.activation.q.filter(call => call[0] === 'inline').length, 1);
    cleanup();
    assert.equal(fixture.document.querySelector('meta[name="robots"]'), undefined);
  }
});

test('client routing selects Activation with or without a trailing slash', () => {
  for (const [pathname, expected] of [['/activation', 'Activation'], ['/activation/', 'Activation'], ['/reactivate', 'Reactivate']]) {
    let rendered;
    const module = { exports: {} };
    vm.runInNewContext(mainCode, {
      module, exports: module.exports, window: { location: { pathname } }, document: { getElementById: () => ({}) },
      require(name) {
        if (name === 'react' || name === 'react/jsx-runtime') return require(name);
        if (name === 'react-dom/client') return { createRoot: () => ({ render: value => { rendered = value; } }) };
        if (name.endsWith('.css')) return {};
        if (name.endsWith('.jsx')) { const component = () => null; component.displayName = path.basename(name, '.jsx'); return { __esModule: true, default: component }; }
        throw new Error(`Unexpected entry dependency: ${name}`);
      },
    });
    assert.equal(rendered.props.children.type.displayName, expected);
  }
});

test('metadata generation creates a dedicated Activation share page without filesystem writes', async () => {
  const outputs = new Map(), dist = path.join(websiteRoot, 'dist');
  const source = readSource('scripts/create-route-meta-pages.mjs').replace(/^import[^\n]*\n/gm, '');
  await vm.runInNewContext(`(async () => {\n${source}\n})()`, {
    path: { join: path.join, resolve: value => path.resolve(websiteRoot, value) },
    readFile: async file => { assert.equal(file, path.join(dist, 'index.html')); return readSource('index.html'); },
    mkdir: async directory => { assert.ok(directory.startsWith(dist + path.sep)); },
    writeFile: async (file, html) => { outputs.set(file, html); }, console: { log() {} },
  });
  const html = outputs.get(path.join(dist, 'activation', 'index.html'));
  assert.ok(html);
  assert.match(html, /<title>Activation Call \| Patch<\/title>/);
  assert.ok(html.includes(`<meta name="description" content="${description}" />`));
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.patch\.app\/activation"/);
  assert.match(html, /<meta property="og:title" content="Activation Call \| Patch"/);
  assert.match(html, /<meta name="twitter:title" content="Activation Call \| Patch"/);
});
