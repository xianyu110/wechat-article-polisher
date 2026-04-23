const defaultPrompt = '帮我润色一下，重点字加粗，图片不要省略，重点字加粗，可列表格';
const historyKey = 'wechat-article-polisher-history-v1';
const settingsKey = 'wechat-article-polisher-settings-v1';
const maxHistoryItems = 12;

const defaultSettings = {
  apiBase: '',
  llmBaseUrl: '',
  llmModel: '',
  llmSystemPrompt: '',
  imageUploadUrl: '',
  imageMethod: 'POST',
  imageField: 'file',
  imageResponsePath: '0.src',
  imageUrlPrefix: '',
  imageHeaders: '{}',
  imageFormFields: '{}',
};

const state = {
  result: null,
  polishedBlobUrl: '',
  hostedBlobUrl: '',
  htmlBlobUrl: '',
  history: [],
  settings: { ...defaultSettings },
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const normalizeUrl = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, window.location.href).toString();
  } catch {
    return trimmed;
  }
};

const getSearch = () => new URLSearchParams(window.location.search);

const readSettings = () => {
  try {
    const raw = window.localStorage.getItem(settingsKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...defaultSettings, ...(parsed || {}) };
  } catch {
    return { ...defaultSettings };
  }
};

const getApiBase = () => {
  const queryApi = getSearch().get('api');
  if (queryApi) return normalizeUrl(queryApi).replace(/\/$/, '');
  if (state.settings.apiBase) return normalizeUrl(state.settings.apiBase).replace(/\/$/, '');
  if (window.WECHAT_POLISH_API_BASE) return String(window.WECHAT_POLISH_API_BASE).replace(/\/$/, '');
  if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) {
    return `${window.location.origin}`.replace(/4174$/, '4314');
  }
  return '';
};

const setStatus = (message, type = '') => {
  const node = $('#status-box');
  node.textContent = message;
  node.className = `status${type ? ` ${type}` : ''}`;
};

const setApiNote = () => {
  const apiBase = getApiBase();
  $('#api-note').innerHTML = apiBase
    ? `当前 API：<code>${escapeHtml(apiBase)}</code>`
    : '当前页面未自动发现 API，请在前端配置里填写，或在 URL 上添加 `?api=https://你的-api-域名`。';
};

const revokeDownloads = () => {
  if (state.polishedBlobUrl) URL.revokeObjectURL(state.polishedBlobUrl);
  if (state.hostedBlobUrl) URL.revokeObjectURL(state.hostedBlobUrl);
  if (state.htmlBlobUrl) URL.revokeObjectURL(state.htmlBlobUrl);
  state.polishedBlobUrl = '';
  state.hostedBlobUrl = '';
  state.htmlBlobUrl = '';
};

const makeDownload = (content, type) => {
  if (!content) return '';
  return URL.createObjectURL(new Blob([content], { type }));
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `请求失败：HTTP ${response.status}`);
  }
  return payload;
};

const applyInlineMarkdown = (text) => {
  let value = escapeHtml(text || '');
  value = value.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:16px;margin:14px 0;display:block;" />');
  value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  return value;
};

const markdownToHtml = (markdown = '') => {
  const lines = String(markdown).replace(/\r/g, '').split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${applyInlineMarkdown(paragraph.join('<br />'))}</p>`);
    paragraph = [];
  };

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeLists();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${applyInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${applyInlineMarkdown(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${applyInlineMarkdown(ol[1])}</li>`);
      continue;
    }

    closeLists();
    paragraph.push(line);
  }

  flushParagraph();
  closeLists();
  return html.join('\n');
};

