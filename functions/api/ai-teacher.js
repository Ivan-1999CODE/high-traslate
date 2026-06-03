const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const cleanText = (value, maxLength = 1200) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const buildTeacherPrompt = (question, item) => {
  const sentence = cleanText(item?.sentence);
  const sentenceCh = cleanText(item?.sentence_ch);
  const word = cleanText(item?.word, 120);
  const part = cleanText(item?.part, 40);
  const chinese = cleanText(item?.chinese, 160);

  return `
你是一位親切、專業的英文老師，正在教導一位台灣學生。

目前正在討論的題目如下：
- 英文句子: "${sentence}"
- 中文翻譯: "${sentenceCh}"
- 重點單字: "${word}" (${part}, ${chinese})

學生的問題是： "${question}"

請根據上述「當前句子」的情境來回答學生的問題。
如果是問同義詞，請給出適合這句語境的同義詞。
如果是問改寫，請示範如何改寫這句話。
如果是問文法，請解釋這句話的文法結構。

回答請用繁體中文，語氣鼓勵且簡潔，長度不要太長。

重要規則：請給出純文字回答，不要使用 Markdown 格式，不要用粗體、標題或列表符號。
`;
};

const makeJsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: jsonHeaders });

export const onRequestPost = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY) {
    return makeJsonResponse(
      { error: "GEMINI_API_KEY is not configured on Cloudflare Pages." },
      500
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return makeJsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const question = cleanText(payload?.question, 600);
  const item = payload?.item || {};

  if (!question) {
    return makeJsonResponse({ error: "Question is required." }, 400);
  }

  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: buildTeacherPrompt(question, item) }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 600,
        },
      }),
    });

    const data = await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      return makeJsonResponse(
        {
          error: data?.error?.message || `Gemini API error ${geminiResponse.status}.`,
        },
        502
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "抱歉，我沒有聽清楚。";

    return makeJsonResponse({ text });
  } catch (error) {
    return makeJsonResponse(
      { error: "Failed to connect to Gemini API." },
      502
    );
  }
};
