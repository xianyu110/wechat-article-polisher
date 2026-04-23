export function loadLlmConfig(overrides = {}) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: String(overrides.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey,
    model: overrides.model || process.env.LLM_MODEL || 'gpt-4.1-mini',
    systemPrompt:
      overrides.systemPrompt ||
      process.env.LLM_SYSTEM_PROMPT ||
      '你是一名中文内容编辑，擅长把科技、商业、AI 类文章整理成适合微信公众号发布的 Markdown 成稿。',
  };
}

function getMessageContent(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export async function polishMarkdown(markdown, prompt, config) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`润色接口失败: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  const content = getMessageContent(payload?.choices?.[0]?.message);
  if (!content) {
    throw new Error('润色接口返回为空。');
  }

  return {
    markdown: content.trim() + '\n',
    raw: payload,
  };
}