const buildHtmlDocument = (title, markdown) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title || 'article')}</title>
    <style>
      body { margin: 0; background: #f5f0e8; color: #211913; font-family: Georgia, "Songti SC", "STSong", serif; }
      main { width: min(860px, calc(100vw - 32px)); margin: 24px auto 48px; padding: 32px; background: #fffdf9; border: 1px solid rgba(33, 25, 19, 0.08); border-radius: 28px; box-shadow: 0 24px 80px rgba(66, 36, 14, 0.08); }
      h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
      p, li { line-height: 1.85; font-size: 17px; }
      ul, ol { padding-left: 24px; }
      a { color: #0d6d64; }
      code { padding: 2px 6px; border-radius: 999px; background: #f2ece4; }
      img { max-width: 100%; border-radius: 16px; margin: 14px 0; display: block; }
      strong { color: #ad431d; }
    </style>
  </head>
  <body>
    <main>
${markdownToHtml(markdown)}
    </main>
  </body>
</html>
`;

const readHistory = () => {
  try {
    const raw = window.localStorage.getItem(historyKey);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeHistory = () => {
  window.localStorage.setItem(historyKey, JSON.stringify(state.history.slice(0, maxHistoryItems)));
};

const renderHistory = () => {
  const container = $('#history-list');
  if (!state.history.length) {
    container.innerHTML = '<div class="empty">还没有历史任务。每次处理成功后会自动记录到本地浏览器。</div>';
    return;
  }

  container.innerHTML = state.history
    .map(
      (item, index) => `
        <article class="history-card">
          <div>
            <div class="history-title">${escapeHtml(item.articleTitle || item.url || `任务 ${index + 1}`)}</div>
            <div class="history-meta">${escapeHtml(item.url || '')}</div>
            <div class="history-meta">${escapeHtml(item.timeLabel || '')}</div>
          </div>
          <div class="button-row compact-row">
            <button class="button secondary history-load" data-index="${index}" type="button">载入结果</button>
            <a class="button secondary" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer">打开原文</a>
          </div>
        </article>
      `,
    )
    .join('');

  container.querySelectorAll('.history-load').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.history[Number(button.dataset.index)];
      if (!item) return;
      $('#url-input').value = item.url || '';
      $('#prompt-input').value = item.prompt || defaultPrompt;
      renderResult(item.payload || {});
      setStatus('已从历史任务载入结果。', 'success');
    });
  });
};

const saveHistoryItem = (payload, url, prompt) => {
  const article = payload.article || {};
  const item = {
    url,
    prompt,
    articleTitle: article.title || '',
    time: new Date().toISOString(),
    timeLabel: new Date().toLocaleString('zh-CN'),
    payload,
  };
  state.history = [item, ...state.history.filter((entry) => entry.url !== url)].slice(0, maxHistoryItems);
  writeHistory();
  renderHistory();
};

const renderImages = (images = []) => {
  const container = $('#image-list');
  const successful = images.filter((item) => item.hosted_url || item.upload_error);
  if (!successful.length) {
    container.innerHTML = '<div class="empty">处理完成后，这里会显示已上传图片和失败原因。</div>';
    return;
  }
  container.innerHTML = successful
    .map((image, index) => {
      const preview = image.hosted_url || image.url || '';
      return `
        <article class="image-card">
          <img src="${escapeHtml(preview)}" alt="${escapeHtml(image.alt || `图片 ${index + 1}`)}" loading="lazy" />
          <div class="body">
            <div class="title">${escapeHtml(image.alt || `图片 ${index + 1}`)}</div>
            ${image.hosted_url ? `<a class="button secondary" href="${escapeHtml(image.hosted_url)}" target="_blank" rel="noreferrer">打开图床图</a>` : `<div class="muted">上传失败：${escapeHtml(image.upload_error || '未知错误')}</div>`}
          </div>
        </article>
      `;
    })
    .join('');
};

const renderResult = (payload) => {
  state.result = payload;
  revokeDownloads();

  const article = payload.article || {};
  const summary = payload.summary || {};
  const warnings = payload.warnings || [];
  const polishedMarkdown = payload.polished_markdown || '';
  const hostedMarkdown = payload.hosted_markdown || '';
  const effectiveMarkdown = polishedMarkdown || hostedMarkdown || payload.raw_markdown || '';

  state.polishedBlobUrl = makeDownload(polishedMarkdown, 'text/markdown;charset=utf-8');
  state.hostedBlobUrl = makeDownload(hostedMarkdown, 'text/markdown;charset=utf-8');
  state.htmlBlobUrl = makeDownload(buildHtmlDocument(article.title || 'article', effectiveMarkdown), 'text/html;charset=utf-8');

  $('#article-title').textContent = article.title || '未命名文章';
  $('#article-meta').innerHTML = [
    `公众号：${article.account_name || '未知'}`,
    `作者：${article.author || '未知'}`,
    `发布时间：${article.publish_time || '未知'}`,
  ].map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  $('#article-stats').innerHTML = [
    `${summary.imageCount || 0} 张图片`,
    `${summary.uploadedImageCount || 0} 张已上传图床`,
    polishedMarkdown ? '已生成润色稿' : '未生成润色稿',
  ].map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  $('#summary-box').innerHTML = `
    <p><strong>摘要：</strong>${escapeHtml(article.summary || '无')}</p>
    <p><strong>原文：</strong><a href="${escapeHtml(article.url || '#')}" target="_blank" rel="noreferrer">${escapeHtml(article.url || '未提供')}</a></p>
    ${warnings.length ? `<p><strong>警告：</strong><br />${warnings.map((item) => escapeHtml(item)).join('<br />')}</p>` : '<p><strong>警告：</strong>无</p>'}
  `;

  $('#polished-box').className = 'markdown-box';
  $('#hosted-box').className = 'markdown-box';
  $('#polished-box').textContent = polishedMarkdown || '当前没有润色稿。请检查 LLM 配置是否已填写。';
  $('#hosted-box').textContent = hostedMarkdown || '当前没有图床版 Markdown。请检查图床配置是否已填写。';
  renderImages(payload.uploaded_images || []);
};

const triggerDownload = (blobUrl, filename) => {
  if (!blobUrl) {
    setStatus('当前没有可下载的内容。', 'error');
    return;
  }
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
};

const copyPolished = async () => {
  const content = state.result?.polished_markdown || state.result?.hosted_markdown || state.result?.raw_markdown || '';
  if (!content) {
    setStatus('当前没有可复制的成稿内容。', 'error');
    return;
  }
  await navigator.clipboard.writeText(content);
  setStatus('成稿 Markdown 已复制到剪贴板。', 'success');
};

const getSettingsFromForm = () => ({
  apiBase: $('#setting-api-base').value.trim(),
  llmBaseUrl: $('#setting-llm-base-url').value.trim(),
  llmModel: $('#setting-llm-model').value.trim(),
  llmSystemPrompt: $('#setting-llm-system-prompt').value.trim(),
  imageUploadUrl: $('#setting-image-upload-url').value.trim(),
  imageMethod: $('#setting-image-method').value.trim() || 'POST',
  imageField: $('#setting-image-field').value.trim() || 'file',
  imageResponsePath: $('#setting-image-response-path').value.trim(),
  imageUrlPrefix: $('#setting-image-url-prefix').value.trim(),
  imageHeaders: $('#setting-image-headers').value.trim() || '{}',
  imageFormFields: $('#setting-image-form-fields').value.trim() || '{}',
});

const fillSettingsForm = (settings) => {
  $('#setting-api-base').value = settings.apiBase || '';
  $('#setting-llm-base-url').value = settings.llmBaseUrl || '';
  $('#setting-llm-model').value = settings.llmModel || '';
  $('#setting-llm-system-prompt').value = settings.llmSystemPrompt || '';
  $('#setting-image-upload-url').value = settings.imageUploadUrl || '';
  $('#setting-image-method').value = settings.imageMethod || 'POST';
  $('#setting-image-field').value = settings.imageField || 'file';
  $('#setting-image-response-path').value = settings.imageResponsePath || '0.src';
  $('#setting-image-url-prefix').value = settings.imageUrlPrefix || '';
  $('#setting-image-headers').value = settings.imageHeaders || '{}';
  $('#setting-image-form-fields').value = settings.imageFormFields || '{}';
};

const saveSettings = () => {
  const settings = getSettingsFromForm();
  JSON.parse(settings.imageHeaders || '{}');
  JSON.parse(settings.imageFormFields || '{}');
  state.settings = { ...defaultSettings, ...settings };
  window.localStorage.setItem(settingsKey, JSON.stringify(state.settings));
  setApiNote();
  setStatus('前端配置已保存到当前浏览器。', 'success');
};

const resetSettings = () => {
  state.settings = { ...defaultSettings };
  window.localStorage.removeItem(settingsKey);
  fillSettingsForm(state.settings);
  setApiNote();
  setStatus('前端配置已恢复默认。', 'success');
};

const buildRuntimeConfig = () => ({
  llm: {
    baseUrl: state.settings.llmBaseUrl,
    model: state.settings.llmModel,
    systemPrompt: state.settings.llmSystemPrompt,
  },
  imageHost: {
    uploadUrl: state.settings.imageUploadUrl,
    method: state.settings.imageMethod,
    fileField: state.settings.imageField,
    headers: state.settings.imageHeaders,
    formFields: state.settings.imageFormFields,
    responseUrlPath: state.settings.imageResponsePath,
    urlPrefix: state.settings.imageUrlPrefix,
  },
});

const runProcess = async () => {
  const url = normalizeUrl($('#url-input').value);
  const prompt = $('#prompt-input').value.trim() || defaultPrompt;
  const apiBase = getApiBase();
  if (!url) throw new Error('请先输入公众号文章链接。');
  if (!apiBase) throw new Error('当前页面没有可用 API 地址。');

  setStatus('正在处理：提取正文、下载图片、上传图床、润色成稿。这一步可能需要几十秒...', '');
  const payload = await fetchJson(`${apiBase}/api/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, prompt, runtimeConfig: buildRuntimeConfig() }),
  });
  if (!payload.ok || !payload.data) {
    throw new Error(payload.error || '处理失败。');
  }
  renderResult(payload.data);
  saveHistoryItem(payload.data, url, prompt);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('url', url);
  if (getSearch().get('api')) nextUrl.searchParams.set('api', getSearch().get('api'));
  window.history.replaceState({}, '', nextUrl);
  setStatus('处理完成，页面已展示最终结果。', 'success');
};

