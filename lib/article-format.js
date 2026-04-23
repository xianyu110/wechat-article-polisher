const normalizeText = (value = '') => String(value || '').trim();

export const DEFAULT_POLISH_PROMPT = '帮我润色一下，重点字加粗，图片不要省略，重点字加粗，可列表格';

export function buildArticleMarkdown(article, options = {}) {
  const imageUrlMap = options.imageUrlMap || new Map();
  const images = Array.isArray(article.images) ? article.images : [];
  const videos = Array.isArray(article.videos) ? article.videos : [];

  const lines = [
    `# ${article.title || '未命名文章'}`,
    '',
    `- 公众号：${article.account_name || ''}`,
    `- 作者：${article.author || ''}`,
    `- 发布时间：${article.publish_time || ''}`,
    `- 原文链接：${article.url || ''}`,
    '',
    '## 摘要',
    '',
    normalizeText(article.summary) || '无',
    '',
    '## 正文',
    '',
    normalizeText(article.content_text) || '无正文',
    '',
  ];

  if (images.length) {
    lines.push('## 正文配图', '');
    for (const [index, image] of images.entries()) {
      const imageUrl = imageUrlMap.get(image.url) || image.hosted_url || image.url;
      lines.push(`### 图片 ${String(index + 1).padStart(2, '0')}`, '');
      lines.push(`![${image.alt || `正文图片 ${index + 1}`}](${imageUrl})`, '');
      lines.push(`- 原图：${image.url}`, '');
      if (image.hosted_url) lines.push(`- 图床：${image.hosted_url}`, '');
    }
  }

  if (videos.length) {
    lines.push('## 视频链接', '');
    for (const [index, video] of videos.entries()) {
      lines.push(`${index + 1}. ${video.url}`, '');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function buildPolishInput(article, markdown, prompt = DEFAULT_POLISH_PROMPT) {
  return [
    prompt,
    '',
    '请直接输出可发布的 Markdown 成稿，要求：',
    '1. 保留并展示文中图片，不要省略图片。',
    '2. 重要信息、关键词、结论请用加粗突出。',
    '3. 如果适合，可补充项目符号列表或表格，但不要编造原文没有的数据。',
    '4. 保留文章核心事实，不要虚构来源、作者、时间。',
    '5. 输出中不要解释你的修改过程，只给最终成稿。',
    '',
    '下面是原始文章 Markdown：',
    '',
    markdown,
    '',
    '补充元信息：',
    `- 标题：${article.title || ''}`,
    `- 公众号：${article.account_name || ''}`,
    `- 作者：${article.author || ''}`,
    `- 发布时间：${article.publish_time || ''}`,
    `- 原文链接：${article.url || ''}`,
    '',
  ].join('\n');
}
