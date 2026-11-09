const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const logic = script.slice(0, script.indexOf('    els.authButton.addEventListener'));

// The harness dispatches browser-like capture/target/bubble events. A token's
// click listener represents the existing add-word/add-piece action; tests never
// reach into the glossary controller's private state.
function harness({ hover = false } = {}) {
  let now = 0;
  let nextTimer = 1;
  let selectionClears = 0;
  const timers = new Map();
  const elements = new Map();
  class FakeNode {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.nodeType = 1;
      this.children = [];
      this.parentNode = null;
      this.listeners = new Map();
      this.attributes = new Map();
      this.dataset = {};
      this.style = {};
      this.hidden = false;
      this.innerHTML = '';
      this.textContent = '';
      this.className = '';
      this.isConnected = true;
      this.classList = {
        contains: (name) => this.className.split(/\s+/).includes(name),
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
        toggle: (name, force) => {
          const on = force ?? !this.classList.contains(name);
          this.classList[on ? 'add' : 'remove'](name);
          return on;
        }
      };
    }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
      this.isConnected = false;
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
    insertAdjacentElement() {}
    getBoundingClientRect() { return { left: 40, top: 200, right: 140, bottom: 230, width: 100, height: 30 }; }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part.startsWith('#')) return this.id === part.slice(1);
        const attr = part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
        if (attr) {
          const dataKey = attr[1].startsWith('data-') ? attr[1].slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()) : null;
          const value = dataKey ? this.dataset[dataKey] : this.getAttribute(attr[1]);
          return value != null && (attr[2] === undefined || value === attr[2]);
        }
        return part.toUpperCase() === this.tagName;
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches?.(selector)) return node; return null; }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || new FakeNode(); }
    addEventListener(type, callback, options = {}) {
      const capture = options === true || Boolean(options.capture);
      const list = this.listeners.get(type) || [];
      if (!list.some(entry => entry.callback === callback && entry.capture === capture)) {
        list.push({ callback, capture, passive: Boolean(options.passive), once: Boolean(options.once) });
      }
      this.listeners.set(type, list);
    }
    removeEventListener(type, callback, options = {}) {
      const capture = options === true || Boolean(options.capture);
      this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.callback !== callback || entry.capture !== capture));
    }
  }
  const window = new FakeNode('window');
  window.nodeType = 0;
  const document = new FakeNode('document');
  document.nodeType = 9;
  window.appendChild(document);
  const documentElement = document.appendChild(new FakeNode('html'));
  documentElement.clientWidth = 390;
  documentElement.clientHeight = 844;
  document.documentElement = documentElement;
  document.body = documentElement.appendChild(new FakeNode('body'));
  document.createElement = tag => new FakeNode(tag);
  document.getElementById = id => {
    if (!elements.has(id)) {
      const node = new FakeNode();
      node.id = id;
      document.body.appendChild(node);
      elements.set(id, node);
    }
    return elements.get(id);
  };
  window.document = document;
  window.scrollX = window.scrollY = 0;
  window.innerWidth = 390;
  window.innerHeight = 844;
  window.matchMedia = () => ({ matches: hover, addEventListener() {} });
  window.setTimeout = (callback, delay = 0) => {
    const id = nextTimer++;
    timers.set(id, { time: now + delay, callback });
    return id;
  };
  window.clearTimeout = id => timers.delete(id);
  window.getSelection = () => ({ removeAllRanges() { selectionClears++; }, rangeCount: 0 });
  const clock = class extends Date { static now() { return now; } };
  const context = vm.createContext({
    console, document, window, Date: clock, performance: { now: () => now },
    Element: FakeNode, Node: FakeNode,
    navigator: { maxTouchPoints: hover ? 0 : 5 },
    localStorage: { getItem() { return null; }, setItem() {} },
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout
  });
  vm.runInContext(logic, context);
  const run = code => vm.runInContext(code, context);
  const dispatch = (target, type, fields = {}) => {
    const event = {
      type, target, currentTarget: null, cancelable: true, bubbles: !['mouseenter', 'mouseleave'].includes(type),
      defaultPrevented: false, propagationStopped: false, immediateStopped: false, passive: false,
      pointerType: 'touch', isPrimary: true, button: 0, clientX: 70, clientY: 210,
      ...fields,
      preventDefault() { if (this.cancelable && !this.passive) this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediateStopped = this.propagationStopped = true; },
      composedPath() { return chain; }
    };
    const chain = [];
    for (let node = target; node; node = node.parentNode) chain.push(node);
    const invoke = (node, capture) => {
      event.currentTarget = node;
      for (const entry of [...(node.listeners.get(type) || [])]) {
        if (entry.capture !== capture) continue;
        event.passive = entry.passive;
        entry.callback.call(node, event);
        if (entry.once) node.removeEventListener(type, entry.callback, { capture });
        if (event.immediateStopped) break;
      }
      event.passive = false;
    };
    for (const node of [...chain].reverse()) { invoke(node, true); if (event.propagationStopped) return event; }
    for (const node of chain) { invoke(node, false); if (event.propagationStopped || !event.bubbles) break; }
    return event;
  };
  const advance = ms => {
    const end = now + ms;
    while (true) {
      const pending = [...timers.entries()].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time || a[0] - b[0])[0];
      if (!pending) break;
      const [id, timer] = pending;
      now = timer.time;
      timers.delete(id);
      timer.callback();
    }
    now = end;
  };
  const container = document.body.appendChild(new FakeNode());
  let answerClicks = 0;
  const addWord = (word, zh) => {
    const button = container.appendChild(new FakeNode('button'));
    button.className = 'token';
    button.dataset.wordAdd = word;
    button.addEventListener('click', () => { answerClicks++; });
    const span = button.appendChild(new FakeNode('span'));
    span.className = 'glossable';
    span.dataset = { glossEn: word, glossZh: zh, glossNote: '' };
    return span;
  };
  const word = addWord('beneficial', '有益的');
  const secondWord = addWord('children', '孩子');
  context.fixtureContainer = container;
  run('bindGloss(fixtureContainer)');
  const touch = (target, identifier = 1, x = 70, y = 210) => ({ target, identifier, clientX: x, clientY: y, pageX: x, pageY: y });
  const start = (target = word) => {
    dispatch(target, 'pointerdown');
    return dispatch(target, 'touchstart', { touches: [touch(target)], changedTouches: [touch(target)] });
  };
  const end = (target = word) => dispatch(target, 'touchend', { touches: [], changedTouches: [touch(target)] });
  const click = (target = word) => dispatch(target, 'click', { detail: 1, sourceCapabilities: { firesTouchEvents: true } });
  const tip = () => document.body.querySelectorAll('.gloss-tip')[0];
  const visibleTip = () => Boolean(tip() && !tip().hidden);
  return { run, document, window, word, secondWord, touch, dispatch, start, end, click, advance, tip, visibleTip, clicks: () => answerClicks, selectionClears: () => selectionClears };
}

