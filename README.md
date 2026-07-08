# 错题助手（Fenbi Helper）

> **致谢**：本项目由 [YSMull/fenbi-helper](https://github.com/YSMull/fenbi-helper) 改造而来，在原项目基础上扩展了成语词典集成、词语频次统计、PDF 排版优化、页面返回逻辑等功能。感谢原作者开源贡献。

国考 / 公考备考刷题辅助工具，基于粉笔网题库 API，提供练习记录分析、错题本整理、词语频次统计、成语词典集成、PDF 错题本导出等功能。本地部署，数据缓存于本地，保护隐私。

## 功能特性

### 练习记录分析
- 自动拉取**模考/真题**、**每日演练**、**专项智能练习** 三类练习记录（cursor 分页全量获取，按 id 去重，避免跨分类重复）
- 按分类树聚合展示，支持练习报告查看
- 单题详情页提供耗时分布图、知识点标签、收藏标记、笔记、评论、讲解视频
- 题目按原始顺序展示，导航栏一键切换「全部题目 / 仅错题」
- **正确答案高亮**：选项按 `opt-correct`（绿）/ `opt-wrong`（红）自动着色，后端将 `correctAnswer` 规范化为字母字符串
- **多选导出 PDF**：每个分类模块支持勾选多个练习，一键导出错题集或未写题目为 PDF
- 热力图与分类模块展开区均支持滚动条浏览，内容超出不再截断

### 错题本
- 按知识点分类树组织错题
- 支持刷新错题本、按知识点筛选
- 错题本 PDF 导出：题号深蓝醒目、题干加粗、选项中性灰，弱化装饰突出题目本身
- 题目内可写笔记、收藏、造句查询
- **当日错题 PDF**：按日期导出当日错题，含逻辑填空词语统计页
- **按练习勾选导出/重做**：列表视图每个练习前含复选框，勾选后「导出当日错题」「重做当日错题」按钮切换为「导出所选错题 N」「重做所选错题 N」高亮态，仅针对所选练习筛选错题
- **当日错题重做**：将当日错题（可选按练习过滤）转为 quiz-play 题集，跳转做题页直接重做，提交后判分与本地题库一致

### 词语频次统计
- 全错题本逻辑填空题选项词语自动提取
- 区分**四字成语**（全部统计）与**普通词语**（出现 >2 次统计）
- 点击词语弹出关联错题面板，顶部展示词义、组主题、全局考频
- 练习详情页的「逻辑填空词语统计」基于当前练习 `wordStats` 实时累积，不依赖全错题本
- **本地缓存策略**：默认 15 天有效期，过期自动更新；支持右上角「手动更新」按钮强制刷新
- 后端 `getWordFrequency` 支持 `forceRefresh` 参数，前端展示层过滤 `count > 2`

### 错题词语关联界面
- 表格 → 可折叠卡片列表，按错误次数倒序排列
- 卡片展开后显示关联错题列表（题号、来源、我的选项 vs 正确答案、题干预览 2 行截断）
- 点击关联题目平滑滚动定位 + 高亮闪烁

### 页面返回逻辑（从哪来回哪去）
- 通过 URL 参数 `?from=源路径` 记录来源页
- 详情页返回按钮根据 `from` 跳转回来源页
- 白名单校验：仅允许跳转到 `/history-category-complex`、`/history-category`、`/history`、`/wrong-questions`、`/word-frequency`，非法值回退到默认页（防开放重定向）
- 相比 `history.back()` 或 `Referer`：刷新页面后仍能正确返回

### PDF 生成优化
- 智能选项布局：根据选项文本宽度自动决策 4 列 / 2 列 / 1 列竖排
- 文本宽度估算：中文字符 ≈ 字号，ASCII ≈ 字号 × 0.55
- 绝对定位渲染：固定 Y 坐标绘制选项行，避免字体重叠
- 行级分页检查：逐行检查是否需要分页
- 词语统计页：双列布局（词语 | 错误次数），错误次数 = 关联错题数

### 申论公文格式
- 收录 **33 个常见文种**，分三类：法定公文（15）、事务文书（13）、应用文（5）
- 三级卡片式浏览：分类卡片 → 文种卡片 → 详情面板（模态弹窗）
- 每个文种含：适用范围、格式要素标签、基本框架、结构要素、格式示意（宋体排版范例）
- 格式分类标注：完整格式（标题+称谓+正文+落款）/ 不完整格式 / 特殊格式（如简报报头报尾、编者按等）
- 顶部格式要素说明卡，统一讲解标题、主送机关、正文、落款书写规范

### 本地题库刷题
- **无内置题库**：项目不预置任何题库，所有题库均通过上传功能添加（xlsx / apkg / md），配置持久化到 `uploaded-quizzes/config.json`；启动时自动清理目录不存在的失效配置
- **做题页**：单题展示、选项点击作答（支持 4/6 选项）、顶部进度条、总计时器、上一题/下一题/题号导航点
- **多选题支持**：题型识别正则 `/多(选|项)/` 兼容"多选"、"多项选择"等变体；多选题作答不自动跳转，需手动点击下一题；判分时答案字母去重排序后比较
- **标记疑题**：每题可标记为疑题，提交时单独统计
- **键盘快捷键**：做题页支持方向键 `←` 上一题、`→` 下一题（末题时打开提交确认弹窗）；焦点在输入框/文本域时跳过，避免与输入冲突
- **自动判分**：提交后后端对照答案统计对错，生成练习记录
- **结果页**：正确率/答对/答错/未答/疑题统计卡、题目列表（对错高亮+疑题标记）、解析展开（压缩空白避免大量空行）、PDF 导出
- **同步练习记录**：做题记录自动写入 `exercise_history.json`，在列表视图和分类聚合页显示"本地题库"标签；列表视图标题显示为「一级题库名 + 题目数量」（如"【1】片段阅读600题题库 · 50题"），旧缓存通过 recordId 三级回填 source
- **同步错题本**：错题自动写入 `wrong_q_local_quiz.json`，兼容现有错题本格式
- **PDF 导出**：结果页一键导出错题+疑题为 PDF（复用 pdfGenerator）；题套列表页每行新增「导出 PDF」按钮，支持选范围、隐藏答案，带解析导出文件名追加「（解析）」
- **题目图片**：支持题干配图（imageUrl 字段）与解析配图（analysisImageUrl 字段）；xlsx 中填相对路径（如 `images/p01_q04_1.jpg`）配合题库目录下 `images/` 子目录 + 服务端 `/quiz-img/:source/*` 路由访问；多图用 `|` 分隔；绝对 URL（http/https）直接渲染
- **apkg 题库图片**：parseApkgFile 自动解压 apkg 内 `media` 映射的图片文件到题库目录 `images/` 子目录，题干/解析 HTML 中的相对路径 `src` 自动重写为 `/quiz-img/{source}/images/xxx.png` 绝对路径；`/quiz-img/:source/*` 路由依次在 `local-quiz-bank/` 和 `uploaded-quizzes/` 下查找
- **题干 HTML 渲染**：apkg 题库（如资料分析）题干含 `<div>/<b>/<br>/<img>` 等 HTML 标签，quiz-play.ejs / quiz-result.ejs 题干直接 innerHTML 渲染（不做 HTML 转义），结果页题干预览自动去标签
- **LaTeX 公式渲染**：题干、选项、解析中的 LaTeX 公式通过 KaTeX 0.16.9 渲染（资源本地化于 `src/views/js/katex/`，无 CDN 依赖）；支持 `$...$` 行内、`$$...$$` 块级、`\(...\)`、`\[...\]` 四种分隔符
- **无选项题（填空/解答题）**：通过 `q.options.length === 0` 识别；做题页不渲染选项区与标记疑题按钮，改为「▸ 显示答案」按钮 + 答案/解析面板（默认隐藏，点击展开 KaTeX 自动补渲染）；导航点用淡紫色独立样式；提交判分时无选项题跳过判分（`correct = null` 不计入对错与未答）；结果页状态显示「已查看」紫色徽章，答案行改为「参考答案：xxx」；支持 Markdown 题库（`### 第 X 题` 拆题 + `**考点**/**题目**/**答案**/**解析**` 字段提取，`## 填空题/解答题/选择题` 二级标题切换题型）

### 本地题库上传与卸载
- **上传题库**：题库列表页右上角「+ 上传题库」按钮，选择文件夹即可批量上传 xlsx / apkg / md 文件
- **保留原始文件夹名**：上传时以原始文件夹名作为磁盘存储目录名，不自动重命名、不加时间戳
- **动态加载**：上传后自动加载到题库列表，无需重启服务；配置持久化到 `uploaded-quizzes/config.json`
- **软删除/回收站**：卸载题库不再直接删除，而是移动到 `.deleted-quizzes/` 暂存 2 天，期间可在题库列表页底部「回收站」区域查看并恢复；超过 2 天自动永久删除（启动时执行清理）；回收站每项显示题库名、删除时间、剩余恢复小时数
- **卸载题库**：分类卡片 hover 显示「✕」卸载按钮，移入回收站（2 天可恢复）；手动删除文件夹后，下次启动服务时自动清理失效配置
- **启动脚本**：双击 `start.bat` 即可启动（自动检查 Node.js、首次运行 `npm install`、显示本机与局域网访问地址）
- **格式规范弹窗**：上传弹窗含详细 xlsx 表头规范（题干/选项A~F/答案/题型/解析/知识点/图片URL/题号）、apkg 字段规范（7 字段顺序固定 + `\x1f` 分隔 + `<br>` 选项格式）、md 题库规范（`### 第 X 题` 拆题 + `**考点**/**题目**/**答案**/**解析**` 字段 + `## 填空题/解答题/选择题` 二级标题切换题型）
- **标准题库生成 Skill**：项目内置 `.trae/skills/standard-quiz-builder/SKILL.md`，可在 TRAE IDE 中调用生成符合规范的 xlsx/apkg 题库

### 自定义出题
- **题套勾选**：二级界面（题套列表）每张题套卡片左侧带勾选框，支持跨分类多选
- **全选按键**：二级界面标题区右侧「全选（N）/ 取消全选」按钮，仅影响当前分类下的题套
- **设置数量**：底部操作栏可输入本次出题数量，留空则全部
- **随机抽样**：聚合所有勾选题套的题目后采用 Fisher-Yates 洗牌算法随机抽取指定数量
- **临时题集**：自定义题集以 `custom_时间戳` 为 ID 存于内存缓存，复用现有做题/判分/结果页流程

### 艾宾浩斯错题复习
- **遗忘曲线调度**：基于经典艾宾浩斯遗忘曲线 6 次复习间隔（1天 → 2天 → 4天 → 7天 → 15天 → 30天），自动安排错题复习计划
- **自动入队**：访问错题本页面时自动扫描全部错题缓存（粉笔错题 + 本地题库错题），新错题自动进入复习队列，无需手动添加
- **每日复习卡片**：错题本顶部紫色卡片展示今日待复习题数、各阶段分布条形图、已掌握题数；无复习任务时自动隐藏
- **双模式复习**：卡片提供「复习到期」（仅今日 nextReviewTime ≤ now 的题）与「立即复习全部」（队列中所有未掌握题）两种入口
- **复习规划页面**：独立路由 `/review-plan`，选定起点日期 D 后绘制未来 30 天复习量 ECharts 曲线图（D+1 / D+2 / D+4 / D+7 / D+15 / D+30 六个阶段日高亮），点击曲线节点可切换详情面板查看当日题目清单；「应用此计划」把每道未掌握题的 `nextReviewTime` 重排为 `D + INTERVALS_DAYS[stage]`，stage 保留不重置（用户已复习进度不丢失）；已掌握题自动排除
- **一键开始**：点击「开始复习 N 题」构建复习题集，跳转做题页；复用现有 quiz-play 做题/判分/结果页流程
- **复习状态自动更新**：提交复习题集后（`custom_review_` 前缀），自动按判分结果更新每题复习阶段——答对进入下一阶段，答错重置到第 1 阶段；完成全部 6 次复习标记为「已掌握」
- **独立状态文件**：复习进度持久化在 `cache/wrong_review_state_<userId>.json`（365 天有效期），不污染现有错题缓存结构，服务重启不丢失
- **用户隔离**：复习状态按 userId 隔离，与错题本、练习记录一致

### 搜索功能
- 全局题目搜索，支持按模块（模考/真题/每日演练/专项智能练习）筛选
- 后端 `getSearchModules` 获取粉笔搜索模块列表，前端模块 chip 选择器 + 关键词输入
- 搜索结果卡片展示题干摘要、来源标签，点击跳转单题详情

### 前端导航栏统一化
- 提取 `partials/navbar.ejs` 和 `partials/page-hero.ejs` 两个 EJS partial
- 13 个页面导航栏改用 `<%- include() %>` 引入，消除内联重复
- 后端全局变量注入中间件，`ctx.state` 自动携带 `userPhone`/`isAdmin`
- 导航项 7 主干平铺：练习总览 / 每日记录 / 错题复习 / 题库刷题 / 词频分析 / 高频词语 / 公文速查

### 设备指纹识别
- `src/views/js/device.js` 采集 Canvas + WebGL + UA 等 10 项特征，FNV-1a 双重 hash 输出 16 位 hex
- 存入 localStorage + 10 年 cookie，XHR/fetch 自动注入 `X-Device-Id` header
- app.js HTML 自动注入中间件在 `</body>` 前注入 device.js
- 导航栏显示指纹前 8 位徽章

### 登录与认证
- 支持粉笔网账号密码登录（含图形验证码）
- Cookie 本地缓存，自动续期

## 技术栈

- **后端**：Node.js + Koa 2 + Koa-Router + koa-ejs（服务端渲染）
- **模板**：EJS（`cache: false`，动态页面禁用浏览器缓存）
- **PDF 生成**：PDFKit
- **工具库**：lodash、moment、percentile、qs、xlsx（本地题库加载）
- **图表**：ECharts（前端）
- **HTTP**：request
- **字体**：simhei.ttf / msyh.ttc / CascadiaMono.ttf / SimSun.ttf（PDF 中文支持）

## 目录结构

```
fenbi-helper-master/
├── src/
│   ├── app.js                      # Koa 主程序 + 路由
│   ├── service/
│   │   ├── exercisesResult.js     # 核心业务：练习记录 / 错题本 / 词语统计
│   │   └── loginService.js        # 登录服务
│   ├── util/
│   │   ├── auth.js                # 权限中间件（requireLogin / requireAdmin）
│   │   ├── cacheUtil.js           # 本地 JSON 文件缓存
│   │   ├── httpUtil.js            # 粉笔 API 请求封装
│   │   ├── idiomDict.js           # 成语词典加载（CSV → 内存 Map）
│   │   ├── pdfGenerator.js        # 错题本 PDF 生成器
│   │   ├── quizLoader.js          # 本地题库加载（xlsx → 内存）
│   │   ├── quizRecord.js          # 本地题库练习记录管理
│   │   ├── reviewScheduler.js     # 艾宾浩斯错题复习调度器
│   │   └── userStore.js           # 用户表管理（角色、手机号关联、数据迁移）
│   └── views/
│       ├── partials/             # EJS partial 组件
│       │   ├── navbar.ejs        # 导航栏 partial（activePage 高亮 + 用户信息 + 设备 badge）
│       │   └── page-hero.ejs     # 页面头部 partial（title / subtitle / actions）
│       ├── exerciseResult.ejs     # 练习报告详情页
│       ├── history-category-complex.ejs  # 分类聚合历史页（首页）
│       ├── history-category.ejs   # 分类历史页
│       ├── history.ejs            # 历史记录页
│       ├── wrong-questions.ejs     # 错题本页
│       ├── review-plan.ejs        # 艾宾浩斯复习规划页（曲线图 + 阶段预测）
│       ├── word-frequency.ejs     # 词语频次统计页
│       ├── word-stats.ejs         # 词语统计页
│       ├── question.ejs           # 单题详情页
│       ├── search.ejs            # 搜索页
│       ├── shenlun-format.ejs    # 申论公文格式页
│       ├── quiz-list.ejs         # 本地题库选择页
│       ├── quiz-play.ejs         # 本地题库做题页
│       ├── quiz-result.ejs       # 本地题库结果页
│       ├── setup.ejs             # 登录页
│       ├── theme.css             # 全局主题
│       └── js/                   # 前端静态资源（echarts、easymde、katex 等）
├── fonts/                         # PDF 中文字体
├── fenbi-helper-design/          # 设计稿
├── cache/                        # 本地缓存（已 gitignore，含敏感数据）
├── uploaded-quizzes/            # 上传的题库文件夹（已 gitignore，运行时生成，所有题库均通过上传添加）
├── 言语成语表_结构化.csv           # 成语词典数据源（598 条）
├── .trae/skills/standard-quiz-builder/  # 标准题库生成 Skill（TRAE IDE）
├── Dockerfile
└── package.json
```

## 安装与运行

### 环境要求
- Node.js ≥ 14
- npm

### 启动步骤

**方式一：启动脚本（推荐）**

双击项目根目录的 `start.bat`，脚本会自动检查 Node.js、首次运行 `npm install`、启动服务并打印本机与局域网访问地址。

**方式二：命令行**

```bash
# 安装依赖
npm install

# 启动服务
node src/app.js
```

服务默认监听 `http://localhost:3000`，同时绑定 `0.0.0.0` 支持局域网访问。

### 首次使用
1. 打开 http://localhost:3000 ，未登录会自动跳转到登录页
2. 输入粉笔网账号、密码（如需要图形验证码会自动弹出）
3. 登录成功后，首页自动跳转到练习记录聚合页

## 主要路由

| 路由 | 说明 |
|------|------|
| `/history-category-complex` | 首页：分类聚合练习记录 |
| `/exercise/:exerciseId` | 练习报告详情（含耗时图、题目列表、词语统计） |
| `/question/:questionId` | 单题详情 |
| `/wrong-questions` | 错题本 |
| `/review-plan` | 艾宾浩斯复习规划页（曲线图 + 阶段预测 + 应用计划） |
| `/word-frequency` | 词语频次统计 |
| `/word-stats` | 高频词语统计 |
| `/search` | 搜索页 |
| `/shenlun-format` | 申论公文格式速查 |
| `/quiz` | 本地题库选择页 |
| `/quiz/custom` | 自定义出题（勾选题套 + 数量，Fisher-Yates 抽样） |
| `/quiz/:setId` | 本地题库做题页 |
| `/quiz-result/:recordId` | 本地题库结果页 |
| `/setup` | 登录页 |
| `/api/wrong-questions/pdf` | 导出错题本 PDF |
| `/api/exercises/export-pdf` | 按练习记录批量导出错题/未写题目 PDF |
| `/api/quiz/upload-folder` | 上传题库文件夹（xlsx/apkg/md，保留原始文件夹名） |
| `/api/quiz/uninstall` | 卸载上传的题库（移入回收站，2 天可恢复） |
| `/api/quiz/trash` | 列出回收站中可恢复的题库（含剩余恢复时间） |
| `/api/quiz/restore` | 从回收站恢复题库（移回 uploaded-quizzes/ + 恢复配置） |
| `/api/quiz/export-pdf` | 本地题库结果导出 PDF（错题+疑题） |
| `/api/quiz/export-review-pdf` | 艾宾浩斯复习题目导出 PDF（按 recordId 导出整套复习题目，含对错标注，支持隐藏答案） |
| `/api/quiz/export-set-pdf` | 本地题库题套导出 PDF（按 setId 导出整套题，支持范围与隐藏答案） |
| `/api/export-daily-wrong-pdf` | 按日期导出当日错题 PDF（含词语统计页，支持 `exerciseIds` 按练习过滤，`attachment` 下载方式） |
| `/api/quiz/redo` | 当日错题重做：构建 `custom_redo_<date>_<ts>` 内存题集，返回 `{setId, questionCount}` |
| `/api/quiz/review/today` | 艾宾浩斯复习：获取今日待复习概览（同步新错题入队 + 返回统计与预览） |
| `/api/quiz/review/start` | 艾宾浩斯复习：构建 `custom_review_<date>_<ts>` 复习题集，返回 `{setId, questionCount}` |
| `/api/quiz/review/plan` | 艾宾浩斯复习规划：按 `startDate` 模拟未来 30 天复习量曲线与阶段日详情（不写入状态） |
| `/api/quiz/review/apply-plan` | 艾宾浩斯复习规划：把模拟计划写入 `nextReviewTime`（保留 stage，仅重排时间） |
| `/api/word-frequency/refresh` | 手动刷新词语统计缓存 |
| `/api/wrong-questions-by-ids` | 按 ID 批量获取题目详情 |
| `/api/wrong-questions/:keypointId` | 按知识点获取错题列表 |
| `/api/wrong-questions/refresh` | 刷新错题本缓存 |
| `/api/collect/:questionId` | 收藏/取消收藏题目 |
| `/api/video/:questionId` | 获取题目讲解视频 |
| `/api/comment/:questionId` | 获取题目评论 |
| `/api/zj` | 造句查询（zaojv.com） |
| `/api/saveNote/:questionId` | 保存题目笔记 |
| `/api/word-frequency` | 获取词语频次统计（JSON） |

## 数据与缓存

- 所有从粉笔 API 拉取的数据会缓存到本地 `cache/` 目录（JSON 文件）
- 缓存键包括：`exercise_history`、`word_frequency`、`wrong_keypoint_tree`、`search_modules`、`quiz_records` 等
- 部分页面支持 `?refresh=1` 强制重新拉取
- 词语统计缓存有效期 15 天，过期自动失效，可通过 `POST /api/word-frequency/refresh` 手动刷新
- 本地题库练习记录持久化在 `cache/quiz_records.json`（1 年有效期），做题后自动同步进 `exercise_history.json`
- 上传题库存放于 `uploaded-quizzes/` 目录，配置持久化到 `uploaded-quizzes/config.json`，服务启动时自动加载
- `cache/`、`uploaded-quizzes/` 目录已加入 `.gitignore`，**不会上传到仓库**（含用户 cookie 等敏感数据与个人题库）

## 工程约定

- **无内置题库**：`QUIZ_DIRS` 为空数组，项目不预置任何题库；所有题库均通过上传功能（`/api/quiz/upload-folder`）添加，配置持久化到 `uploaded-quizzes/config.json`
- **失效配置自动清理**：服务启动 `loadAll()` 时校验每个动态配置的目录是否存在（`fs.existsSync`），目录不存在的配置从 config.json 移除并打印日志，避免手动删除文件夹后失效配置残留
- **题库软删除/回收站**：卸载题库时文件夹移动到 `.deleted-quizzes/`（已 gitignore），元数据写入 `trash.json`，保留 2 天可恢复（`POST /api/quiz/restore`）；`loadAll()` 启动时调用 `cleanupTrash()` 永久删除超期项；quiz-list.ejs 分类页底部「回收站」区域可折叠查看并恢复
- **设备指纹识别**：`src/views/js/device.js` 生成浏览器指纹（Canvas + WebGL + UA 等特征 FNV-1a hash → 16 位 hex），存入 localStorage + 10 年 cookie；XHR/fetch 自动注入 `X-Device-Id` header；app.js HTML 自动注入中间件在 `</body>` 前注入该脚本，设备识别中间件注入 `ctx.deviceId`
- 练习记录数据获取采用 **cursor 游标分页**，全量拉取后按 id 去重
- 三个 categoryId 并发拉取：`1=模考/真题`、`2=每日演练`、`3=专项智能练习`
- 词语统计区分成语（4 字汉字全部统计）与普通词（count > 2 才展示）
- 错题判定使用 `!q.correct`（避免 `=== false` 漏掉 `0`/`null`/`undefined` 等 falsy 值）
- 动态页面禁用浏览器缓存（`Cache-Control: no-store`），确保数据最新
- 页面返回通过 `?from=` 参数 + 白名单校验，防开放重定向
- 多选题识别统一使用正则 `/多(选|项)/`，兼容"多选"、"多项选择"等变体（前端、后端、quizLoader 三处一致）
- Koa-router 静态路径必须在参数路径之前注册（如 `/quiz/custom` 必须在 `/quiz/:setId` 之前），否则 "custom" 会被当作 setId 参数
- EJS 模板必须以 `<!DOCTYPE html>` 开头，否则浏览器进入 quirks mode，KaTeX 检测到后拒绝渲染
- 题库图片字段（imageUrl / analysisImageUrl）支持绝对 URL（http/https 直接渲染）与相对路径（配合 `/quiz-img/:source/*` 路由）；多图用 `|` 分隔
- apkg 题库图片：parseApkgFile 自动解压 `media` 映射的图片到题库目录 `images/` 子目录，题干/解析 HTML 内的相对 `src` 重写为 `/quiz-img/{source}/images/xxx`；`/quiz-img/:source/*` 路由依次查 `local-quiz-bank/` 与 `uploaded-quizzes/`
- apkg 题干含 HTML 标签（资料分析题常见 `<div>/<b>/<br>/<img>`），quiz-play.ejs / quiz-result.ejs 题干直接 innerHTML 渲染不做转义；结果页题干预览用 `.replace(/<[^>]+>/g, '')` 去标签
- 当日错题导出/重做支持 `exerciseIds` 过滤参数：未提供时统计当日全部练习，提供时按 ID 过滤；前端复选框 `data-date` / `data-id`，`event.stopPropagation()` 避免触发行跳转
- 当日错题重做题集通过 `quizLoader.registerCustomSet(customId, source, setName, questions)` 注册到 `customSetsMap` 内存缓存（不持久化）， setId 前缀 `custom_redo_<date>_<timestamp>`
- 本地题库记录合并进 `exercise_history`：API 刷新粉笔数据后从 `quiz_records.json` 读取本地记录 concat + 按 `updatedTime` 降序排序，避免刷新丢失
- 时间戳规范化：本地题库记录提交时 `normTs()` 检测 .NET ticks（>1e15，18 位数字）自动转 Unix ms（13 位）；旧数据合并时同样规范化 `updatedTime` 并重生成 `finishedTime`/`finishedDate`
- `_isLocalQuiz` 标记的记录在 `getCategories` 中归入「本地题库」组（与「每日演练」同级独立分组，不进入知识点分类树）
- 无选项题（填空/解答题）通过 `q.options.length === 0` 识别：做题页不渲染选项区与标记疑题按钮，改为「显示答案」按钮 + 答案/解析面板（默认隐藏，点击展开 KaTeX 补渲染）；提交判分跳过判分（`correct = null` 不计入对错与未答）；结果页显示「已查看」紫色徽章，答案行只显示「参考答案：xxx」
- Markdown 题库解析：`parseMdFile` 用 `### 第 X 题` 拆题，`**考点**/**题目**/**答案**/**解析**` 提取字段，`## 填空题/解答题/选择题` 二级标题切换题型，自动剥离「（本题满分 X 分）」前缀；上传路由 `/api/quiz/upload-folder` 支持 `.md` 文件（按数量多数原则检测主扩展名）
- 非标准 LaTeX 修复（`fixNonStandardMath`）：题库生成时可能产生 `[matrix]`、`⎩⎨⎧` 等非标准标记，KaTeX 无法识别；quizLoader 加载时自动转换为标准环境——`⎩⎨⎧[matrix]` 和 `{[matrix]` → `\begin{cases}`，`([matrix]` → `\begin{pmatrix}`，裸 `[matrix]` → `\begin{matrix}`；token 扫描补全 `\end{...}`（matrix 遇下一个 `\begin` 或 `)` 闭合，pmatrix 遇 `)` 闭合，cases 块尾闭合）

## 部署

### Docker
项目根目录提供 `Dockerfile`，可构建镜像运行：

```bash
docker build -t fenbi-helper .
docker run -d -p 3000:3000 -v $(pwd)/cache:/app/cache fenbi-helper
```

### 局域网访问（平板/手机）
- 服务默认监听 `0.0.0.0:3000`，启动时会打印本机与局域网 IP
- 平板/手机与电脑连接**同一 WiFi**，浏览器打开 `http://<电脑IP>:3000` 即可访问
- Windows 需添加防火墙入站规则放行 3000 端口（以管理员身份运行 PowerShell）：
  ```powershell
  New-NetFirewallRule -DisplayName "fenbi-helper-3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
  ```
- 建议在路由器为电脑绑定固定 IP（DHCP 静态分配），避免重启后 IP 变化

## 历史更新

- **2026-07-08** 前端导航栏与页面布局统一化：提取 `src/views/partials/navbar.ejs` 和 `src/views/partials/page-hero.ejs` 两个 EJS partial，13 个页面导航栏改用 `<%- include('./partials/navbar.ejs', { activePage: 'xxx' }) %>` 引入，消除各页面内联 navbar 重复代码；导航项分组为 7 个主干平铺（练习总览/每日记录/错题复习/题库刷题/词频分析/高频词语/成语词典）+ 工具下拉（公文速查/速算练习）；`app.js` 新增全局变量注入中间件，`ctx.state` 自动携带 `userPhone`/`isAdmin`，所有 `ctx.render` 调用无需手动传参；修复 navbar partial 中 `<%= %>`（HTML 转义）导致 `class="active"` 渲染为 `class=&#34;active&#34;` 的高亮失效 bug，改为 `<%- %>`（不转义）；补全 3 个缺失路由（`/word-stats`、`/idioms`、`/search`），其中 `/search` 路由调用 `exerciseResult.getSearchModules(cookie)` 获取搜索模块列表传入模板
- **2026-07-07** 新增艾宾浩斯复习规划页面：新建 `src/views/review-plan.ejs`（紫色主题，ECharts 曲线图 + 阶段预测面板 + 详情面板 + 操作区），`reviewScheduler.js` 新增 `simulatePlan(userId, startDate)` 与 `applyPlan(userId, startDate)` 两个函数——前者按起点日期 D 模拟未来 30 天复习量曲线（D+1 / D+2 / D+4 / D+7 / D+15 / D+30 六个阶段日高亮）+ 6 个阶段日详情，后者把每道未掌握题的 `nextReviewTime` 重排为 `D + INTERVALS_DAYS[stage]`（stage 保留不重置，已掌握题自动排除）；app.js 新增 `GET /review-plan`（页面）、`GET /api/quiz/review/plan`（模拟数据）、`POST /api/quiz/review/apply-plan`（写入状态）三条路由；wrong-questions.ejs 复习卡片按钮组新增「复习规划 →」紫色虚线入口跳转 `/review-plan`；9/9 单元测试通过（入队/阶段推进/simulatePlan/applyPlan/已掌握过滤/无效日期）
- **2026-07-07** 新增艾宾浩斯遗忘曲线错题复习功能：新建 `src/util/reviewScheduler.js` 调度器，经典 6 次复习间隔（1天 → 2天 → 4天 → 7天 → 15天 → 30天），答对进入下一阶段、答错重置到第 1 阶段、完成 6 次复习标记为「已掌握」；复习状态持久化到 `cache/wrong_review_state_<userId>.json`（365 天有效，按 userId 隔离）；`exercisesResult.js` 的 `getWrongQuestions` 自动扫描全部错题缓存（粉笔+本地）同步新错题入队；app.js 新增 `GET /api/quiz/review/today`（复习概览）、`POST /api/quiz/review/start`（构建 `custom_review_<date>_<ts>` 复习题集）、`POST /api/quiz/export-review-pdf`（按 recordId 导出整套复习题目 PDF）三条路由，`/quiz/:setId/submit` 识别 `custom_review_` 前缀自动更新复习状态；wrong-questions.ejs 顶部新增紫色「每日复习」卡片（今日待复习题数、阶段分布条形图、已掌握数、开始按钮）；history.ejs 每日记录列表中艾宾浩斯复习记录显示紫色「复习」标签与「导出题目」按钮（支持导出含解析/纯题目两种版本）
- **2026-07-07** 用户表手机号关联强化：`userStore.js` 的 `upsertUser` 新增 `phoneRaw` 字段（完整手机号）用于跨 userId 关联同一用户，userId 变化时自动调用 `migrateUserCache` 迁移缓存文件（`<key>_<old>.json` → `<key>_<new>.json`、`wrong_q_<old>_<kpId>.json` → `wrong_q_<new>_<kpId>.json`）；三级关联策略：优先按 phoneRaw → 按 userId → 新建；兼容旧数据（无 phoneRaw 字段时下次登录自动补全）
- **2026-07-07** 题库软删除/回收站机制：卸载题库不再直接删除文件，改为移动到 `.deleted-quizzes/` 目录并记录元数据到 `trash.json`，保留 2 天可恢复；quizLoader.js 新增 `moveToTrash` / `restoreFromTrash` / `listTrash` / `cleanupTrash` 四个函数，`loadAll()` 启动时调用 `cleanupTrash()` 永久删除超期项；app.js `/api/quiz/uninstall` 路由从永久删除改为 `moveToTrash()`，新增 `GET /api/quiz/trash`（列出可恢复题库）和 `POST /api/quiz/restore`（恢复题库）路由；quiz-list.ejs 分类页底部新增可折叠「回收站」区域（每项显示题库名、删除时间、剩余恢复小时数），`uninstallQuiz()` 确认提示更新为「移入回收站，2 天内可恢复，超期永久删除」
- **2026-07-07** 设备指纹识别：新增 `src/views/js/device.js`，收集 Canvas 指纹 + WebGL 指纹 + UA/屏幕/时区等 10 项特征，FNV-1a 双重 hash 输出 16 位 hex 存入 localStorage + 10 年 cookie；重写 XHR 和 fetch 自动注入 `X-Device-Id` header；app.js 新增 HTML 自动注入中间件（在 `</body>` 前注入 device.js）+ 设备识别中间件（注入 `ctx.deviceId`，访问日志含 deviceId）；history-category-complex.ejs navbar 显示指纹前 8 位徽章
- **2026-07-06** 项目不再内置题库：`QUIZ_DIRS` 改为空数组，移除片段阅读600题、花生逻辑推理600题、红领巾言语理解600题三个内置配置；所有题库均通过上传功能添加，配置持久化到 `uploaded-quizzes/config.json`；启动时自动清理目录不存在的动态配置；新增 `start.bat` 启动脚本（自动检查 Node.js、首次运行 `npm install`、显示本机与局域网访问地址）
- **2026-07-06** 服务监听改为 `0.0.0.0:3000` 支持局域网访问：平板/手机连接同一 WiFi 后浏览器打开 `http://<电脑IP>:3000` 即可刷题；启动时自动打印本机与局域网 IPv4 地址；需配合 Windows 防火墙入站规则放行 3000 端口（Private 配置文件）
- **2026-07-06** 词语统计/词语频次/公文格式三个页面卡片展开动画优化：弹窗面板从 `display:none→block` 改为 `opacity+visibility` 过渡，修复再次打开时动画不触发的问题；遮罩层 0.25s 淡入，内容面板 `scale(0.92)+translateY(20px) → scale(1)+translateY(0)` 0.4s 弹簧曲线；三个页面卡片 hover 增强：上浮 3-4px + 蓝色边框 + 蓝色阴影，active 回落，限定 `.visible` 类避免与入场动画冲突
- **2026-07-06** quiz-play.ejs 新增方向键左右切换题目：监听 `keydown` 事件，`ArrowLeft` → `goPrev()`，`ArrowRight` → `goNext()`（末题打开提交确认弹窗）；焦点在 INPUT/TEXTAREA/SELECT 时跳过避免输入冲突。同时完善上传弹窗格式规范：新增「三、md 题库规范」章节（7 个元素说明：`## 填空题/解答题/选择题` 二级标题、`### 第 X 题` 三级标题、四个加粗字段、`---` 分隔线），原「文件与文件夹」顺延为「四」；文件夹选择按钮提示文字更新为「含 xlsx / apkg / md」
- **2026-07-06** 新增无选项题（填空/解答题）答题界面支持：quizLoader.js 新增 `parseMdFile()` 解析 Markdown 题库（`### 第 X 题` 拆题 + `**考点**/**题目**/**答案**/**解析**` 字段提取，`## 填空题/解答题/选择题` 二级标题切换题型，自动剥离「（本题满分 X 分）」前缀），`loadDir` 新增 md 分支；app.js `/api/quiz/upload-folder` 路由支持 `.md` 文件（按数量多数原则检测主扩展名），`/quiz/:setId/submit` 提交判分中无选项题（`options.length === 0`）跳过判分，`correct = null` 不计入对错与未答统计；quiz-play.ejs `renderQuestion()` 检测 `isNoOpt`，无选项题渲染「▸ 显示答案」按钮 + 答案/解析面板（默认隐藏），新增 `toggleAnswer(qNo)` 函数控制展开/收起 + KaTeX 公式补渲染，`updateStatus()` / `renderDots()` / `openSubmitDialog()` 仅统计有选项题，导航点用 `.no-opt` 淡紫色独立样式；quiz-result.ejs 无选项题状态显示「已查看」紫色徽章（`.status-viewed` + `.q-item.viewed`），答案行改为「参考答案：xxx」不显示「我的答案」；quiz-list.ejs 前端文件选择器支持 `.md` 文件，状态文本显示 `xlsx X / apkg Y / md Z`
- **2026-07-06** 列表视图新增「重做当日错题」功能：新增后端路由 `POST /api/quiz/redo`，调用 `getDailyWrongStats` 获取错题（支持 `exerciseIds` 按练习过滤），转换为 quiz-play 格式后通过 `quizLoader.registerCustomSet` 注册为 `custom_redo_<date>_<ts>` 内存题集，前端跳转 `/quiz/<setId>` 进入做题页；history.ejs 每日分组新增「重做当日错题」蓝色按钮，与「导出当日错题」并列；复选框选择时按钮切换为「重做所选错题 N」高亮态。同时新增「按练习勾选导出当日错题」：每个练习行新增复选框，勾选后「导出当日错题」按钮变高亮显示「导出所选错题 N」；`getDailyWrongStats` 新增第三参数 `exerciseIds` 按练习 ID 过滤；`/api/export-daily-wrong-pdf` 改为 `Content-Disposition: attachment` 下载方式（沿用 `/api/quiz/export-pdf` 路径），文件名 `日期-当日错题.pdf` 或 `日期-错题(所选N个练习).pdf`
- **2026-07-06** 修复考研数学题库 LaTeX 渲染不完全：题库中大量使用非标准 `[matrix]`（274 处）和 `⎩⎨⎧` Unicode 分段括号（16 处）代替标准 LaTeX 环境；新增 `fixNonStandardMath()` 函数在 quizLoader 加载时自动转换——`⎩⎨⎧[matrix]` / `{[matrix]` → `\begin{cases}`，`([matrix]` → `\begin{pmatrix}`，裸 `[matrix]` → `\begin{matrix}`；token 扫描自动补全 `\end{...}` 闭合标签；7 个题套共修复 86 处，0 残留
- **2026-07-06** 修复练习记录刷新时本地题库记录丢失 Bug：`getExerciseHistory` 从粉笔 API 拉取新数据后直接覆盖 `exercise_history` 缓存，导致本地题库记录丢失；修复方案为 API 拉取后从 `quiz_records.json` 读取本地记录合并并按 `updatedTime` 降序排序；同时修复本地题库记录时间戳格式 Bug（`endTime`/`startTime` 误存为 .NET ticks 18 位数字导致 `finishedTime` 为 "Invalid date"），app.js 提交路由新增 `normTs()` 函数将 ticks 转为 Unix ms，合并时同样规范化旧数据；分组逻辑与 `getCategories` 新增 `_isLocalQuiz` 标记归入「本地题库」组
- **2026-07-06** 列表视图移除「练习次数」卡片（history.ejs / history-category-complex.ejs）
- **2026-07-06** 资料分析题库适配（apkg）：parseApkgFile 新增 media 文件解压逻辑（apkg 内 `media` JSON 映射的数字命名图片文件解压到题库目录 `images/` 子目录）；新增 `rewriteImgSrc()` 将题干/解析 HTML 中的相对路径 `src` 重写为 `/quiz-img/{source}/images/xxx` 绝对路径；quiz-play.ejs 题干从 `escapeHtml` 改为直接 innerHTML 渲染（资料分析题干含 `<div>/<b>/<br>/<img>` 标签），CSS 移除 `white-space: pre-wrap`，新增 `.q-stem img` / `.q-stem p` 样式；quiz-result.ejs 题干完整展示改为 `<%- %>` 不转义，题干预览用 `.replace(/<[^>]+>/g, '')` 去 HTML 标签；`/quiz-img/:source/*` 路由从单目录改为双目录依次查找（`local-quiz-bank/` → `uploaded-quizzes/`）以支持上传的 apkg 题库图片
- **2026-07-06** 项目更名为「错题助手」；本地题库题套列表新增「导出 PDF」按钮（沿用错题本导出逻辑，支持选题号范围与隐藏答案，带解析导出文件名追加「（解析）」）；新增后端路由 `/api/quiz/export-set-pdf` 按 setId 导出整套题；修正原 `/api/quiz/export-pdf` 单选题答案字母转换（correctAnswer.choice 直接传字母而非 indexOf 数字）；新增本地题库上传/卸载功能（支持 xlsx/apkg 文件夹上传，保留原始文件夹名，配置持久化到 uploaded-quizzes/config.json）；新增自定义出题（题套勾选 + Fisher-Yates 随机抽样 + 二级界面全选按键）；新增多选题支持（识别正则统一为 /多(选|项)/，前端多选交互不自动跳转，后端判分排序）；列表视图标题改为一级题库名+题目数量（旧缓存通过 recordId 三级回填 source）；解析展示压缩空白避免大量空行；新增 standard-quiz-builder skill 用于生成符合规范的 xlsx/apkg 题库；新增题库图片支持（imageUrl / analysisImageUrl 字段 + `/quiz-img/:source/*` 静态路由 + 防路径穿越）；新增 LaTeX 公式渲染（KaTeX 0.16.9 资源本地化于 `src/views/js/katex/`，支持题干/选项/解析中的 `$...$`、`$$...$$`、`\(\)`、`\[]` 公式）；修复 4 个 EJS 模板缺 `<!DOCTYPE html>` 导致浏览器 quirks mode 使 KaTeX 拒绝渲染的问题；404 中间件对 `/api/` 路径返回 JSON 而非重定向到 HTML
- **2026-07-05** 新增本地题库刷题模块：内置片段阅读 436 题 + 逻辑推理 600 题共 1036 题；做题页支持单题作答、总计时器、标记疑题、题号导航；结果页含对错高亮、疑题标记、解析展开；做题记录自动同步至练习记录列表和分类聚合页（"本地题库"标签）；错题自动同步至错题本；结果页支持一键导出错题+疑题 PDF
- **2026-07-04** 新增申论公文格式模块（33 文种，三级卡片式浏览，含格式示意）；练习记录按 id 去重（修复跨分类重复）；练习记录多选导出错题/未写题目 PDF；热力图与分类模块滚动条优化；视频解析非会员容错（无视频自动隐藏按钮不报错）；导航栏统一补齐列表视图
- **2026-07-03** 成语词典 CSV 集成；词语统计缓存策略（15 天 + 手动更新）；错题词语关联卡片重设计；正确答案高亮；页面返回逻辑（从哪来回哪去）；PDF 排版优化（智能选项布局、绝对 Y 坐标）
- **2026-07-02** 词语统计数据源切换为全错题本数据；按钮配色与 PDF 样式优化；新增每日演练数据拉取；分类树与历史记录聚合重构
- **2020-07** 讲解视频、PDF 导出、笔记、评论、耗时分析图、习题标签
- **2020-07-04** 题目展开收起、省市联考国考标签、收藏标记
- **2020-06-29** 初版上线

## 许可

仅供学习交流使用，请勿用于商业用途。
