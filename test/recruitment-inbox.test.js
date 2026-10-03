import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

import * as timeHelpers from '../src/recruitment-time.js';

// Exercise the real component functions without a browser, network, or new test
// dependency. Vite transforms JSX in memory; hooks and DOM focus are controlled.
async function componentCode(filename) {
  const url = new URL(`../src/components/${filename}`, import.meta.url);
  return (await transformWithEsbuild(readFileSync(url, 'utf8'), url.pathname, {
    loader: 'jsx', format: 'cjs', jsx: 'transform', jsxFactory: 'element',
    jsxFragment: 'Fragment', sourcemap: false, tsconfigRaw: '{}',
  })).code;
}

const [assessmentCode, queueCode] = await Promise.all([
  componentCode('Assessment.jsx'), componentCode('AssessmentQueue.jsx'),
]);
function QueuePlaceholder() {}
function CohortsPlaceholder() {}
function AudioPlaceholder() {}
let nextHarnessId = 0;

function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    for (const child of node.children || []) visit(child);
  }
  visit(tree);
  return found;
}

function textContent(node) {
  if (node === undefined || node === null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return (node.children || []).map(textContent).join('');
}

function harness(code, { state, view = 'inbox', fetch = async () => assert.fail('Unexpected API request') } = {}) {
  const id = ++nextHarnessId;
  const slots = [];
  const focusCalls = [];
  let cursor = 0;
  let effects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) {
        const value = typeof initial === 'function' ? initial() : initial;
        slots[index] = state && value?.authenticated === null ? structuredClone(state) : value;
      }
      return [slots[index], (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useId() { return `synthetic-${id}-${cursor++}`; },
    useCallback(callback) { cursor += 1; return callback; },
    useMemo(factory) { cursor += 1; return factory(); },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
        effects.push(effect);
      }
      slots[index] = dependencies;
    },
  };
  const imports = {
    react: hooks,
    './AssessmentQueue.jsx': { __esModule: true, default: QueuePlaceholder },
    './AssessmentCohorts.jsx': { __esModule: true, default: CohortsPlaceholder },
    './PatchAudioPlayer.jsx': { __esModule: true, default: AudioPlaceholder },
    '../recruitment-time.js': timeHelpers,
    '../assessment.css': {},
  };
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, URL, Date, AbortController,
    element(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== false && child != null) };
    },
    Fragment: 'fragment',
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected component import: ${name}`);
      return imports[name];
    },
    window: { location: { hash: `#${view}` }, requestAnimationFrame: (callback) => callback() },
    fetch,
  };
  vm.runInNewContext(code, context);
  return {
    focusCalls,
    render(props = {}, { runEffects = false } = {}) {
      cursor = 0;
      effects = [];
      const tree = module.exports.default(props);
      for (const node of nodes(tree, (entry) => entry.props.ref)) {
        node.props.ref.current = {
          focus(options) { focusCalls.push({ text: textContent(node), preventScroll: options?.preventScroll }); },
        };
      }
      if (runEffects) effects.forEach((effect) => effect());
      return tree;
    },
  };
}

function applicant(id, minute, decision = 'pending') {
  return {
    applicationId: id, fullName: `Synthetic ${id}`, email: `${minute}@example.com`,
    linkedinUrl: 'https://example.com/profile', audioDurationSeconds: 1,
    submittedAt: `2026-10-03T12:0${minute}:00.000Z`, decision,
  };
}

function reviewerState() {
  const oldest = applicant('app-one', 1);
  const middle = applicant('app-two', 2);
  const newest = applicant('app/three', 3);
  return {
    authenticated: true,
    currentCohort: { cohortId: 'synthetic-window', pendingCount: 3, processedCount: 3 },
    previousCohort: null,
    current: oldest,
    queue: [newest, oldest, middle],
    pendingTotal: 3,
    history: [applicant('passed-one', 4, 'pass'), applicant('failed-one', 5, 'fail'), applicant('passed-two', 6, 'pass')],
  };
}

const queueCards = (tree) => nodes(tree, (node) => node.type === QueuePlaceholder);
const decisionButtons = (tree) => nodes(tree, (node) => node.type === 'button' && ['Pass', 'Fail'].includes(textContent(node)));