test('short touch keeps the existing tap-to-answer action and creates no delayed translation', () => {
  const h = harness();
  assert.equal(h.start().defaultPrevented, false);
  h.advance(150);
  assert.equal(h.end().defaultPrevented, false);
  assert.equal(h.click().defaultPrevented, false);
  assert.equal(h.clicks(), 1);
  h.advance(1000);
  assert.equal(h.visibleTip(), false);
});

test('long press shows translation, survives release and never activates the answer token', () => {
  const h = harness();
  h.start(); h.advance(400);
  assert.equal(h.visibleTip(), true);
  assert.match(h.tip().innerHTML, /beneficial/);
  assert.match(h.tip().innerHTML, /有益的/);
  assert.equal(h.end().defaultPrevented, true);
  h.click();
  assert.equal(h.clicks(), 0, 'a compatibility click after long press must be swallowed');
  h.advance(10000);
  assert.equal(h.visibleTip(), true, 'translation remains until an intentional dismissal');
  h.start(); h.advance(80); h.end(); h.click();
  assert.equal(h.clicks(), 1, 'the next ordinary tap must not be swallowed');
  assert.equal(h.visibleTip(), false);
});

test('small finger jitter still permits long press, while a swipe leaves page scrolling available', () => {
  const h = harness();
  h.start();
  const small = h.touch(h.word, 1, 75, 213);
  assert.equal(h.dispatch(h.word, 'touchmove', { touches: [small], changedTouches: [small] }).defaultPrevented, false);
  h.advance(400);
  assert.equal(h.visibleTip(), true);
  const continuedSwipe = h.touch(h.word, 1, 70, 250);
  assert.equal(h.dispatch(h.word, 'touchmove', { touches: [continuedSwipe], changedTouches: [continuedSwipe] }).defaultPrevented, false);
  assert.equal(h.visibleTip(), false, 'moving after the translation opens must also become a normal swipe');
  assert.equal(h.end().defaultPrevented, false);
  h.click();
  assert.equal(h.clicks(), 0, 'a drag must not accidentally answer');
  h.start();
  const moved = h.touch(h.word, 1, 70, 250);
  const move = h.dispatch(h.word, 'touchmove', { touches: [moved], changedTouches: [moved] });
  assert.equal(move.defaultPrevented, false, 'scroll gestures must not be prevented');
  h.advance(1000);
  assert.equal(h.visibleTip(), false);
  assert.equal(h.end().defaultPrevented, false);
});