const bindEvents = () => {
  $('#prompt-input').value = defaultPrompt;
  $('#run-button').addEventListener('click', async () => {
    try {
      await runProcess();
    } catch (error) {
      setStatus(error.message || String(error), 'error');
    }
  });
  $('#download-polished').addEventListener('click', () => {
    triggerDownload(state.polishedBlobUrl, 'article.polished.md');
  });
  $('#download-hosted').addEventListener('click', () => {
    triggerDownload(state.hostedBlobUrl, 'article.hosted-images.md');
  });
  $('#copy-polished').addEventListener('click', async () => {
    try {
      await copyPolished();
    } catch (error) {
      setStatus(error.message || String(error), 'error');
    }
  });
  $('#download-html').addEventListener('click', () => {
    triggerDownload(state.htmlBlobUrl, 'article.html');
  });
  $('#save-settings').addEventListener('click', () => {
    try {
      saveSettings();
    } catch (error) {
      setStatus(`前端配置保存失败：${error.message || String(error)}`, 'error');
    }
  });
  $('#reset-settings').addEventListener('click', () => {
    resetSettings();
  });
};

const initFromSearch = async () => {
  const url = getSearch().get('url');
  if (!url) return;
  $('#url-input').value = url;
};

state.settings = readSettings();
state.history = readHistory();
bindEvents();
fillSettingsForm(state.settings);
setApiNote();
renderImages();
renderHistory();
initFromSearch();
window.addEventListener('beforeunload', revokeDownloads);
