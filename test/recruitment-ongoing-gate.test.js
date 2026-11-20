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
    assert.equal(visit(tree, node => node.type === 'input' && node.props.name === 'invitationCode').length, 1,
      'invitation code and separate master-admin login remain available');
    if (['not_open', 'closed', 'unavailable'].includes(state)) {
      assert.match(text(tree), /Application access is temporarily unavailable/);
    }
  }
});

test('applicant gate asks for an invitation code rather than a shared application password', () => {
  const tree=gateTree('locked');
  assert.match(text(tree), /Enter the invitation code sent to you by a Patch Coach\./);
  assert.match(text(tree), /Invitation code/);
  assert.doesNotMatch(text(tree), /application password|through LinkedIn/i);
  const [input]=visit(tree,node=>node.type==='input');
  assert.equal(input.props.name,'invitationCode');
  assert.equal(input.props.autoComplete,'one-time-code');
});

test('a valid invitation is sent in the dedicated field and opens the unchanged application callback',async()=>{
  let index=0,captured,opened=0;const module={exports:{}};
  vm.runInNewContext(code,{
    module,exports:module.exports,AbortController,
    fetch:async(url,options)=>{captured={url,options};return{ok:true,status:200,json:async()=>({ok:true,unlocked:true,state:'open'})};},
    require(name){assert.equal(name,'react');return{useState(initial){const slot=index++;return[slot===0?'locked':slot===1?'C045':initial,()=>{}];},useEffect(){},useRef(initial){return{current:initial};}};},
    element(type,props,...children){return{type,props:props||{},children:children.flat(Infinity).filter(value=>value!==false&&value!=null)};},
  });
  const tree=module.exports.default({onUnlocked(){opened++;}});const [form]=visit(tree,node=>node.type==='form');
  await form.props.onSubmit({preventDefault(){}});
  assert.equal(captured.url,'/api/recruitment/unlock');assert.deepEqual(JSON.parse(captured.options.body),{invitationCode:'C045'});
  assert.equal(captured.options.credentials,'include');assert.equal(opened,1);
});
