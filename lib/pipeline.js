import path from 'node:path';
import { chromium } from 'playwright';
import {
  buildDownloadPlan,
  downloadAssets,
  ensureDir,
  extractFromUrl,
  resolveLocalExecutable,
  slugify,
  writeFile,
} from './extract-core.js';
import { buildArticleMarkdown, buildPolishInput, DEFAULT_POLISH_PROMPT } from './article-format.js';
import { loadImageHostConfigFromEnv, uploadImagesToHost } from './image-host.js';
import { loadLlmConfigFromEnv, polishMarkdown } from './llm.js';

async function launchBrowser() {
  const executablePath = await resolveLocalExecutable();
  const options = executablePath ? { headless: true, executablePath } : { headless: true };
  return chromium.launch(options);
}

export async function processWeChatArticle({
  url,
  outDir = path.resolve('output'),
  prompt = DEFAULT_POLISH_PROMPT,
  skipUpload = false,
  skipPolish = false,
}) {
  const article = await extractFromUrl({
    url,
    waitMs: 3500,
    launchBrowser,
  });

  const articleDir = path.join(outDir, slugify(article.title || 'article'));
  const imagesDir = path.join(articleDir, 'images');
  await ensureDir(articleDir);

  const rawMarkdown = buildArticleMarkdown(article);
  await writeFile(path.join(articleDir, 'article.raw.json'), `${JSON.stringify(article, null, 2)}\n`);
  await writeFile(path.join(articleDir, 'article.raw.md'), rawMarkdown);

  let downloadedImages = [];
  if (Array.isArray(article.images) && article.images.length) {
    downloadedImages = await downloadAssets(buildDownloadPlan(article.images, 'images'), imagesDir);
  }

  const result = {
    articleDir,
    article,
    downloadedImages,
    uploadedImages: [],
    polishedMarkdownPath: null,
    warnings: [],
  };

  const imageHostConfig = loadImageHostConfigFromEnv();
  if (!skipUpload) {
    if (!imageHostConfig) {
      result.warnings.push('未配置 IMAGE_HOST_UPLOAD_URL，已跳过图床上传。');
    } else if (!downloadedImages.length) {
      result.warnings.push('文章没有可上传的图片。');
    } else {
      result.uploadedImages = await uploadImagesToHost(downloadedImages, imageHostConfig);
      const uploadedArticle = {
        ...article,
        images: result.uploadedImages,
      };
      const imageUrlMap = new Map(
        result.uploadedImages.filter((item) => item.hosted_url).map((item) => [item.url, item.hosted_url]),
      );
      await writeFile(path.join(articleDir, 'article.hosted-images.json'), `${JSON.stringify(uploadedArticle, null, 2)}\n`);
      await writeFile(path.join(articleDir, 'article.hosted-images.md'), buildArticleMarkdown(uploadedArticle, { imageUrlMap }));
      if (result.uploadedImages.some((item) => item.upload_error)) {
        result.warnings.push('部分图片上传失败，请查看 article.hosted-images.json。');
      }
    }
  }

  if (!skipPolish) {
    const llmConfig = loadLlmConfigFromEnv();
    if (!llmConfig) {
      result.warnings.push('未配置 LLM_API_KEY，已跳过润色。');
    } else {
      const hostedMap = new Map(
        result.uploadedImages.filter((item) => item.hosted_url).map((item) => [item.url, item.hosted_url]),
      );
      const sourceMarkdown = buildArticleMarkdown(
        {
          ...article,
          images: result.uploadedImages.length ? result.uploadedImages : article.images,
        },
        { imageUrlMap: hostedMap },
      );
      const finalPrompt = buildPolishInput(article, sourceMarkdown, prompt);
      const polished = await polishMarkdown(sourceMarkdown, finalPrompt, llmConfig);
      const polishedPath = path.join(articleDir, 'article.polished.md');
      result.polishedMarkdownPath = polishedPath;
      await writeFile(polishedPath, polished.markdown);
      await writeFile(path.join(articleDir, 'article.polish-response.json'), `${JSON.stringify(polished.raw, null, 2)}\n`);
    }
  }

  const summary = {
    title: article.title,
    url: article.url,
    articleDir,
    imageCount: article.images?.length || 0,
    downloadedImageCount: downloadedImages.length,
    uploadedImageCount: result.uploadedImages.filter((item) => item.hosted_url).length,
    polishedMarkdownPath: result.polishedMarkdownPath,
    warnings: result.warnings,
  };
  await writeFile(path.join(articleDir, 'run-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  result.summary = summary;
  return result;
}
