const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const originalAnswers = require('./fixtures/original-answers.json');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const logic = script.slice(0, script.indexOf('    els.authButton.addEventListener'));

function harness() {
  const elements = new Map();
  const storage = new Map();
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
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    window: { matchMedia() { return { matches: false }; }, addEventListener() {}, setTimeout() {}, clearTimeout() {} }
  });
  vm.runInContext(logic, context);
  const run = (code) => vm.runInContext(code, context);
  const json = (code) => JSON.parse(run(`JSON.stringify(${code})`));
  const choose = (id) => run(`
    questionIndex = questions.findIndex(q => q.id === ${JSON.stringify(id)});
    resetWorkingState();
    highlightDone = true;
    placements = Object.fromEntries(allStructureTokens().map(t => [t.slot, t.id]));
    selectedTense = question().tense;
    selectedVoice = question().voice;
    practiceMode = 'advanced';
  `);
  return { run, json, choose, elements, storage };
}

const normalized = (text) => text.trim().replace(/[.,;!?]+$/, '').replace(/\s+/g, ' ').toLowerCase();
const finiteClauseTypes = new Set(['名詞子句', '形容詞子句']);
const finiteClauseQuestions = ['exam-114-02', 'exam-111-02', 'exam-108-02', 'exam-101-02', 'exam-97-01', 'exam-95-01', 'exam-112-01', 'exam-93-02'];

test('all 46 reviewed answers stay unchanged and every piece sequence reconstructs its answer', () => {
  const { json } = harness();
  const questions = json('questions');
  assert.equal(questions.length, 46);
  assert.deepEqual(Object.fromEntries(questions.map(q => [q.id, q.answer])), originalAnswers);
  for (const q of questions) {
    assert.equal(q.answerPieces.map(p => p.text).join(' '), originalAnswers[q.id], q.id);
    const pieceIds = q.answerPieces.map(p => p.id);
    assert.equal(new Set(pieceIds).size, pieceIds.length, q.id);
    assert.deepEqual([...q.pieceOrder].sort(), [...pieceIds].sort(), `${q.id}: scrambled bank must contain every piece exactly once`);
  }
});

test('every sentence piece has one valid structural source and every Chinese structure slot is represented', () => {
  const { json } = harness();
  for (const q of json('questions')) {
    const structuralTokens = [...q.core, ...q.details];
    const sources = new Map(structuralTokens.map(token => [token.slot, token]));
    for (const clause of q.subclauses || []) {
      assert.ok(clause.id && clause.chinese, `${q.id}: clause identity and Chinese meaning`);
      assert.ok(!sources.has(clause.id), `${q.id}: clause source must not collide with a slot`);
      sources.set(clause.id, clause);
    }
    for (const piece of q.answerPieces) {
      assert.equal(typeof piece.source, 'string', `${q.id}: ${piece.text}`);
      assert.ok(sources.has(piece.source), `${q.id}: invalid source ${piece.source}`);
    }
    for (const token of structuralTokens) {
      assert.ok(q.answerPieces.some(p => p.source === token.slot), `${q.id}: omitted ${token.slot} (${token.text})`);
    }
  }
});

test('all 46 structure stages render only real slots, including SV questions without an object', () => {
  const { run, json, choose, elements } = harness();
  for (const id of Object.keys(originalAnswers)) {
    choose(id);
    const expected = json('[...question().core, ...question().details].map(t => t.slot)').sort();
    for (const filled of [true, false]) {
      if (!filled) run('resetWorkingState()');
      assert.doesNotThrow(() => run('renderStageOne(question())'), `${id}: ${filled ? 'filled' : 'empty'}`);
      const slots = [...elements.get('stageOne').innerHTML.matchAll(/data-slot="([^"]+)"/g)].map(match => match[1]).sort();
      assert.deepEqual(slots, expected, id);
    }
  }
});

