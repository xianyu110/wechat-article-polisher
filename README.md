# WeChat Article Polisher

一个独立的自动化仓库：输入微信公众号文章链接，自动完成这条链路：

1. 提取文章标题、作者、摘要、正文、图片
2. 下载正文图片到本地目录
3. 上传图片到自定义图床
4. 用指定提示词调用 OpenAI 兼容模型生成润色后的 Markdown 成稿

默认润色提示词：

> 帮我润色一下，重点字加粗，图片不要省略，重点字加粗，可列表格

## 适合什么场景

- 想把公众号原文快速整理成二次分发稿
- 想把图片统一迁移到自己的图床
- 想把文章自动变成可发布的 Markdown
- 想接自己的 OpenAI 兼容大模型和自己的图床 API

## 输出内容

每次运行会在 `output/<文章标题slug>/` 下生成：

- `article.raw.json`：原始提取结果
- `article.raw.md`：带原图链接的 Markdown
- `images/`：下载到本地的正文图片
- `article.hosted-images.json`：上传图床后的图片映射结果
- `article.hosted-images.md`：把图片地址替换成图床地址后的 Markdown
- `article.polished.md`：润色后的最终 Markdown 成稿
- `article.polish-response.json`：大模型原始返回
- `run-summary.json`：本次运行摘要

## 快速开始

```bash
npm install
cp .env.example .env
node ./scripts/process-wechat.js "https://mp.weixin.qq.com/s/你的文章ID"
```

## 环境变量

### 1) OpenAI 兼容模型

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=你的密钥
LLM_MODEL=gpt-4.1-mini
```

只要你的服务兼容 `POST /chat/completions`，就可以替换 `LLM_BASE_URL` 和 `LLM_MODEL`。

### 2) 自定义图床

这个仓库不写死任何图床厂商，用“上传地址 + 表单字段 + 响应 JSON 路径”来适配。

```env
IMAGE_HOST_UPLOAD_URL=https://your-image-host.example/upload
IMAGE_HOST_METHOD=POST
IMAGE_HOST_FILE_FIELD=file
IMAGE_HOST_HEADERS_JSON={"Authorization":"Bearer YOUR_TOKEN"}
IMAGE_HOST_FORM_FIELDS_JSON={"album":"wechat"}
IMAGE_HOST_RESPONSE_URL_PATH=data.url
```

含义：

- `IMAGE_HOST_UPLOAD_URL`：上传 API 地址
- `IMAGE_HOST_FILE_FIELD`：文件字段名，很多图床是 `file` 或 `image`
- `IMAGE_HOST_HEADERS_JSON`：额外请求头，JSON 格式
- `IMAGE_HOST_FORM_FIELDS_JSON`：额外表单字段，JSON 格式
- `IMAGE_HOST_RESPONSE_URL_PATH`：上传成功后，图片 URL 在响应 JSON 里的路径，例如 `data.url`

如果你的图床返回里还带业务成功标记，可以再加：

```env
IMAGE_HOST_SUCCESS_PATH=success
IMAGE_HOST_SUCCESS_VALUE=true
```

## 命令行选项

```bash
node ./scripts/process-wechat.js "https://mp.weixin.qq.com/s/xxx" \
  --out-dir ./output \
  --prompt "帮我润色一下，重点字加粗，图片不要省略，重点字加粗，可列表格"
```

常用选项：

- `--skip-upload`：跳过图床上传，只下载图片
- `--skip-polish`：跳过润色，只做提取 + 下载 + 图床上传
- `--prompt`：覆盖默认润色提示词

## 工作流说明

1. 用 Playwright 打开公众号文章页，提取正文和媒体
2. 将正文图片下载到本地
3. 如果配置了图床，就逐张上传并记录映射
4. 用图床后的 Markdown 作为输入，调用 OpenAI 兼容模型润色
5. 输出最终可发布 Markdown

## 注意事项

- 这个仓库不会保存你的密钥到代码里，请使用 `.env`
- 公众号文章页结构经常变化，如果某篇文章提取异常，可以稍后重试
- 默认只下载并上传图片；视频未纳入这条润色链路
- 如果本机没有可用 Chrome，可能需要执行 `npx playwright install chromium`
