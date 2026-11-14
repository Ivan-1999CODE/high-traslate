// Firebase 課堂入口接回原有 Cloudflare AI 小老師。
// 模型、system prompt 與 API 金鑰均沿用 ./tutor.js 和原有環境設定。
import { onRequestPost as legacyTutor } from './tutor.js';

const ALLOWED_ORIGINS = new Set([
  'https://high-traslate.web.app',
  'https://high-traslate.firebaseapp.com',
  'https://high-traslate.pages.dev'
]);
const FIRESTORE_DOCUMENTS = 'https://firestore.googleapis.com/v1/projects/high-traslate/databases/(default)/documents';
const DENIED = '無法存取這份作業，請從專屬連結重新開啟。';
const UNAVAILABLE = 'AI 小老師目前無法使用，請稍後再試或使用內建解說。';

function originAllowed(request) {
  const origin = request.headers.get('Origin');
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

function headersFor(request) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin'
  });
  const origin = request.headers.get('Origin');
  if (ALLOWED_ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function reply(request, status, data) {
  return new Response(JSON.stringify(data), { status, headers: headersFor(request) });
}

function shortText(value, maximum = 1500) {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

function lessonAttempt(content, builtPieceIds) {
  const pieces = new Map((Array.isArray(content.question.answerPieces) ? content.question.answerPieces : [])
    .filter(piece => typeof piece?.id === 'string' && typeof piece?.text === 'string')
    .map(piece => [piece.id, piece.text]));
  // The learner may describe their own attempt only with IDs from this lesson.
  // Never forward browser-supplied context or arbitrary answer text.
  const ids = Array.isArray(builtPieceIds) && builtPieceIds.length <= pieces.size
    && new Set(builtPieceIds).size === builtPieceIds.length
    && builtPieceIds.every(id => typeof id === 'string' && pieces.has(id))
    ? builtPieceIds : [];
  return { ids, text: ids.map(id => pieces.get(id)).join(' ') };
}

function lessonContext(content, attempt) {
  const data = content.question;
  const tenseLabels = {
    'present-simple': '現在簡單式', 'present-continuous': '現在進行式',
    'present-perfect': '現在完成式', 'past-simple': '過去簡單式',
    'past-continuous': '過去進行式', 'past-perfect': '過去完成式',
    'future-simple': '未來簡單式', 'future-continuous': '未來進行式',
    'future-perfect': '未來完成式', 'modal-simple': '情態助動詞'
  };
  const points = Array.isArray(content.guide?.points) ? content.guide.points : [];
  const replacements = Array.isArray(content.replacements) ? content.replacements : [];
  return [
    `中文題目：${shortText(data.chinese)}`,
    `參考英文答案：${shortText(data.answer)}`,
    `時態：${tenseLabels[data.tense] || shortText(data.tense)}；語態：${data.voice === 'active' ? '主動語態' : data.voice === 'passive' ? '被動語態' : shortText(data.voice)}`,
    `時態原因：${shortText(data.tenseReason)}`,
    `語態原因：${shortText(data.voiceReason)}`,
    `組句順序原因：${shortText(data.orderReason)}`,
    `本題已校對重點：${points.slice(0, 10).filter(Array.isArray).map(([title, explanation]) => `${shortText(title)}：${shortText(explanation)}`).join('\n')}`,
    `本題可替換的字／詞：${replacements.slice(0, 20).filter(Array.isArray).map(([original, meaning, alternatives, note]) =>
      `${shortText(original)}（${shortText(meaning)}）：${Array.isArray(alternatives) ? alternatives.map(item => shortText(item)).join(' / ') : ''}；${shortText(note)}`
    ).join('\n')}`,
    `學生目前的組句：${shortText(attempt, 2000)}`,
    '只有在語意、搭配與句型都合適時，才能提出替換寫法；若需連同句型調整，請明確說明。'
  ].join('\n').slice(0, 12000);
}

export async function onRequestOptions({ request }) {
  if (!originAllowed(request)) return reply(request, 403, { error: DENIED });
  const method = request.headers.get('Access-Control-Request-Method');
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if ((method && method !== 'POST') || requestedHeaders.some(value => value !== 'content-type')) {
    return reply(request, 403, { error: DENIED });
  }
  const headers = headersFor(request);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
}

export async function onRequestGet({ request }) {
  if (!originAllowed(request)) return reply(request, 403, { error: DENIED });
  const response = reply(request, 405, { error: '請以提問按鈕呼叫 AI 小老師。' });
  response.headers.set('Allow', 'POST, OPTIONS');
  return response;
}

export async function onRequestPost(context) {
  const { request } = context;
  if (!originAllowed(request)) return reply(request, 403, { error: DENIED });
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return reply(request, 413, { error: '提問內容過長。' });
    payload = JSON.parse(raw);
  } catch {
    return reply(request, 400, { error: '無法讀取提問內容。' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || typeof payload.studentToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.studentToken)
    || typeof payload.assignmentId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(payload.assignmentId)) {
    return reply(request, 403, { error: DENIED });
  }

  let content;
  try {
    // An unauthenticated Firestore REST read enforces capability scope and
    // assignment membership in the deployed rules. Never add Admin credentials.
    const authorized = await fetch(
      `${FIRESTORE_DOCUMENTS}/studentSpaces/${payload.studentToken}/assignments/${payload.assignmentId}`,
      {
        method: 'GET', headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
        // These options also work on older Pages compatibility dates. Manual
        // redirects are rejected below so a capability never follows Location.
        redirect: 'manual', cf: { cacheTtlByStatus: { '100-599': -1 } }
      }
    );
    if ([401, 403, 404].includes(authorized.status)) return reply(request, 403, { error: DENIED });
    if (!authorized.ok) return reply(request, 503, { error: UNAVAILABLE });
    const stored = (await authorized.json())?.fields?.contentJson?.stringValue;
    if (typeof stored !== 'string' || stored.length > 200000) return reply(request, 503, { error: UNAVAILABLE });
    content = JSON.parse(stored);
    if (!content?.question || typeof content.question !== 'object'
      || typeof content.question.chinese !== 'string' || typeof content.question.answer !== 'string') {
      return reply(request, 503, { error: UNAVAILABLE });
    }
  } catch {
    return reply(request, 503, { error: UNAVAILABLE });
  }

  try {
    const attempt = lessonAttempt(content, payload.builtPieceIds);
    const forwardedRequest = new Request(request.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: shortText(payload.question, 500).trim(),
        context: lessonContext(content, attempt.text),
        builtPieceIds: attempt.ids,
        studentToken: payload.studentToken,
        assignmentId: payload.assignmentId
      })
    });
    // Reuse the original handler and its unchanged environment: no model,
    // system prompt or API-key configuration is chosen by the new browser app.
    const result = await legacyTutor({ ...context, request: forwardedRequest });
    if (!result.ok) {
      const status = result.status === 403 ? 403 : result.status === 503 ? 503 : 502;
      return reply(request, status, { error: status === 403 ? DENIED : UNAVAILABLE });
    }
    const data = await result.json();
    const answer = shortText(data?.answer, 12000).trim();
    const model = shortText(data?.model, 100).trim();
    if (!answer || !model) return reply(request, 502, { error: UNAVAILABLE });
    return reply(request, 200, { answer, model });
  } catch {
    return reply(request, 502, { error: UNAVAILABLE });
  }
}
