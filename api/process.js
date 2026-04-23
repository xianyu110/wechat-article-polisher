import 'dotenv/config';
import { DEFAULT_POLISH_PROMPT } from '../lib/article-format.js';
import { processWeChatArticle } from '../lib/pipeline.js';

export const config = {
  maxDuration: 300,
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body || {};
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).end(JSON.stringify({ ok: false, error: 'Method not allowed.' }));
    return;
  }

  try {
    const body = parseBody(req);
    const url = String(body.url || '').trim();
    if (!url) {
      res.status(400).end(JSON.stringify({ ok: false, error: 'Missing url parameter.' }));
      return;
    }

    const result = await processWeChatArticle({
      url,
      prompt: String(body.prompt || DEFAULT_POLISH_PROMPT).trim() || DEFAULT_POLISH_PROMPT,
      skipUpload: Boolean(body.skipUpload),
      skipPolish: Boolean(body.skipPolish),
    });

    res.status(200).end(
      JSON.stringify({
        ok: true,
        data: {
          article: result.article,
          summary: result.summary,
          warnings: result.warnings,
          raw_markdown: result.rawMarkdown,
          hosted_markdown: result.hostedMarkdown,
          polished_markdown: result.polishedMarkdown || '',
          uploaded_images: result.uploadedImages,
        },
      }),
    );
  } catch (error) {
    res.status(500).end(JSON.stringify({ ok: false, error: error.message || String(error) }));
  }
}
