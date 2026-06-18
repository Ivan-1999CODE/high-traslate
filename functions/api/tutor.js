// Cloudflare Pages Function：AI 小老師後端代理（OpenRouter）
// 前端 POST /api/tutor，這裡用環境變數裡的 OPENROUTER_API_KEY 去呼叫 OpenRouter，
// API Key 不會出現在前端、也不會進 git。
//
// 部署前要在 Cloudflare 後台設定環境變數（Settings → Variables and Secrets）：
//   OPENROUTER_API_KEY = 你的 OpenRouter Key（必填，建議標記為 Secret）
//   OPENROUTER_MODEL   = 指定模型（選填）。不填的話，後端會即時去 OpenRouter
//                        撈「目前免費的模型清單」自動挑選，避免寫死的代號失效。

const SYSTEM_PROMPT = [
  "你是臺灣高中英文老師，協助學生理解大考（學測、分科測驗）英文翻譯題。",
  "回答一律以課綱與大考中心的正式書面英文為準，避免口語、俚語、縮寫與網路用語。",
  "重點解釋時態、語態（主被動）、句子結構與固定片語的依據，全程使用繁體中文說明。",
  "回答簡潔、緊扣學生的問題與本題範圍，不要自由發揮；若不確定就直說，不要編造。"
].join("");

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

// 中文表現較好的優先排序關鍵字
const PREFERRED = ["deepseek", "qwen", "glm", "gemini", "mistral", "llama", "gemma"];

function rankModel(id) {
  const lower = id.toLowerCase();
  const idx = PREFERRED.findIndex((key) => lower.includes(key));
  return idx === -1 ? PREFERRED.length : idx;
}

// 即時向 OpenRouter 取得「目前免費」的模型清單（prompt 與 completion 價格皆為 0）
async function listFreeModels(apiKey) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!res.ok) return [];
    const json = await res.json();
    return ((json && json.data) || [])
      .filter((m) => {
        const p = m.pricing || {};
        return Number(p.prompt) === 0 && Number(p.completion) === 0;
      })
      .map((m) => m.id)
      .sort((a, b) => rankModel(a) - rankModel(b));
  } catch (error) {
    return [];
  }
}

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

    // 候選模型：自訂的（若有）排最前，再接「即時撈到的免費清單」，去重後最多試 6 個。
    const discovered = await listFreeModels(env.OPENROUTER_API_KEY);
    const models = [env.OPENROUTER_MODEL, ...discovered]
      .filter((name, index, all) => name && all.indexOf(name) === index)
      .slice(0, 6);

    if (!models.length) {
      return new Response(
        JSON.stringify({ error: "OpenRouter 目前沒有可用的免費模型，請改設定 OPENROUTER_MODEL。" }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

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
        // 金鑰問題沒必要再換模型，直接回報
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
      JSON.stringify({
        error: `OpenRouter 嘗試 ${models.length} 個免費模型都失敗（最後 ${lastStatus}）`,
        detail: lastDetail,
        tried: models
      }),
      { status: 502, headers: JSON_HEADERS }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error && error.message) || String(error) }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
}