test('reviewed main-clause boundaries keep subjects, verbs, objects and complements separate', () => {
  const { json } = harness();
  const questions = json('questions');
  const examples = {
    'exam-113-01': ['people', 'always see', 'politicians', 'visiting renowned temples'],
    'exam-105-01': ["today's young people", 'enjoy', 'more freedom and prosperity.'],
    'exam-103-01': ['Some young people', 'quit', 'high-paying jobs'],
    'exam-97-01': ['Listening to music', 'is', 'a hobby'],
    'exam-97-02': ['can bring', 'you', 'even more joy.'],
    'exam-95-02': ['Teachers', 'should encourage', 'students'],
    'exam-94-02': ['allows', 'us']
  };
  for (const [id, expectedPieces] of Object.entries(examples)) {
    const q = questions.find(q => q.id === id);
    const actual = q.answerPieces.map(p => p.text);
    for (const text of expectedPieces) assert.ok(actual.includes(text), `${id}: missing separate piece ${text}`);
  }
  const q113 = questions.find(q => q.id === 'exam-113-01');
  const visiting = q113.answerPieces.find(p => p.text === 'visiting renowned temples');
  assert.equal(q113.core.find(t => t.slot === visiting.source)?.label, '受詞補語');
});

test('identical we pieces may exchange positions without rejecting an otherwise correct sentence', () => {
  const { run, choose } = harness();
  for (const id of ['exam-107-02', 'exam-96-01']) {
    choose(id);
    run(`
      builtPieces = question().answerPieces.map(p => p.id);
      globalThis.wePositions = question().answerPieces.map((p, i) => p.text === 'we' ? i : -1).filter(i => i >= 0);
      [builtPieces[wePositions[0]], builtPieces[wePositions[1]]] = [builtPieces[wePositions[1]], builtPieces[wePositions[0]]];
    `);
    assert.equal(run('wePositions.length'), 2, id);
    assert.equal(run('isSentenceDone()'), true, `${id}: same visible sentence`);
    run('[builtPieces[0], builtPieces[1]] = [builtPieces[1], builtPieces[0]]');
    assert.equal(run('isSentenceDone()'), false, `${id}: genuinely wrong word order`);
    run('builtPieces = question().answerPieces.map(p => p.id); builtPieces.pop()');
    assert.equal(run('isSentenceDone()'), false, `${id}: missing piece`);
    run('builtPieces = question().answerPieces.map(p => p.id); builtPieces[wePositions[1]] = builtPieces[wePositions[0]]');
    assert.equal(run('isSentenceDone()'), false, `${id}: reused identical piece ID`);
    run('builtPieces = question().answerPieces.map(p => p.id); builtPieces[0] = "unknown-piece"');
    assert.equal(run('isSentenceDone()'), false, `${id}: invalid ID`);
  }
});

test('passive, existential and coordinated structures do not invent main-clause direct objects', () => {
  const { json } = harness();
  const questions = json('questions');
  const q = (id) => questions.find(q => q.id === id);
  const passive = q('exam-110-02');
  const subject = passive.answerPieces.find(p => p.text === 'traffic regulations');
  assert.equal(passive.core.find(t => t.slot === subject?.source)?.role, 'subject');
  assert.ok(!passive.core.some(t => /主管機關/.test(t.text)));
  assert.ok(!passive.core.some(t => t.label === '受詞'));

  const existential = q('exam-107-01');
  assert.ok(!existential.core.some(t => /災害/.test(t.text)), 'caused disasters belong to the result phrase');
  assert.ok(existential.details.some(t => /災害/.test(t.text)));

  const coordinated = q('exam-107-02');
  assert.ok(!coordinated.core.some(t => /受詞/.test(t.label) && /室內/.test(t.text)), 'indoors is an adverb of place');

  const snow = q('exam-106-01');
  assert.ok(!snow.core.some(t => /受詞/.test(t.label) && /積雪/.test(t.text)), 'with thick snow is not a passive verb direct object');
  const nightMarkets = q('exam-100-01');
  assert.ok(nightMarkets.core.some(t => /補語/.test(t.label) && /代表|在地文化/.test(t.text)));
});

