const defaultPrompt = '帮我润色一下，重点字加粗，图片不要省略，重点字加粗，可列表格';

const state = {
  result: null,
  polishedBlobUrl: '',
  hostedBlobUrl: '',
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

const getApiBase = () => {
  const queryApi = getSearch().get('api');
  if (queryApi) return normalizeUrl(queryApi).replace(/\/$/, '');
  if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) {
    return `${window.location.origin}`.replace(/4174$/, '4314');
  }
  return '';
};

const apiBase = getApiBase();

const setStatus = (message, type = '') => {
  const node = $('#status-box');
  node.textContent = message;
  node.className = `status${type ? ` ${type}` : ''}`;
};

const setApiNote = () => {
  $('#api-note').innerHTML = apiBase
    ? `当前 API：<code>${escapeHtml(apiBase)}</code>`
    : '当前页面未自动发现 API，请在 URL 上添加 `?api=http://localhost:4314`。';
};

const revokeDownloads = () => {
  if (state.polishedBlobUrl) URL.revokeObjectURL(state.polishedBlobUrl);
  if (state.hostedBlobUrl) URL.revokeObjectURL(state.hostedBlobUrl);
  state.polishedBlobUrl = '';
  state.hostedBlobUrl = '';
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

  state.polishedBlobUrl = makeDownload(polishedMarkdown, 'text/markdown;charset=utf-8');
  state.hostedBlobUrl = makeDownload(hostedMarkdown, 'text/markdown;charset=utf-8');

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

const runProcess = async () => {
  const url = normalizeUrl($('#url-input').value);
  const prompt = $('#prompt-input').value.trim() || defaultPrompt;
  if (!url) throw new Error('请先输入公众号文章链接。');
  if (!apiBase) throw new Error('当前页面没有可用 API 地址。');

  setStatus('正在处理：提取正文、下载图片、上传图床、润色成稿。这一步可能需要几十秒...', '');
  const payload = await fetchJson(`${apiBase}/api/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, prompt }),
  });
  if (!payload.ok || !payload.data) {
    throw new Error(payload.error || '处理失败。');
  }
  renderResult(payload.data);
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
};

bindEvents();
setApiNote();
renderImages();
window.addEventListener('beforeunload', revokeDownloads);