test('touch cancellation and a second finger prevent ghost translations without blocking pinch gestures', () => {
  for (const cancel of ['touchcancel', 'multitouch']) {
    const h = harness();
    h.start(); h.advance(100);
    const first = h.touch(h.word);
    const second = h.touch(h.document.body, 2, 170, 310);
    const event = cancel === 'touchcancel'
      ? h.dispatch(h.word, 'touchcancel', { touches: [], changedTouches: [first] })
      : h.dispatch(h.document.body, 'touchstart', { touches: [first, second], changedTouches: [second] });
    assert.equal(event.defaultPrevented, false, cancel);
    h.advance(1000);
    assert.equal(h.visibleTip(), false, cancel);
  }
});

test('rapidly consulting another word has no stale timer that hides the newer translation', () => {
  const h = harness();
  h.start(); h.advance(400); h.end();
  h.advance(100);
  h.start(h.secondWord); h.advance(400); h.end(h.secondWord);
  assert.match(h.tip().innerHTML, /children/);
  h.advance(10000);
  assert.equal(h.visibleTip(), true);
  assert.match(h.tip().innerHTML, /孩子/);
});

test('a long press also blocks a compatibility click retargeted to its parent token', () => {
  const h = harness();
  h.start(); h.advance(400); h.end();
  h.click(h.word.parentElement);
  assert.equal(h.clicks(), 0);
  assert.equal(h.visibleTip(), true);
  h.dispatch(h.word.parentElement, 'click', { detail: 0, pointerType: '', sourceCapabilities: null });
  assert.equal(h.clicks(), 1, 'keyboard activation is an intentional answer action');
});

test('tapping blank space and starting another answer dismiss translations without blocking that action', () => {
  const h = harness();
  h.start(); h.advance(400); h.end();
  const blank = h.start(h.document.body);
  h.end(h.document.body); h.click(h.document.body);
  assert.equal(blank.defaultPrevented, false);
  assert.equal(h.visibleTip(), false);
  h.start(); h.advance(400); h.end();
  h.start(h.secondWord); h.advance(50); h.end(h.secondWord); h.click(h.secondWord);
  assert.equal(h.visibleTip(), false);
  assert.equal(h.clicks(), 1);
});

test('touching the translation itself keeps it readable and never answers the underlying token', () => {
  const h = harness();
  h.start(); h.advance(400); h.end();
  h.start(h.tip()); h.end(h.tip()); h.click(h.tip());
  assert.equal(h.visibleTip(), true);
  assert.equal(h.clicks(), 0);
  h.advance(10000);
  assert.equal(h.visibleTip(), true);
});

test('a later normal tap works even when no compatibility click followed the long press', () => {
  for (const delay of [900, 2000, 10000]) {
    const h = harness();
    h.start(); h.advance(400); h.end();
    h.advance(delay);
    assert.equal(h.visibleTip(), true, `${delay} ms: the popup has no expiry timer`);
    h.start(); h.advance(70); h.end(); h.click();
    assert.equal(h.clicks(), 1, `${delay} ms: next deliberate tap`);
    assert.equal(h.visibleTip(), false);
  }
});

test('an inert exercise cannot start a long press or finish one that was already pending', () => {
  for (const lockDuringPress of [false, true]) {
    const h = harness();
    const button = h.word.parentElement;
    if (!lockDuringPress) button.setAttribute('inert', '');
    h.start(); h.advance(100);
    if (lockDuringPress) button.setAttribute('inert', '');
    h.advance(1000);
    assert.equal(h.visibleTip(), false);
    button.removeAttribute('inert');
    h.start(); h.advance(400);
    assert.equal(h.visibleTip(), true, 'unlocked content remains usable');
  }
});

