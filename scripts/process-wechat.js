#!/usr/bin/env node
import 'dotenv/config';
import path from 'node:path';
import { processWeChatArticle } from '../lib/pipeline.js';
import { DEFAULT_POLISH_PROMPT } from '../lib/article-format.js';

function printHelp() {
  console.log(`
用法：
  wechat-article-polisher <公众号文章URL> [选项]

选项：
  --out-dir <dir>       输出目录，默认 ./output
  --prompt <text>       自定义润色提示词
  --skip-upload         只下载图片，不上传图床
  --skip-polish         不调用大模型润色
  --help                查看帮助

默认润色提示词：
  ${DEFAULT_POLISH_PROMPT}
`);
}

function parseArgs(argv) {
  const args = {
    url: '',
    outDir: path.resolve('output'),
    prompt: DEFAULT_POLISH_PROMPT,
    skipUpload: false,
    skipPolish: false,
  };

  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift();
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--out-dir') {
      args.outDir = path.resolve(rest.shift() || 'output');
      continue;
    }
    if (token === '--prompt') {
      args.prompt = rest.shift() || DEFAULT_POLISH_PROMPT;
      continue;
    }
    if (token === '--skip-upload') {
      args.skipUpload = true;
      continue;
    }
    if (token === '--skip-polish') {
      args.skipPolish = true;
      continue;
    }
    if (!args.url) {
      args.url = token;
      continue;
    }
    throw new Error(`不认识的参数：${token}`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  console.log(`开始处理：${args.url}`);
  const result = await processWeChatArticle(args);
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.warnings.length) {
    console.error('\n警告：');
    for (const warning of result.warnings) {
      console.error(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