test('all eight finite noun/adjective clauses are complete independent advanced practice units', () => {
  const { run, json, choose } = harness();
  const questions = json('questions');
  const actualIds = questions.filter(q => (q.subclauses || []).some(c => finiteClauseTypes.has(c.type))).map(q => q.id);
  assert.deepEqual(actualIds.sort(), [...finiteClauseQuestions].sort());
  for (const id of finiteClauseQuestions) {
    choose(id);
    const q = json('question()');
    const advancedIds = json('buildablePieces(question()).map(p => p.id)');
    for (const clause of q.subclauses.filter(c => finiteClauseTypes.has(c.type))) {
      const matches = q.answerPieces.filter(p => normalized(p.text) === normalized(clause.text));
      assert.equal(matches.length, 1, `${id}: ${clause.text} must be one complete piece`);
      const piece = matches[0];
      assert.ok(advancedIds.includes(piece.id), `${id}: clause must not skip advanced practice`);
      assert.equal(json(`pieceSubclause(question().answerPieces.find(p => p.id === ${JSON.stringify(piece.id)}), question())`).id, clause.id);
      if (clause.type === '形容詞子句') assert.equal(piece.source, clause.id);
      else assert.equal(q.core.find(t => t.slot === piece.source)?.label, '受詞');
    }
  }
  choose('exam-105-02');
  assert.equal(json('question().subclauses')[0].type, '疑問詞＋不定詞');
  assert.ok(!run('question().subclauses.some(c => c.type === "名詞子句")'));
});

test('advanced clause rows show their type, Chinese meaning and attachment before and after completion', () => {
  const { run, json, choose, elements } = harness();
  for (const id of finiteClauseQuestions) {
    choose(id);
    const q = json('question()');
    for (const complete of [false, true]) {
      if (complete) run('phraseWordBuilds = Object.fromEntries(question().answerPieces.map(p => [p.id, pieceWordTokens(p).map(t => t.id)]))');
      run('renderPhraseStage(question())');
      const rendered = elements.get('stagePhrase').innerHTML;
      for (const clause of q.subclauses.filter(c => finiteClauseTypes.has(c.type))) {
        const piece = q.answerPieces.find(p => normalized(p.text) === normalized(clause.text));
        assert.ok(rendered.includes(`data-practice-piece="${piece.id}"`), id);
        assert.ok(rendered.includes(`data-clause-id="${clause.id}"`), id);
        for (const value of [clause.type, clause.chinese, clause.target]) {
          assert.ok(rendered.includes(run(`escapeHtml(${JSON.stringify(value)})`)), `${id}: missing ${value}`);
        }
      }
    }
  }
});

test('how + infinitive is practiced as a phrase and never described as a complete clause', () => {
  const { run, choose, elements } = harness();
  choose('exam-105-02');
  run('renderPhraseStage(question())');
  let rendered = elements.get('stagePhrase').innerHTML;
  assert.match(rendered, /疑問詞＋不定詞/);
  const instructions = [...rendered.matchAll(/class="built-placeholder">([^<]*)<\/span>/g)].map(match => match[1]);
  assert.ok(instructions.length > 0);
  assert.ok(instructions.every(text => !text.includes('完整子句')));
  run(`
    globalThis.infinitive = question().answerPieces.find(p => p.text.startsWith('how to'));
    pieceWordTokens(infinitive).map(t => t.id).forEach(addPhraseWord);
  `);
  assert.match(elements.get('feedback').textContent, /^片段「/);
  assert.doesNotMatch(elements.get('feedback').textContent, /子句/);
  rendered = elements.get('stagePhrase').innerHTML;
  assert.doesNotMatch(rendered, /子句完成/);
  assert.match(rendered, /疑問詞＋不定詞/);
});

