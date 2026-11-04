const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const logic = script.slice(0, script.indexOf('    els.authButton.addEventListener'));

function harness() {
  const elements = new Map();
  const element = () => ({
    innerHTML: '', textContent: '', hidden: false, style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    toggleAttribute() {}, setAttribute() {}, addEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return element(); },
    appendChild() {}, insertAdjacentElement() {}
  });
  const context = vm.createContext({
    console,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      addEventListener() {},
      documentElement: { dataset: {} },
      body: { appendChild() {} }
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    window: { matchMedia() { return { matches: false }; }, addEventListener() {}, setTimeout() {}, clearTimeout() {} }
  });
  vm.runInContext(logic, context);
  const run = (code) => vm.runInContext(code, context);
  const choose = (index) => run(`
    questionIndex = ${index};
    highlightDone = true;
    placements = Object.fromEntries(allStructureTokens().map(t => [t.slot, t.id]));
    selectedTense = question().tense;
    selectedVoice = question().voice;
    phraseWordBuilds = Object.fromEntries(question().answerPieces.map(p => [p.id, pieceWordTokens(p).map(t => t.id)]));
    builtPieces = [];
    revealed = false;
  `);
  return { run, choose, elements };
}

test('inline application JavaScript parses', () => {
  new vm.Script(script);
});

test('all 46 questions have three distinct points and explicit links for every detail', () => {
  const { run } = harness();
  const data = JSON.parse(run('JSON.stringify({ questions, questionGuides })'));
  assert.equal(data.questions.length, 46);
  assert.equal(Object.keys(data.questionGuides).length, 46);
  for (const q of data.questions) {
    const guide = data.questionGuides[q.id];
    assert.ok(guide, q.id);
    assert.equal(guide.points.length, 3, q.id);
    assert.equal(new Set(guide.points.map(p => p[1])).size, 3, q.id);
    for (const [title, text] of guide.points) assert.ok(title && text.length > 15, q.id);
    assert.deepEqual(Object.keys(guide.relations).sort(), q.details.map(d => d.text).sort(), q.id);
  }
});

