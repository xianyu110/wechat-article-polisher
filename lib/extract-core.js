import fs from 'node:fs/promises';
import path from 'node:path';

export function ensureWeChatUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'mp.weixin.qq.com') {
      throw new Error('Only mp.weixin.qq.com article URLs are supported.');
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid WeChat article URL: ${url}`);
  }
}

export function slugify(input) {
  return String(input || 'article')
    .normalize('NFKD')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'article';
}

export function buildMarkdown(data) {
  const lines = [
    `# ${data.title || '未命名文章'}`,
    '',
    `- 公众号：${data.account_name || ''}`,
    `- 作者：${data.author || ''}`,
    `- 发布时间：${data.publish_time || ''}`,
    `- 原文链接：${data.url || ''}`,
    '',
    '## 摘要',
    '',
    data.summary || '无',
    '',
    '## 正文',
    '',
    data.content_text || '',
    '',
    '## 图片',
    '',
    ...(data.images || []).map((image, index) => `${index + 1}. ${image.url}`),
    '',
    '## 视频',
    '',
    ...(data.videos || []).map((video, index) => `${index + 1}. ${video.url}`),
    '',
  ];
  return lines.join('\n');
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveLocalExecutable() {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (await fileExists(macChrome)) return macChrome;
  return undefined;
}

export async function extractArticle(page) {
  return page.evaluate(() => {
    const norm = (value) => (typeof value === 'string' ? value.trim() : '');
    const isHttp = (value) => /^https?:\/\//i.test(value || '');
    const isDataUrl = (value) => /^data:/i.test(value || '');
    const pickImageUrl = (img) => {
      const candidates = [
        img.getAttribute('data-src'),
        img.dataset?.src,
        img.currentSrc,
        img.getAttribute('src'),
      ].map(norm);
      return candidates.find((value) => value && !isDataUrl(value) && isHttp(value)) || '';
    };
    const contentRoot =
      document.querySelector('#js_content') ||
      document.querySelector('.rich_media_content') ||
      document.querySelector('article') ||
      document.body;

    const title =
      norm(document.querySelector('#activity-name')?.textContent) ||
      norm(document.querySelector('h1')?.textContent) ||
      norm(document.title);
    const accountName =
      norm(document.querySelector('#js_name')?.textContent) ||
      norm(document.querySelector('.wx_follow_nickname')?.textContent) ||
      norm(document.querySelector('.account_nickname_inner')?.textContent);
    const author =
      norm(document.querySelector('#js_author_name')?.textContent) ||
      norm(document.querySelector('.rich_media_meta_text')?.textContent);
    const publishTime =
      norm(document.querySelector('#publish_time')?.textContent) ||
      norm(document.querySelector('.publish_time')?.textContent);
    const summary = norm(document.querySelector('meta[name="description"]')?.getAttribute('content'));
    const coverImage = norm(document.querySelector('meta[property="og:image"]')?.getAttribute('content'));

    const images = Array.from(contentRoot.querySelectorAll('img'))
      .map((img) => ({ url: pickImageUrl(img), alt: norm(img.getAttribute('alt')) }))
      .filter((item) => item.url)
      .filter((item, index, list) => list.findIndex((entry) => entry.url === item.url) === index);

    const videos = Array.from(contentRoot.querySelectorAll('video, iframe'))
      .map((node) => {
        if (node.tagName === 'VIDEO') {
          return {
            url: norm(node.getAttribute('src')) || norm(node.querySelector('source')?.getAttribute('src')) || '',
            poster: norm(node.getAttribute('poster')),
          };
        }
        const src = norm(node.getAttribute('src'));
        if (!src || /open\.weixin\.qq\.com\/pcopensdk\/frame/i.test(src)) return null;
        return { url: src, poster: '' };
      })
      .filter(Boolean)
      .filter((item) => item.url)
      .filter((item, index, list) => list.findIndex((entry) => entry.url === item.url) === index);

    return {
      title,
      account_name: accountName,
      author,
      publish_time: publishTime,
      summary,
      content_text: norm(contentRoot.innerText || ''),
      content_html: contentRoot.innerHTML || '',
      cover_image: coverImage,
      images,
      videos,
    };
  });
}

export async function extractFromUrl({
  url,
  waitMs = 3500,
  launchBrowser,
  contextOptions = {},
}) {
  const normalizedUrl = ensureWeChatUrl(url);
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({
      locale: 'zh-CN',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      viewport: { width: 1440, height: 2200 },
      ...contextOptions,
    });
    const page = await context.newPage();
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(waitMs);

    return {
      url: normalizedUrl,
      fetched_at: new Date().toISOString(),
      ...(await extractArticle(page)),
    };
  } finally {
    await browser.close();
  }
}

export function buildDownloadPlan(items, kind) {
  return items.map((item, index) => {
    const source = new URL(item.url);
    const extFromPath = path.extname(source.pathname).replace('.', '') || (kind === 'images' ? 'jpg' : 'mp4');
    return {
      ...item,
      filename: `${String(index + 1).padStart(2, '0')}.${extFromPath.toLowerCase()}`,
    };
  });
}

export async function downloadAssets(items, targetDir) {
  await ensureDir(targetDir);
  const downloaded = [];
  for (const item of items) {
    const response = await fetch(item.url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: 'https://mp.weixin.qq.com/',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to download ${item.url}: HTTP ${response.status}`);
    }
    const filePath = path.join(targetDir, item.filename);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    downloaded.push({ ...item, local_path: filePath });
  }
  return downloaded;
}

export async function persistExtractedArticle({
  data,
  outDir,
  pageDataDir,
  formats = ['json', 'md'],
  downloadImages = false,
  downloadVideos = false,
}) {
  const slug = slugify(data.title);
  const articleDir = path.join(outDir, slug);
  await ensureDir(articleDir);

  const effectiveData = { ...data };
  if (downloadImages && effectiveData.images?.length) {
    effectiveData.images = await downloadAssets(buildDownloadPlan(effectiveData.images, 'images'), path.join(articleDir, 'images'));
  }
  if (downloadVideos && effectiveData.videos?.length) {
    effectiveData.videos = await downloadAssets(buildDownloadPlan(effectiveData.videos, 'videos'), path.join(articleDir, 'videos'));
  }

  const jsonPath = path.join(articleDir, 'article.json');
  const markdownPath = path.join(articleDir, 'article.md');

  if (formats.includes('json')) {
    await writeFile(jsonPath, `${JSON.stringify(effectiveData, null, 2)}\n`);
    if (pageDataDir) {
      await writeFile(path.join(pageDataDir, 'article.json'), `${JSON.stringify(effectiveData, null, 2)}\n`);
    }
  }
  if (formats.includes('md')) {
    const markdown = buildMarkdown(effectiveData);
    await writeFile(markdownPath, `${markdown}\n`);
    if (pageDataDir) {
      await writeFile(path.join(pageDataDir, 'article.md'), `${markdown}\n`);
    }
  }

  return {
    data: effectiveData,
    articleDir,
    jsonPath: formats.includes('json') ? jsonPath : null,
    markdownPath: formats.includes('md') ? markdownPath : null,
  };
}
