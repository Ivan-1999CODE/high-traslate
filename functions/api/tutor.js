// Cloudflare Pages Function：AI 小老師後端代理（OpenAI）
// 前端 POST /api/tutor，這裡用環境變數裡的 OPENAI_API_KEY 去呼叫 OpenAI，
// API Key 不會出現在前端、也不會進 git。
//
// 部署前要在 Cloudflare 後台設定環境變數（Settings → Variables and Secrets）：
//   OPENAI_API_KEY = 你的 OpenAI Key（sk-... 開頭，必填，建議標記為 Secret）
//   OPENAI_MODEL   = 模型名稱（選填，不填就用下方預設的 gpt-4o-mini，便宜又夠用）

const DEFAULT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = [
  "你是臺灣高中英文老師，協助學生理解大考（學測、分科測驗）英文翻譯題。",
  "回答一律以課綱與大考中心的正式書面英文為準，避免口語、俚語、縮寫與網路用語。",
  "重點解釋時態、語態（主被動）、句子結構與固定片語的依據，全程使用繁體中文說明。",
  "回答簡潔、緊扣學生的問題與本題範圍，不要自由發揮；若不確定就直說，不要編造。"
].join("");

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "後端尚未設定 OPENAI_API_KEY 環境變數。" }),
        { status: 503, headers: JSON_HEADERS }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const question = (payload.question || "").toString().slice(0, 500);
    const context = (payload.context || "").toString().slice(0, 4000);
    const model = env.OPENAI_MODEL || DEFAULT_MODEL;

    const body = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${context}\n\n學生提問：${question || "請給我這題的提示"}` }
      ]
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `OpenAI 回應 ${res.status}`, detail }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    const json = await res.json();
    const text = (json && json.choices && json.choices[0] &&
      json.choices[0].message && json.choices[0].message.content || "").trim();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "OpenAI 回傳空白內容。" }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    return new Response(JSON.stringify({ answer: text, model }), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error && error.message) || String(error) }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
