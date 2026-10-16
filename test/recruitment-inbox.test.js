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

const [assessmentCode, queueCode, cohortsCode] = await Promise.all([
  componentCode('Assessment.jsx'), componentCode('AssessmentQueue.jsx'), componentCode('AssessmentCohorts.jsx'),
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
  const draftClicks = [];
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
    document: {
      createElement(type) {
        assert.equal(type, 'a');
        return { click() { draftClicks.push(this.href); }, remove() {} };
      },
      body: { append() {} },
      querySelector() { return { focus() { focusCalls.push({ text: 'active navigation' }); } }; },
    },
    fetch,
  };
  vm.runInNewContext(code, context);
  return {
    focusCalls,
    draftClicks,
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

function applicant(id, minute, decision = 'pending', teamDecision = '') {
  return {
    applicationId: id, fullName: `Synthetic ${id}`, email: `${minute}@example.com`,
    linkedinUrl: 'https://example.com/profile', audioDurationSeconds: 1,
    submittedAt: `2026-10-03T12:0${minute}:00.000Z`, decision, teamDecision,
    teamEmailDrafts: {
      rejected: { to: `${minute}@example.com`, subject: 'Your Patch application', body: `Dear Synthetic ${id},\n\nYou have not been selected to join Patch.\n\nPatrick` },
      invited: { to: `${minute}@example.com`, subject: 'Welcome to Patch', body: `Dear Synthetic ${id},\n\nPlease register:\nhttps://www.patch.app/coach-registration/\n\nPatrick` },
    },
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
    history: [
      applicant('passed-one', 4, 'pass'), applicant('failed-one', 5, 'fail'), applicant('passed-two', 6, 'pass'),
      applicant('rejected-one', 7, 'pass', 'rejected'), applicant('invited-one', 8, 'pass', 'invited'),
    ],
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

test('Fail, Rejected and Invited are read-only playable archives without autofocus', () => {
  for (const [view, expectedIds, badge] of [
    ['fail', ['failed-one'], 'Failed'], ['rejected', ['rejected-one'], 'Rejected'], ['invited', ['invited-one'], 'Invited'],
  ]) {
    const cards = queueCards(harness(assessmentCode, { state: reviewerState(), view }).render());
    assert.deepEqual(cards.map((card) => card.props.application.applicationId), expectedIds);
    for (const card of cards) {
      assert.equal(card.props.readOnly, true);
      assert.equal(card.props.onDecision, undefined);
      const cardHarness = harness(queueCode);
      const tree = cardHarness.render(card.props, { runEffects: true });
      assert.equal(decisionButtons(tree).length, 0);
      assert.equal(nodes(tree, (node) => node.type === 'button' && ['Reject', 'Invite', 'Confirm Sent'].includes(textContent(node))).length, 0);
      assert.equal(nodes(tree, (node) => node.props.role === 'alertdialog').length, 0);
      assert.equal(nodes(tree, (node) => node.type === AudioPlaceholder).length, 1);
      assert.equal(cardHarness.focusCalls.length, 0);
      assert.ok(textContent(tree).includes(badge));
    }
  }
});

test('summary has five distinct counts and categories while retaining the window title without dates', () => {
  const tree = harness(assessmentCode, { state: reviewerState() }).render();
  const summary = nodes(tree, (node) => node.type === CohortsPlaceholder)[0];
  assert.deepEqual({ ...summary.props.viewCounts }, { inbox: 3, pass: 2, fail: 1, rejected: 1, invited: 1 });
  const cohort = harness(cohortsCode).render({
    ...summary.props,
    currentWindow: { id: 'window-one', opensAt: '2026-10-03T00:00:00+01:00', closesAt: '2026-11-01T00:00:00Z' },
  });
  assert.match(textContent(cohort), /Application WindowOctober 2026/);
  assert.doesNotMatch(textContent(cohort), /Open|Close|3 Oct|31 Oct/);
  const buttons = nodes(cohort, (node) => node.props.className === 'assessment-outcome-link');
  assert.deepEqual(buttons.map(textContent), ['Inbox3', 'Pass2', 'Fail1', 'Rejected1', 'Invited1']);
  assert.equal(buttons[0].props['aria-current'], 'page');
  buttons[4].props.onClick();
  const selected = nodes(harness(assessmentCode, { state: reviewerState(), view: 'invited' }).render(), (node) => node.type === CohortsPlaceholder)[0];
  assert.equal(selected.props.activeView, 'invited');
});

test('Pass offers only Reject/Invite and shows the actual external profile URL', () => {
  const cards = queueCards(harness(assessmentCode, { state: reviewerState(), view: 'pass' }).render());
  assert.deepEqual(cards.map((card) => card.props.application.applicationId), ['passed-one', 'passed-two']);
  for (const card of cards) {
    assert.equal(card.props.allowTeamDecision, true);
    assert.equal(typeof card.props.onTeamDecision, 'function');
    const page = harness(queueCode);
    const tree = page.render(card.props, { runEffects: true });
    assert.equal(decisionButtons(tree).length, 0);
    assert.equal(page.focusCalls.length, 0);
    assert.deepEqual(nodes(tree, (node) => node.type === 'button').map(textContent), ['Reject', 'Invite']);
    const profile = nodes(tree, (node) => node.type === 'a' && node.props.href === 'https://example.com/profile')[0];
    assert.equal(textContent(profile), profile.props.href);
  }
});

for (const [label, outcome] of [['Reject', 'rejected'], ['Invite', 'invited']]) {
  test(`${label} opens the correct personalised draft with no write; Cancel restores that card button`, () => {
    const page = harness(assessmentCode, { state: reviewerState(), view: 'pass' });
    const target = queueCards(page.render())[1];
    const card = harness(queueCode);
    let tree = card.render(target.props, { runEffects: true });
    nodes(tree, (node) => node.type === 'button' && textContent(node) === label)[0].props.onClick();
    tree = card.render(target.props, { runEffects: true });
    assert.equal(card.draftClicks.length, 1);
    const draft = new URL(card.draftClicks[0]);
    assert.equal(draft.protocol, 'mailto:');
    assert.equal(decodeURIComponent(draft.pathname), target.props.application.email);
    assert.equal(draft.searchParams.get('body'), target.props.application.teamEmailDrafts[outcome].body);
    assert.match(textContent(tree), /Opening the draft does not change/);
    assert.equal(nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Confirm Sent').length, 1);
    nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Open email again')[0].props.onClick();
    assert.equal(card.draftClicks.length, 2);
    nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Cancel')[0].props.onClick();
    tree = card.render(target.props, { runEffects: true });
    assert.equal(nodes(tree, (node) => node.props.role === 'alertdialog').length, 0);
    assert.equal(card.focusCalls.at(-1).text, label);
    assert.equal(queueCards(page.render()).length, 2);
  });
}

test('a missing or unsafe draft never offers Confirm Sent or writes an outcome', () => {
  for (const draft of [undefined, { to: 'test@example.com\r\nBcc:another@example.com', subject: 'Welcome', body: 'Hello' }]) {
    const card = harness(queueCode);
    const props = { application: { ...applicant('missing', 1, 'pass'), teamEmailDrafts: { invited: draft } }, allowTeamDecision: true };
    let tree = card.render(props);
    nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Invite')[0].props.onClick();
    tree = card.render(props);
    assert.match(textContent(tree), /draft could not be prepared/);
    assert.equal(card.draftClicks.length, 0);
    assert.equal(nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Confirm Sent').length, 0);
  }
});

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => payload };
}

for (const [label, outcome] of [['Reject', 'rejected'], ['Invite', 'invited']]) {
  test(`Confirm Sent for ${label} targets only that passed applicant and leaves Inbox/processed counts unchanged`, async () => {
    const state = reviewerState();
    const requests = [];
    const page = harness(assessmentCode, {
      state, view: 'pass',
      async fetch(url, options) {
        requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
        if (options.method === 'POST') {
          const target = state.history.find((entry) => entry.applicationId === 'passed-two');
          target.teamDecision = outcome;
          target.teamDecidedAt = '2026-10-16T06:00:00Z';
          return jsonResponse({ application: target });
        }
        return jsonResponse(structuredClone(state));
      },
    });
    const target = queueCards(page.render())[1];
    const card = harness(queueCode);
    let tree = card.render(target.props);
    nodes(tree, (node) => node.type === 'button' && textContent(node) === label)[0].props.onClick();
    assert.equal(requests.length, 0);
    tree = card.render(target.props);
    await nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Confirm Sent')[0].props.onClick();
    assert.deepEqual(requests[0], {
      url: '/api/recruitment/reviewer/applications/passed-two/team-decision', method: 'POST', body: { decision: outcome, confirmSent: true },
    });
    assert.equal(requests.length, 2);
    const updatedTree = page.render();
    assert.deepEqual(queueCards(updatedTree).map((entry) => entry.props.application.applicationId), ['passed-one']);
    const summary = nodes(updatedTree, (node) => node.type === CohortsPlaceholder)[0];
    assert.equal(summary.props.viewCounts.inbox, 3);
    assert.equal(summary.props.viewCounts.pass, 1);
    assert.equal(summary.props.viewCounts[outcome], 2);
    assert.equal(state.currentCohort.processedCount, 3);
    assert.equal(state.currentCohort.pendingCount, 3);
  });
}

test('uncertain team save moves the card only when reconciliation confirms the exact persisted outcome', async () => {
  for (const savedOutcome of ['invited', '', 'rejected']) {
    const state = reviewerState();
    const page = harness(assessmentCode, {
      state, view: 'pass',
      async fetch(url, options) {
        if (options.method === 'POST') {
          state.history.find((entry) => entry.applicationId === 'passed-two').teamDecision = savedOutcome;
          throw new Error('Connection interrupted');
        }
        return jsonResponse(structuredClone(state));
      },
    });
    const target = queueCards(page.render())[1];
    if (savedOutcome === 'invited') {
      await target.props.onTeamDecision(target.props.application, 'invited');
    } else {
      await assert.rejects(target.props.onTeamDecision(target.props.application, 'invited'), /Connection interrupted/);
    }
    const ids = queueCards(page.render()).map((entry) => entry.props.application.applicationId);
    assert.equal(ids.includes('passed-two'), !savedOutcome);
  }
});

test('failed team save and failed reconciliation keep the card in Pass with a visible error', async () => {
  const page = harness(assessmentCode, {
    state: reviewerState(), view: 'pass',
    fetch: async () => { throw new Error('Service unavailable'); },
  });
  const target = queueCards(page.render())[1];
  const card = harness(queueCode);
  let tree = card.render(target.props);
  nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Invite')[0].props.onClick();
  tree = card.render(target.props);
  await nodes(tree, (node) => node.type === 'button' && textContent(node) === 'Confirm Sent')[0].props.onClick();
  tree = card.render(target.props);
  assert.match(textContent(tree), /Service unavailable/);
  assert.equal(queueCards(page.render()).length, 2);
});

test('an expired team-decision session returns to sign-in without moving a card locally', async () => {
  let requestCount = 0;
  const page = harness(assessmentCode, {
    state: reviewerState(), view: 'pass',
    fetch: async () => { requestCount += 1; return jsonResponse({ error: 'Session expired' }, 401); },
  });
  const target = queueCards(page.render())[0];
  await target.props.onTeamDecision(target.props.application, 'invited');
  assert.equal(requestCount, 1);
  assert.equal(queueCards(page.render()).length, 0);
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