test('Inbox renders every pending card once, oldest first, in the full-width outcome list', () => {
  const page = harness(assessmentCode, { state: reviewerState() });
  const tree = page.render();
  const cards = queueCards(tree);
  assert.deepEqual(cards.map((card) => card.props.application.applicationId), ['app-one', 'app-two', 'app/three']);
  assert.deepEqual(cards.map((card) => card.props.focusOnLoad), [true, false, false]);
  assert.ok(cards.every((card) => typeof card.props.onDecision === 'function' && !card.props.readOnly));
  const lists = nodes(tree, (node) => node.props.className === 'assessment-outcome-list');
  assert.equal(lists.length, 1);
  assert.equal(queueCards(lists[0]).length, 3);
});

test('only the first Inbox card focuses its heading, including when the next card becomes first', () => {
  const cards = queueCards(harness(assessmentCode, { state: reviewerState() }).render());
  const cardHarnesses = cards.map(() => harness(queueCode));
  cards.forEach((card, index) => cardHarnesses[index].render(card.props, { runEffects: true }));
  assert.deepEqual(cardHarnesses.map((card) => card.focusCalls.length), [1, 0, 0]);
  assert.deepEqual(cardHarnesses[0].focusCalls, [{ text: 'Synthetic app-one', preventScroll: true }]);
  cardHarnesses[1].render({ ...cards[1].props, focusOnLoad: true }, { runEffects: true });
  assert.deepEqual(cardHarnesses[1].focusCalls, [{ text: 'Synthetic app-two', preventScroll: true }]);
});

test('an empty Inbox keeps the caught-up state and no-window view has no applicant cards', () => {
  const state = { ...reviewerState(), queue: [], current: null, pendingTotal: 0 };
  const cards = queueCards(harness(assessmentCode, { state }).render());
  assert.equal(cards.length, 1);
  assert.equal(cards[0].props.application, null);
  const empty = harness(queueCode).render(cards[0].props);
  assert.match(textContent(empty), /You’re all caught up\./);
  assert.equal(decisionButtons(empty).length, 0);
  assert.equal(queueCards(harness(assessmentCode, { state: { ...state, currentCohort: null } }).render()).length, 0);
});

test('Pass and Fail keep all outcome cards read-only, without decision controls or autofocus', () => {
  for (const [view, expectedIds] of [['pass', ['passed-one', 'passed-two']], ['fail', ['failed-one']]]) {
    const cards = queueCards(harness(assessmentCode, { state: reviewerState(), view }).render());
    assert.deepEqual(cards.map((card) => card.props.application.applicationId), expectedIds);
    for (const card of cards) {
      assert.equal(card.props.readOnly, true);
      assert.equal(card.props.onDecision, undefined);
      const cardHarness = harness(queueCode);
      const tree = cardHarness.render(card.props, { runEffects: true });
      assert.equal(decisionButtons(tree).length, 0);
      assert.equal(nodes(tree, (node) => node.props.role === 'alertdialog').length, 0);
      assert.equal(nodes(tree, (node) => node.type === AudioPlaceholder).length, 1);
      assert.equal(cardHarness.focusCalls.length, 0);
      assert.match(textContent(tree), view === 'pass' ? /Passed/ : /Failed/);
    }
  }
});

test('confirming a decision on a later Inbox card targets that applicant, not the first', async () => {
  const state = reviewerState();
  const requests = [];
  const page = harness(assessmentCode, {
    state,
    async fetch(url, options) {
      requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      let payload;
      if (options.method === 'POST') {
        assert.equal(url, '/api/recruitment/reviewer/applications/app%2Fthree/decision');
        const decided = { ...state.queue.find((entry) => entry.applicationId === 'app/three'), decision: 'fail' };
        state.queue = state.queue.filter((entry) => entry.applicationId !== decided.applicationId);
        state.history.push(decided);
        state.pendingTotal -= 1;
        state.currentCohort.pendingCount -= 1;
        payload = { application: decided };
      } else {
        assert.equal(url, '/api/recruitment/reviewer/state');
        payload = structuredClone(state);
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => payload };
    },
  });
  const target = queueCards(page.render())[2];
  const card = harness(queueCode);
  let tree = card.render(target.props, { runEffects: true });
  decisionButtons(tree).find((button) => textContent(button) === 'Fail').props.onClick();
  tree = card.render(target.props, { runEffects: true });
  assert.match(textContent(tree), /Fail Synthetic app\/three\?/);
  const confirm = nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Confirm Fail')[0];
  await confirm.props.onClick();
  assert.deepEqual(requests[0], {
    url: '/api/recruitment/reviewer/applications/app%2Fthree/decision', method: 'POST', body: { decision: 'fail' },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(queueCards(page.render()).map((entry) => entry.props.application.applicationId), ['app-one', 'app-two']);
});