test('recap preserves every placed element, clause, connector order and original role in all questions', () => {
  const { run, choose } = harness();
  for (let i = 0; i < 46; i++) {
    choose(i);
    const q = JSON.parse(run('JSON.stringify(question())'));
    const recap = run('renderStructureRecap(question())');
    const slots = [...recap.matchAll(/data-recap-slot="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(slots.sort(), [...q.core, ...q.details].map(t => t.slot).sort(), q.id);
    for (const token of [...q.core, ...q.details]) {
      assert.ok(recap.includes(run(`escapeHtml(${JSON.stringify(token.text)})`)), `${q.id}: ${token.text}`);
      assert.ok(recap.includes(`class="structure-chip ${token.role}`), `${q.id}: ${token.role}`);
    }
    for (const clause of q.subclauses || []) {
      for (const value of [clause.text, clause.role, clause.target].filter(Boolean)) {
        assert.ok(recap.includes(run(`escapeHtml(${JSON.stringify(value)})`)), `${q.id}: ${value}`);
      }
    }
    for (const connector of q.details.filter(t => t.beforeClause)) {
      const group = q.coreGroups.find(g => g.id === connector.beforeClause);
      assert.ok(recap.indexOf(`data-recap-slot="${connector.slot}"`) < recap.indexOf(`data-recap-slot="${group.slots[0]}"`), q.id);
    }
    run('placements = {}');
    assert.equal(run('renderStructureRecap(question())'), '', `${q.id}: incomplete structure must stay hidden`);
  }
});

test('recap stays below the sentence builder during assembly in both modes', () => {
  const { run, choose, elements } = harness();
  for (const mode of ['simple', 'advanced']) {
    for (let i = 0; i < 46; i++) {
      choose(i);
      run(`practiceMode = ${JSON.stringify(mode)}`);
      const before = run('JSON.stringify({ placements, builtPieces, phraseWordBuilds, selectedTense, selectedVoice })');
      run('renderPhraseStage(question()); renderStageThree(question())');
      const sentence = elements.get('stageThree').innerHTML;
      assert.ok(!elements.get('stagePhrase').innerHTML.includes('structure-recap'));
      assert.ok(sentence.indexOf('structure-recap') > sentence.indexOf('英文組句'));
      assert.ok(sentence.indexOf('structure-recap') > sentence.indexOf('checkSentenceButton'));
      assert.equal(run('JSON.stringify({ placements, builtPieces, phraseWordBuilds, selectedTense, selectedVoice })'), before);
      assert.ok(!sentence.includes('完整句子</span>'), 'do not reveal the answer during assembly');
      run('builtPieces = [question().answerPieces[0].id]; renderStageThree(question())');
      const partial = elements.get('stageThree').innerHTML;
      assert.ok(partial.includes('data-built-id'));
      assert.ok(partial.indexOf('structure-recap') > partial.indexOf('checkSentenceButton'));
    }
  }
});

test('completed stage has one continuous answer and no repeated token answer or summary panels', () => {
  const { run, choose, elements } = harness();
  for (let i = 0; i < 46; i++) {
    choose(i);
    run('builtPieces = question().answerPieces.map(p => p.id); checkSentence()');
    const sentence = elements.get('stageThree').innerHTML;
    const reward = elements.get('hintText').innerHTML;
    assert.equal((sentence.match(/class="answer-box"/g) || []).length, 1);
    assert.ok(sentence.indexOf('structure-recap') > sentence.indexOf('class="answer-box"'));
    assert.ok(!sentence.includes('data-built-id'));
    assert.ok(!sentence.includes('checkSentenceButton'));
    assert.equal((reward.match(/<li>/g) || []).length, 3);
    assert.ok(!reward.includes('可替換單字'));
    assert.ok(!reward.includes('key-grid'));
    assert.equal(elements.get('feedback').textContent, '組句完成，可以查看本題重點。');
    assert.equal(elements.get('analysisBox').hidden, true);
  }
});

test('offline why questions use relevant guidance and never blindly return tense notes', () => {
  const { run, choose } = harness();
  choose(run('questions.findIndex(q => q.id === "exam-115-02")'));
  assert.match(run('generateAiAnswer("為什麼用 conducting？", question())'), /動作主詞/);
  assert.match(run('generateAiAnswer("為什麼這個介系詞？", question())'), /指出|加上英文詞/);
  assert.equal(run('generateAiAnswer("為什麼用這個時態？", question())'), run('question().tenseReason'));
  choose(run('questions.findIndex(q => q.id === "exam-102-01")'));
  assert.match(run('generateAiAnswer("urban 可以換 downtown 嗎？", question())'), /市中心/);
});

test('recap colors share original stage-two CSS declarations', () => {
  for (const role of ['subject', 'verb', 'object', 'detail', 'lead', 'connector']) {
    assert.ok(html.includes(`.structure-chip.${role},\n    .token.${role},`) || html.includes(`.structure-chip.${role},\r\n    .token.${role},`), role);
  }
});

test('deduplicating success messages keeps error explanations available', () => {
  const { run, elements } = harness();
  run('analysisMessage = { type: "correct", title: "成功", text: "重複訊息" }; renderAnalysis()');
  assert.equal(elements.get('analysisBox').hidden, true);
  run('analysisMessage = { type: "error", title: "調整順序", text: "請確認修飾對象" }; renderAnalysis()');
  assert.equal(elements.get('analysisBox').hidden, false);
  assert.match(elements.get('analysisBox').innerHTML, /請確認修飾對象/);
});

test('word tooltips retain meanings without unreviewed synonym lists', () => {
  const { run, choose } = harness();
  choose(run('questions.findIndex(q => q.id === "exam-102-01")'));
  const word = JSON.parse(run('JSON.stringify(getGlossary(question()).find(e => e.value.en === "urban").value)'));
  assert.equal(word.zh, '都市的');
  assert.equal(word.note, '');
});
