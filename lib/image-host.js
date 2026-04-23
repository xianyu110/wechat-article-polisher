import fs from 'node:fs/promises';
import path from 'node:path';

function parseJsonEnv(name, fallback = {}) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} 不是合法 JSON: ${error.message}`);
  }
}

function getByPath(input, dotPath) {
  if (!dotPath) return undefined;
  return dotPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), input);
}

function joinUrlPrefix(prefix, value) {
  if (!prefix || !value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  const normalizedPrefix = String(prefix).replace(/\/+$/, '');
  const normalizedValue = String(value).replace(/^\/+/, '');
  return `${normalizedPrefix}/${normalizedValue}`;
}

function inferMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function tryFindUrl(payload) {
  const candidates = [
    payload?.url,
    payload?.data?.url,
    payload?.result?.url,
    payload?.data?.data?.url,
    payload?.data?.links?.url,
    payload?.image?.url,
  ];
  return candidates.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
}

export function loadImageHostConfigFromEnv() {
  if (!process.env.IMAGE_HOST_UPLOAD_URL) return null;
  return {
    uploadUrl: process.env.IMAGE_HOST_UPLOAD_URL,
    method: process.env.IMAGE_HOST_METHOD || 'POST',
    fileField: process.env.IMAGE_HOST_FILE_FIELD || 'file',
    headers: parseJsonEnv('IMAGE_HOST_HEADERS_JSON'),
    formFields: parseJsonEnv('IMAGE_HOST_FORM_FIELDS_JSON'),
    responseUrlPath: process.env.IMAGE_HOST_RESPONSE_URL_PATH || '',
    urlPrefix: process.env.IMAGE_HOST_URL_PREFIX || '',
    successPath: process.env.IMAGE_HOST_SUCCESS_PATH || '',
    successValue: process.env.IMAGE_HOST_SUCCESS_VALUE || '',
  };
}

export async function uploadImageToHost(filePath, config) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  for (const [key, value] of Object.entries(config.formFields || {})) {
    form.append(key, String(value));
  }
  form.append(config.fileField, new Blob([buffer], { type: inferMimeType(filePath) }), path.basename(filePath));

  const response = await fetch(config.uploadUrl, {
    method: config.method,
    headers: config.headers,
    body: form,
  });

  const rawText = await response.text();
  let payload = rawText;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(`图床上传失败: HTTP ${response.status} ${rawText.slice(0, 200)}`);
  }

  if (config.successPath) {
    const actual = getByPath(payload, config.successPath);
    if (String(actual) !== String(config.successValue)) {
      throw new Error(`图床返回成功标记不匹配: ${config.successPath}=${actual}`);
    }
  }

  const rawHostedUrl = getByPath(payload, config.responseUrlPath) || tryFindUrl(payload);
  const hostedUrl = joinUrlPrefix(config.urlPrefix, rawHostedUrl);
  if (!hostedUrl || !/^https?:\/\//i.test(hostedUrl)) {
    throw new Error(`图床返回里没找到可用图片地址: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  return {
    hostedUrl,
    payload,
  };
}

export async function uploadImagesToHost(images, config) {
  const uploaded = [];
  for (const image of images) {
    if (!image.local_path) {
      uploaded.push({ ...image, upload_error: 'missing local_path' });
      continue;
    }
    try {
      const result = await uploadImageToHost(image.local_path, config);
      uploaded.push({
        ...image,
        hosted_url: result.hostedUrl,
        upload_response: result.payload,
      });
    } catch (error) {
      uploaded.push({
        ...image,
        upload_error: error.message || String(error),
      });
    }
  }
  return uploaded;
}
