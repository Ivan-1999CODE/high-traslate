// Cloudflare Pages Function：AI 小老師後端代理
// 前端 POST /api/tutor，這裡用環境變數裡的 GEMINI_API_KEY 去呼叫 Gemini，
// API Key 不會出現在前端、也不會進 git。
//
// 部署前要在 Cloudflare 後台設定環境變數（Settings → Environment variables）：
//   GEMINI_API_KEY = 你的 Gemini API Key（必填，標記為 Secret）
//   GEMINI_MODEL   = gemini-2.0-flash（選填，不填就用預設）

const SYSTEM_PROMPT = [
  "你是臺灣高中英文老師，協助學生理解大考（學測、分科測驗）英文翻譯題。",
  "回答一律以課綱與大考中心的正式書面英文為準，避免口語、俚語、縮寫與網路用語。",
  "重點解釋時態、語態（主被動）、句子結構與固定片語的依據，全程使用繁體中文說明。",
  "回答簡潔、緊扣學生的問題與本題範圍，不要自由發揮；若不確定就直說，不要編造。"
].join("");

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "後端尚未設定 GEMINI_API_KEY 環境變數。" }),
        { status: 503, headers: JSON_HEADERS }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const question = (payload.question || "").toString().slice(0, 500);
    const context = (payload.context || "").toString().slice(0, 4000);
    const model = env.GEMINI_MODEL || "gemini-2.0-flash";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: "user",
        parts: [{ text: `${context}\n\n學生提問：${question || "請給我這題的提示"}` }]
      }]
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Gemini 回應 ${res.status}`, detail }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    const json = await res.json();
    const text = (json && json.candidates && json.candidates[0] &&
      json.candidates[0].content && json.candidates[0].content.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Gemini 回傳空白內容。" }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    return new Response(JSON.stringify({ answer: text }), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error && error.message) || String(error) }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