test('every clause must be assembled before advanced mode unlocks sentence assembly', () => {
  const { run, json, choose } = harness();
  for (const id of finiteClauseQuestions) {
    choose(id);
    const q = json('question()');
    const clause = q.subclauses.find(c => finiteClauseTypes.has(c.type));
    const piece = q.answerPieces.find(p => normalized(p.text) === normalized(clause.text));
    run(`phraseWordBuilds = Object.fromEntries(question().answerPieces.filter(p => p.id !== ${JSON.stringify(piece.id)}).map(p => [p.id, pieceWordTokens(p).map(t => t.id)]))`);
    assert.equal(run('isPhraseStageDone(question())'), false, `${id}: untouched clause`);
    run(`phraseWordBuilds[${JSON.stringify(piece.id)}] = pieceWordTokens(question().answerPieces.find(p => p.id === ${JSON.stringify(piece.id)})).map(t => t.id).reverse()`);
    assert.equal(run('isPhraseStageDone(question())'), false, `${id}: incorrect clause`);
    run(`phraseWordBuilds[${JSON.stringify(piece.id)}] = pieceWordTokens(question().answerPieces.find(p => p.id === ${JSON.stringify(piece.id)})).map(t => t.id)`);
    assert.equal(run('isPhraseStageDone(question())'), true, `${id}: complete clause`);
  }
});

test('current structure and partial word work survive a save/restore round trip', () => {
  const { run, json, choose } = harness();
  choose('exam-95-01');
  run(`
    globalThis.clausePiece = question().answerPieces.find(p => pieceSubclause(p, question()));
    phraseWordBuilds[clausePiece.id] = pieceWordTokens(clausePiece).slice(0, 2).map(t => t.id);
    builtPieces = [question().answerPieces[0].id];
    highlightMarks = { 0: 'subject' };
    hasAttempted = true;
    saveCurrentProgress();
  `);
  const saved = json('readSavedProgress().questions[question().id]');
  assert.equal(typeof saved.structureSignature, 'string');
  assert.equal(typeof saved.pieceSignature, 'string');
  assert.ok(saved.structureSignature.length > 0 && saved.pieceSignature.length > 0);
  const before = json('({ placements, builtPieces, phraseWordBuilds, selectedTense, selectedVoice, highlightMarks })');
  run('restoreQuestionState()');
  assert.deepEqual(json('({ placements, builtPieces, phraseWordBuilds, selectedTense, selectedVoice, highlightMarks })'), before);
  assert.equal(run('isPhraseStageDone(question())'), false);
  assert.equal(run('revealed'), false);
});

test('old or mismatched structure versions do not reuse positional IDs from unfinished work', () => {
  const { run, json, choose } = harness();
  for (const version of ['missing', 'changed']) {
    choose('exam-95-01');
    run(`
      globalThis.legacy = {
        stage: 4, highlightDone: true, highlightMarks: { 0: 'subject' },
        placements: Object.fromEntries(allStructureTokens().map(t => [t.slot, t.id])),
        selectedTense: question().tense, selectedVoice: question().voice,
        builtPieces: question().answerPieces.map(p => p.id),
        phraseWordBuilds: Object.fromEntries(question().answerPieces.map(p => [p.id, pieceWordTokens(p).map(t => t.id)])),
        revealed: false, completed: false, wasCompleted: false, hasAttempted: true
      };
      ${version === 'changed' ? "legacy.structureSignature = 'previous structure'; legacy.pieceSignature = 'previous pieces';" : ''}
      writeSavedProgress({ lastQuestionId: question().id, questions: {
        [question().id]: legacy, 'exam-112-01': { completed: true }
      }});
      restoreQuestionState();
    `);
    assert.deepEqual(json('placements'), {}, version);
    assert.deepEqual(json('builtPieces'), [], version);
    assert.deepEqual(json('phraseWordBuilds'), {}, version);
    assert.equal(run('selectedTense'), null, version);
    assert.equal(run('selectedVoice'), null, version);
    assert.equal(run('highlightDone'), true, version);
    assert.deepEqual(json('highlightMarks'), { 0: 'subject' }, version);
    assert.equal(run('revealed'), false, version);
    assert.equal(run('isStageOneDone()'), false, version);
    run('saveCurrentProgress()');
    assert.equal(run('readSavedProgress().questions["exam-112-01"].completed'), true);
  }
});

