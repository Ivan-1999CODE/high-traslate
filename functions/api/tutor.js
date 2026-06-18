// Cloudflare Pages Function：AI 小老師後端代理（OpenRouter）
// 前端 POST /api/tutor，這裡用環境變數裡的 OPENROUTER_API_KEY 去呼叫 OpenRouter，
// API Key 不會出現在前端、也不會進 git。
//
// 部署前要在 Cloudflare 後台設定環境變數（Settings → Variables and Secrets）：
//   OPENROUTER_API_KEY = 你的 OpenRouter Key（必填，建議標記為 Secret）
//   OPENROUTER_MODEL   = 免費模型名稱（選填，不填就用下方預設）
//
// 免費模型去這裡挑（篩選 FREE）：https://openrouter.ai/models?max_price=0
// 名稱通常以 :free 結尾，例如 meta-llama/llama-3.3-70b-instruct:free

// 免費模型很容易被上游限流（429），所以準備一串候選，後端會依序嘗試，
// 一個被限流／失敗就自動換下一個。OPENROUTER_MODEL（若有設）會排在最前面優先用。
const FALLBACK_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.1-8b-instruct:free"
];

const SYSTEM_PROMPT = [
  "你是臺灣高中英文老師，協助學生理解大考（學測、分科測驗）英文翻譯題。",
  "回答一律以課綱與大考中心的正式書面英文為準，避免口語、俚語、縮寫與網路用語。",
  "重點解釋時態、語態（主被動）、句子結構與固定片語的依據，全程使用繁體中文說明。",
  "回答簡潔、緊扣學生的問題與本題範圍，不要自由發揮；若不確定就直說，不要編造。"
].join("");

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestPost({ request, env }) {
  try {
    if (!env.OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "後端尚未設定 OPENROUTER_API_KEY 環境變數。" }),
        { status: 503, headers: JSON_HEADERS }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const question = (payload.question || "").toString().slice(0, 500);
    const context = (payload.context || "").toString().slice(0, 4000);

    // 候選模型：自訂的（若有）排最前，再接預設清單，去重。
    const models = [env.OPENROUTER_MODEL, ...FALLBACK_MODELS].filter(
      (name, index, all) => name && all.indexOf(name) === index
    );

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${context}\n\n學生提問：${question || "請給我這題的提示"}` }
    ];

    let lastStatus = 0;
    let lastDetail = "";
    for (const model of models) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "歷屆試題句構練習"
        },
        body: JSON.stringify({ model, messages })
      });

      if (!res.ok) {
        lastStatus = res.status;
        lastDetail = await res.text().catch(() => "");
        // 401/403（金鑰問題）沒必要再換模型，直接回報
        if (res.status === 401 || res.status === 403) break;
        continue; // 429、404、502… 換下一個模型再試
      }

      const json = await res.json();
      const text = (json && json.choices && json.choices[0] &&
        json.choices[0].message && json.choices[0].message.content || "").trim();
      if (text) {
        return new Response(JSON.stringify({ answer: text, model }), { status: 200, headers: JSON_HEADERS });
      }
      lastStatus = 502;
      lastDetail = "回傳空白內容";
    }

    return new Response(
      JSON.stringify({ error: `OpenRouter 全部模型失敗（最後 ${lastStatus}）`, detail: lastDetail }),
      { status: 502, headers: JSON_HEADERS }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error && error.message) || String(error) }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
