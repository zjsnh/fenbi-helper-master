# 错题助手 工程约定与规则

> 本文件为项目工程规则的主版本，纳入 Git 版本管理。TRAE IDE memory 目录下的 project_memory.md 为系统自动加载副本，内容需与本文件保持一致。

## Git 推送规则
- **每次推送前必须更新 README.md**：新增/修改功能后，需同步更新 README.md 中对应的功能特性、路由表、历史更新等章节，再执行 git commit + push
- 推送时优先更新「历史更新」章节，按日期追加本次变更摘要
- 若涉及新路由，同步更新「主要路由」表
- 若涉及新文件/目录变更，同步更新「目录结构」章节

## 工程文件上下文维护规则（主动执行）
- **根目录整洁**：项目根目录只允许存在工程级配置文件（package.json、Dockerfile、.gitignore、README.md、api-reference.md、CSV 数据源等），所有代码、脚本、测试文件必须放在 `src/` 或其子目录下，禁止在根目录散落 `.js` / `.py` / `.sh` 等文件
- **临时文件即用即删**：调试或测试用的临时脚本（如 test_*.js、test_*.py、debug_*.js）使用完毕后必须立即删除，不得遗留磁盘；已被 .gitignore 忽略不代表可以保留
- **每次任务结束前自检**：完成编码任务后，主动检查根目录是否产生新文件（用 LS 或 git status），发现散落文件立即归位或删除
- **静态资源归位**：图片、SVG、CSS 等静态资源统一放 `src/views/` 下，根目录不保留副本
- **新增文件先规划路径**：创建新文件前先确定其归属目录（service/util/views），避免随手丢在根目录
- **.gitignore 同步更新**：发现新的临时文件模式时，主动补充 .gitignore 规则防止误提交

## 技术约定（沿用）
- 练习记录 cursor 分页全量拉取，按 id 去重
- 词语统计：成语 4 字全部统计，普通词 count > 2 才展示
- 错题判定用 `!q.correct`（避免 falsy 漏判）
- 多选题识别正则 `/多(选|项)/`（前端、后端、quizLoader 三处一致）
- Koa-router 静态路径必须在参数路径之前注册
- 动态页面禁用浏览器缓存（Cache-Control: no-store）
- 页面返回通过 `?from=` + 白名单校验，防开放重定向

## 项目结构要点
- 后端入口：`src/app.js`（Koa + 路由）
- PDF 生成器：`src/util/pdfGenerator.js`（错题本、题套、当日错题共用）
- 本地题库加载：`src/util/quizLoader.js`（xlsx/apkg → 内存）
- 视图目录：`src/views/*.ejs`（cache: false）
- 上传题库：`uploaded-quizzes/`（已 gitignore，配置持久化到 config.json）
- 缓存目录：`cache/`（已 gitignore，含敏感数据）

## 已知偏好（用户级）
- 数据展示：词级统计而非选项字母统计，展示全部词无阈值，仅显示错选词
- 导航：二级导航 tab 分离内容，可点击跳转
- 文件上传：保留原始文件夹名，不自动重命名
- UI/UX：偏好视觉重构，不满意现有设计

## 最近变更
- 2026-07-06：项目更名为「错题助手」；本地题库题套新增 PDF 导出（/api/quiz/export-set-pdf），带解析文件名追加「（解析）」；修正原 /api/quiz/export-pdf 单选答案字母转换
- 2026-07-06：题库图片支持——新增 `/quiz-img/:source/*` 静态路由服务 `local-quiz-bank/:source/*` 本地图片；quizLoader 新增 `解析图片URL` 字段解析（题干图 `图片URL` + 解析图 `解析图片URL`，多图用 `|` 分隔）；quiz-play.ejs / quiz-result.ejs 渲染题干图与解析图（相对路径自动转 `/quiz-img/` URL）；404 中间件对 `/api/` 路径返回 JSON `{code:404, message:'接口不存在'}` 而非重定向 HTML，避免前端 JSON.parse 失败
- 2026-07-06：题库公式渲染——引入 KaTeX 0.16.9 渲染题干、选项、解析中的 LaTeX 公式；资源本地化到 `src/views/js/katex/`（含 CSS、JS、auto-render、60 个 woff2 字体），通过 `/js/katex/katex.min.css` 等路径引用，无网络依赖；quiz-play.ejs 在 renderQuestion() 中调用 renderMathInElement(card)（含异步加载后补渲染）；quiz-result.ejs 在页面加载后调用 renderMathInElement(document.body)；exerciseResult.ejs / question.ejs（粉笔练习详情页）同步引入 KaTeX；支持 `$...$` 行内、`$$...$$` 块级、`\(\)`、`\[]` 四种分隔符；throwOnError: false 避免错误中断；**关键修复**：4 个模板补全 `<!DOCTYPE html>` 声明，否则浏览器进入 quirks mode 导致 KaTeX 拒绝渲染