test('scrolling, resizing, losing focus, hiding or rendering cancel pending long presses as well as visible tips', () => {
  for (const action of ['scroll', 'resize', 'blur', 'hide', 'render']) {
    const h = harness();
    h.start(); h.advance(100);
    if (action === 'hide') h.run('glossTip.hide()');
    else if (action === 'render') h.run('render()');
    else h.dispatch(h.window, action, { bubbles: false });
    h.advance(1000);
    assert.equal(h.visibleTip(), false, `${action}: pending timer`);
    h.start(); h.advance(400);
    assert.equal(h.visibleTip(), true, `${action}: a new press still works`);
    if (action === 'hide') h.run('glossTip.hide()');
    else if (action === 'render') h.run('render()');
    else h.dispatch(h.window, action, { bubbles: false });
    assert.equal(h.visibleTip(), false, `${action}: visible tip`);
  }
});

test('mouse hover continues to show and hide translations', () => {
  const h = harness({ hover: true });
  h.dispatch(h.word, 'mouseenter', { pointerType: 'mouse' });
  assert.equal(h.visibleTip(), true);
  h.dispatch(h.word, 'mouseleave', { pointerType: 'mouse' });
  assert.equal(h.visibleTip(), false);
});

test('synthetic mouse events after touch do not replace or close a pinned translation', () => {
  const h = harness({ hover: true });
  h.start(); h.advance(400); h.end();
  h.dispatch(h.word, 'mouseleave', { pointerType: 'mouse' });
  h.dispatch(h.secondWord, 'mouseenter', { pointerType: 'mouse' });
  assert.equal(h.visibleTip(), true);
  assert.match(h.tip().innerHTML, /beneficial/);
});

test('synthetic hover during a pending touch does not cancel the long-press timer', () => {
  const h = harness({ hover: true });
  h.start(); h.advance(100);
  h.dispatch(h.word, 'mouseenter', { pointerType: 'mouse' });
  h.dispatch(h.word, 'mouseleave', { pointerType: 'mouse' });
  h.dispatch(h.secondWord, 'mouseenter', { pointerType: 'mouse' });
  h.dispatch(h.secondWord, 'mouseleave', { pointerType: 'mouse' });
  assert.equal(h.visibleTip(), false, 'the touch threshold has not elapsed');
  h.advance(250);
  assert.equal(h.visibleTip(), true);
  assert.match(h.tip().innerHTML, /beneficial/);
  assert.equal(h.end().defaultPrevented, true);
  h.click();
  assert.equal(h.clicks(), 0);
});

test('a removed word cannot open a delayed translation after its exercise disappears', () => {
  const h = harness();
  h.start(); h.advance(100);
  h.word.remove();
  h.advance(1000);
  assert.equal(h.visibleTip(), false);
});

test('selection protection is scoped to glossary targets, without disabling page scrolling or zoom', () => {
  const css = html.match(/\.glossable\s*\{([^}]+)\}/)[1];
  for (const property of ['user-select', '-webkit-user-select', '-webkit-touch-callout']) {
    assert.match(css, new RegExp(`(?:^|[;\\s])${property}:\\s*none\\s*;`), property);
  }
  assert.doesNotMatch(css, /touch-action:\s*none/);
  const h = harness();
  for (const type of ['selectstart', 'contextmenu']) {
    assert.equal(h.dispatch(h.document.body, type).defaultPrevented, false, `${type}: ordinary page content`);
  }
  assert.equal(h.selectionClears(), 0, 'ordinary text selection must not be globally cleared');
});

test('only touch glossary callouts are prevented; mouse and ordinary content menus remain available', () => {
  const h = harness({ hover: true });
  assert.equal(h.dispatch(h.word, 'contextmenu', { pointerType: 'mouse', button: 2 }).defaultPrevented, false);
  h.start(); h.advance(400);
  assert.equal(h.dispatch(h.word, 'contextmenu', { pointerType: 'touch' }).defaultPrevented, true);
  assert.equal(h.dispatch(h.word, 'contextmenu', { pointerType: '' }).defaultPrevented, true, 'older touch engines may omit pointerType');
  assert.equal(h.dispatch(h.document.body, 'contextmenu', { pointerType: 'touch' }).defaultPrevented, false);
  assert.equal(h.dispatch(h.word, 'contextmenu', { pointerType: 'mouse', button: 2 }).defaultPrevented, false, 'an explicit mouse event must not be mistaken for the recent touch');
});
