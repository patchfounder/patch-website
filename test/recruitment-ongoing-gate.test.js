import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

const source = new URL('../src/components/CoachPasswordGate.jsx', import.meta.url);
const { code } = await transformWithEsbuild(readFileSync(source, 'utf8'), source.pathname, {
  loader: 'jsx', format: 'cjs', jsx: 'transform', jsxFactory: 'element',
  sourcemap: false, tsconfigRaw: '{}',
});

function gateTree(state) {
  let index = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      assert.equal(name, 'react');
      return {
        useState(initial) { return [index++ === 0 ? state : initial, () => {}]; },
        useEffect() {}, useRef(initial) { return { current: initial }; },
      };
    },
    element(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity).filter(x => x !== false && x != null) };
    },
  });
  return module.exports.default({});
}

function visit(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.children || []).flatMap(child => visit(child, predicate))];
}

function text(tree) {
  if (tree == null || tree === false) return '';
  return typeof tree !== 'object' ? String(tree) : (tree.children || []).map(text).join(' ');
}

test('ongoing applicant login has no application-window or deadline messaging', () => {
  for (const state of ['locked', 'not_open', 'closed', 'unavailable', 'error']) {
    const tree = gateTree(state);
    assert.doesNotMatch(text(tree), /deadline|application window|currently closed|has not opened/i);
    assert.equal(visit(tree, node => node.type === 'input' && node.props.name === 'password').length, 1,
      'the existing password and master-admin login remain available');
    if (['not_open', 'closed', 'unavailable'].includes(state)) {
      assert.match(text(tree), /Application access is temporarily unavailable/);
    }
  }
});
