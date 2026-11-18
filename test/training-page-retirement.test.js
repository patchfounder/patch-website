import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { RETIRED_TRAINING_PATHS, isRetiredTrainingPage } from '../src/retired-training-pages.js';
import { retireTrainingPages } from '../server/training-page-retirement.js';

const PROJECT = path.resolve(import.meta.dirname, '..');
const expectedPaths = [
  ...Array.from({ length: 6 }, (_, index) => '/M' + (index + 1)),
  '/training', '/training/prohea', '/training/activation', '/training/activation/host',
  ...['activa', 'premas', 'linkmc', 'linkac', 'knowyc', 'certif']
    .flatMap(code => ['/training/' + code, '/training/' + code + '/host']),
  '/activation', '/pre', '/masterclass', '/activity', '/kc', '/certified',
  '/premasterclass-content', '/activity-content', '/reactivate', '/cancel',
];
const retainedPaths = [
  '/', '/administration', '/application', '/assessment', '/coach-registration',
  '/coaching', '/legal', '/meeting',
];
const assets = [
  {
    path: '/training/patch-call-process.pdf',
    bytes: 310243,
    sha256: 'aceac39df93fa169182477603e5806f151c8526c6974e72dd03513be79570224',
  },
  {
    path: '/training/resources/pro-headshot-examples.jpeg',
    bytes: 86088,
    sha256: '08f76a53b193c28be0d0ca836399a21a71fb61515597d6b708e6f334d5cdb8ed',
  },
];

async function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'patch-training-retirement-'));
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  for (const page of RETIRED_TRAINING_PATHS) {
    const target = path.join(directory, page.slice(1), 'index.html');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '<main>retired-static-sentinel</main>');
  }
  for (const resource of assets) {
    const target = path.join(directory, resource.path.slice(1));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(PROJECT, 'public', resource.path.slice(1)), target);
  }
  writeFileSync(path.join(directory, 'M1', 'release.json'), '{"syntheticProvenance":true}');
  const app = express();
  app.use(retireTrainingPages);
  app.get('/api/training/activation-room/status', (_req, res) => res.json({ syntheticApi: true }));
  app.use(express.static(directory, { index: 'index.html', fallthrough: true }));
  app.use((req, res) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.type('html').send('<main>active-spa-sentinel</main>');
    }
    return res.json({ method: req.method, forwarded: true });
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  return { request: (pathname, options) => fetch(origin + pathname, { redirect: 'manual', ...options }) };
}

test('retirement contains exactly the 32 approved presentation routes and their simple aliases', () => {
  assert.equal(RETIRED_TRAINING_PATHS.length, 32);
  assert.deepEqual([...RETIRED_TRAINING_PATHS].sort(), [...expectedPaths].sort());
  assert.ok(Object.isFrozen(RETIRED_TRAINING_PATHS));
  for (const pathname of expectedPaths) {
    for (const suffix of ['', '/', '?source=legacy', '/index.html', '/index.html/']) {
      assert.equal(isRetiredTrainingPage(pathname + suffix), true, pathname + suffix);
    }
  }
  for (const pathname of [
    ...retainedPaths, ...assets.map(asset => asset.path), '/M1/release.json',
    '/api/training/activation-room/status', '/m1', '/TRAINING', '/M7',
    '/training/unknown', '/training/activa/host/extra', '/M1/index.html/index.html',
    '/M1.css', null, undefined, 1,
  ]) assert.equal(isRetiredTrainingPage(pathname), false, String(pathname));
});

test('GET and HEAD retirement wins over physical old files and the SPA fallback without redirecting', async t => {
  const f = await fixture(t);
  for (const pathname of expectedPaths) {
    for (const suffix of ['', '/', '?source=legacy', '/index.html', '/index.html/']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await f.request(pathname + suffix, { method });
        assert.equal(response.status, 404, method + ' ' + pathname + suffix);
        assert.match(response.headers.get('content-type'), /^text\/plain\b/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, noarchive');
        assert.equal(response.headers.get('location'), null);
        assert.equal(await response.text(), method === 'HEAD' ? '' : 'Not found.');
      }
    }
  }
});

test('remaining pages, public provenance and room APIs pass through retirement unchanged', async t => {
  const f = await fixture(t);
  for (const pathname of retainedPaths) {
    const response = await f.request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(await response.text(), '<main>active-spa-sentinel</main>');
    assert.equal(response.headers.get('x-robots-tag'), null);
  }
  const provenance = await f.request('/M1/release.json');
  assert.equal(provenance.status, 200);
  assert.deepEqual(await provenance.json(), { syntheticProvenance: true });
  const api = await f.request('/api/training/activation-room/status');
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { syntheticApi: true });
});

test('the original training PDF and headshot JPEG retain their bytes and download access', async t => {
  const f = await fixture(t);
  for (const resource of assets) {
    const original = readFileSync(path.join(PROJECT, 'public', resource.path.slice(1)));
    const response = await f.request(resource.path);
    assert.equal(response.status, 200, resource.path);
    const actual = Buffer.from(await response.arrayBuffer());
    assert.equal(actual.length, resource.bytes);
    assert.deepEqual(actual, original);
    assert.equal(createHash('sha256').update(actual).digest('hex'), resource.sha256);
    const head = await f.request(resource.path, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(resource.bytes));
    assert.equal(await head.text(), '');
  }
});

test('retirement does not intercept non-GET/HEAD methods, including on retired pages', async t => {
  const f = await fixture(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await f.request('/M1', { method });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { method, forwarded: true });
    assert.equal(response.headers.get('x-robots-tag'), null);
  }
});