test('completed legacy questions keep completion without automatically solving the new clause practice', () => {
  const { run, json, choose } = harness();
  for (const flag of ['completed', 'revealed']) {
    choose('exam-95-01');
    run(`writeSavedProgress({ lastQuestionId: question().id, questions: {
      [question().id]: {
        ${flag}: true, stage: 4,
        placements: { subject: 's', verb: 'v', object: 'o', 'detail-1': 'd1' },
        builtPieces: ['p1', 'p2', 'p3', 'p4'],
        phraseWordBuilds: { p3: ['p3::w0', 'p3::w1', 'p3::w2', 'p3::w3', 'p3::w4'] }
      }
    }}); restoreQuestionState();`);
    assert.equal(run('revealed'), true, flag);
    assert.equal(run('isStageOneDone()'), true, flag);
    assert.equal(run('isSentenceDone()'), true, flag);
    assert.equal(run('canRevealAnswer()'), true, flag);
    assert.deepEqual(json('builtPieces'), json('question().answerPieces.map(p => p.id)'), flag);
    assert.deepEqual(json('phraseWordBuilds'), {}, flag);
    assert.equal(run('isPhraseStageDone(question())'), false, flag);
    run('saveCurrentProgress()');
    const saved = json('readSavedProgress().questions[question().id]');
    assert.equal(saved.completed, true, flag);
    assert.equal(saved.wasCompleted, true, flag);
  }
});

test('legacy redo keeps a blank attempt and the previous completion privilege', () => {
  const { run, json, choose } = harness();
  choose('exam-95-01');
  run(`writeSavedProgress({ lastQuestionId: question().id, questions: {
    [question().id]: { completed: true, wasCompleted: true, isRedoing: true, builtPieces: ['p1'], placements: { subject: 's' } }
  }}); restoreQuestionState();`);
  assert.deepEqual(json('placements'), {});
  assert.deepEqual(json('builtPieces'), []);
  assert.deepEqual(json('phraseWordBuilds'), {});
  assert.equal(run('highlightDone'), false);
  assert.equal(run('revealed'), false);
  assert.equal(run('canRevealAnswer()'), true);
  run('saveCurrentProgress()');
  const saved = json('readSavedProgress().questions[question().id]');
  assert.equal(saved.completed, true);
  assert.equal(saved.wasCompleted, true);
  assert.equal(saved.isRedoing, true);
});

test('restored word work accepts only unique IDs belonging to that practice piece', () => {
  const { run, json, choose } = harness();
  choose('exam-95-01');
  run(`
    saveCurrentProgress();
    globalThis.store = readSavedProgress();
    globalThis.clausePiece = question().answerPieces.find(p => pieceSubclause(p, question()));
    globalThis.words = pieceWordTokens(clausePiece).map(t => t.id);
    globalThis.otherPiece = question().answerPieces.find(p => p.id !== clausePiece.id);
    store.questions[question().id].phraseWordBuilds = {
      [clausePiece.id]: [words[0], words[0], pieceWordTokens(otherPiece)[0].id, words[1], clausePiece.id + '::w999'],
      'unknown-piece': ['unknown-piece::w0']
    };
    writeSavedProgress(store);
    restoreQuestionState();
  `);
  assert.deepEqual(json('phraseWordBuilds'), json('({ [clausePiece.id]: words.slice(0, 2) })'));
  assert.equal(run('isPhraseStageDone(question())'), false);
});

module.exports = { harness };
