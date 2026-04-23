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

## 网页前端模式

线上地址：

- 推荐入口（Vercel 单站点）：`https://wechat-article-polisher.vercel.app/`
- API：`https://wechat-article-polisher.vercel.app/api/process`
- GitHub Pages 仍可访问，但建议优先使用 Vercel 单站点，前端和 API 同域更稳定

注意：线上 API 只有在 Vercel 项目里配置好 `LLM_*` 和 `IMAGE_HOST_*` 环境变量后，才会完整执行“图床上传 + 润色”。如果没配环境变量，页面仍可打开，但处理结果会返回对应警告。

如果你想要一个“输入链接 -> 直接出成稿”的本地网页：

```bash
npm run dev:api
```

另开一个终端：

```bash
npm run serve:web
```

然后打开：

```text
http://localhost:4174
```

默认情况下：

- 网页前端运行在 `http://localhost:4174`
- API 运行在 `http://localhost:4314`

如果你的 API 不是这个地址，可以在页面 URL 上手动传：

```text
http://localhost:4174/?api=http://localhost:4314
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
IMAGE_HOST_URL_PREFIX=
```

含义：

- `IMAGE_HOST_UPLOAD_URL`：上传 API 地址
- `IMAGE_HOST_FILE_FIELD`：文件字段名，很多图床是 `file` 或 `image`
- `IMAGE_HOST_HEADERS_JSON`：额外请求头，JSON 格式
- `IMAGE_HOST_FORM_FIELDS_JSON`：额外表单字段，JSON 格式
- `IMAGE_HOST_RESPONSE_URL_PATH`：上传成功后，图片 URL 在响应 JSON 里的路径，例如 `data.url`
- `IMAGE_HOST_URL_PREFIX`：如果接口返回的是相对路径，就自动拼接这个前缀

如果你的图床返回里还带业务成功标记，可以再加：

```env
IMAGE_HOST_SUCCESS_PATH=success
IMAGE_HOST_SUCCESS_VALUE=true
```

### 2.1) 你当前这套 PicGo 自定义 Web 图床

按你截图里的配置，这个仓库可以直接这样写 `.env`：

```env
IMAGE_HOST_UPLOAD_URL=https://upload.maynor1024.live/upload
IMAGE_HOST_METHOD=POST
IMAGE_HOST_FILE_FIELD=file
IMAGE_HOST_HEADERS_JSON={}
IMAGE_HOST_FORM_FIELDS_JSON={}
IMAGE_HOST_RESPONSE_URL_PATH=0.src
IMAGE_HOST_URL_PREFIX=https://upload.maynor1024.live
```

对应关系是：

- API 地址：`https://upload.maynor1024.live/upload`
- POST 参数名：`file`
- JSON 路径：`0.src`
- 图片 URL 前缀：`https://upload.maynor1024.live`

也就是说，如果接口返回的是：

```json
[
  {
    "src": "/uploads/2026/04/demo.jpg"
  }
]
```

仓库会自动把它变成：

```text
https://upload.maynor1024.live/uploads/2026/04/demo.jpg
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

## 网页会返回什么

网页模式调用 `POST /api/process`，会返回：

- 提取到的文章元数据
- 原始 Markdown
- 图床替换后的 Markdown
- 润色后的最终 Markdown
- 图片上传结果和警告信息

## 前端可配置项

在线页面现在支持“前端配置”面板，配置会保存在当前浏览器的 `localStorage`，并在请求时一起发给后端。

适合放前端配置的公开参数：

- `API 地址`
- `LLM Base URL`
- `LLM Model`
- `LLM System Prompt`
- 图床上传地址 / Method / 文件字段
- 图床响应 JSON 路径
- 图床 URL 前缀
- 图床 Headers JSON / Form Fields JSON（仅限公开字段）

不要放前端配置的敏感参数：

- `LLM_API_KEY`
- 任何私密 Token / Secret / Bearer Key

这些敏感值仍然必须配置在 Vercel 服务端环境变量里。

因此网页端可以直接：

- 展示最终成稿
- 展示图床后的 Markdown
- 预览已上传图片
- 一键下载 Markdown 文件

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
