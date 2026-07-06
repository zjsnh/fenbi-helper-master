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

### 词语频次统计
- 全错题本逻辑填空题选项词语自动提取
- 区分**四字成语**（全部统计）与**普通词语**（出现 >2 次统计）
- 点击词语弹出关联错题面板，顶部展示词义、组主题、全局考频
- 练习详情页的「逻辑填空词语统计」基于当前练习 `wordStats` 实时累积，不依赖全错题本
- **本地缓存策略**：默认 15 天有效期，过期自动更新；支持右上角「手动更新」按钮强制刷新
- 后端 `getWordFrequency` 支持 `forceRefresh` 参数，前端展示层过滤 `count > 2`

### 成语词典集成
- 从 `言语成语表_结构化.csv` 加载 598 条成语到内存 `Map<成语, {definition, freq, theme, groupNo}>`
- 服务启动时通过 `idiomDict.js` 加载，提供 `lookup(idiom)` 与 `enrich(words)` 接口
- 在练习详情页错题词语关联卡片、词语统计关联面板、PDF 词语统计页注入成语释义、组主题、考频
- 卡片头部显示词语 + 组主题标签（成语）+ 释义省略号截断 + 错误次数徽章

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
- 内置 **2 个题库共 1036 道题**：片段阅读 436 题（22 套）+ 花生逻辑推理 600 题（30 套）
- 题库以 xlsx 文件存储于项目根目录，启动时由 `quizLoader.js` 加载到内存
- **做题页**：单题展示、选项点击作答（支持 4/6 选项）、顶部进度条、总计时器、上一题/下一题/题号导航点
- **多选题支持**：题型识别正则 `/多(选|项)/` 兼容"多选"、"多项选择"等变体；多选题作答不自动跳转，需手动点击下一题；判分时答案字母去重排序后比较
- **标记疑题**：每题可标记为疑题，提交时单独统计
- **自动判分**：提交后后端对照答案统计对错，生成练习记录
- **结果页**：正确率/答对/答错/未答/疑题统计卡、题目列表（对错高亮+疑题标记）、解析展开（压缩空白避免大量空行）、PDF 导出
- **同步练习记录**：做题记录自动写入 `exercise_history.json`，在列表视图和分类聚合页显示"本地题库"标签；列表视图标题显示为「一级题库名 + 题目数量」（如"【1】片段阅读600题题库 · 50题"），旧缓存通过 recordId 三级回填 source
- **同步错题本**：错题自动写入 `wrong_q_local_quiz.json`，兼容现有错题本格式
- **PDF 导出**：结果页一键导出错题+疑题为 PDF（复用 pdfGenerator）；题套列表页每行新增「导出 PDF」按钮，支持选范围、隐藏答案，带解析导出文件名追加「（解析）」
- **题目图片**：支持题干配图（imageUrl 字段）与解析配图（analysisImageUrl 字段）；xlsx 中填相对路径（如 `images/p01_q04_1.jpg`）配合题库目录下 `images/` 子目录 + 服务端 `/quiz-img/:source/*` 路由访问；多图用 `|` 分隔；绝对 URL（http/https）直接渲染
- **LaTeX 公式渲染**：题干、选项、解析中的 LaTeX 公式通过 KaTeX 0.16.9 渲染（资源本地化于 `src/views/js/katex/`，无 CDN 依赖）；支持 `$...$` 行内、`$$...$$` 块级、`\(...\)`、`\[...\]` 四种分隔符

### 本地题库上传与卸载
- **上传题库**：题库列表页右上角「+ 上传题库」按钮，选择文件夹即可批量上传 xlsx / apkg 文件
- **保留原始文件夹名**：上传时以原始文件夹名作为磁盘存储目录名，不自动重命名、不加时间戳
- **动态加载**：上传后自动加载到题库列表，无需重启服务；配置持久化到 `uploaded-quizzes/config.json`
- **卸载题库**：分类卡片 hover 显示「✕」卸载按钮，仅对上传题库生效，内置题库不可卸载
- **格式规范弹窗**：上传弹窗含详细 xlsx 表头规范（题干/选项A~F/答案/题型/解析/知识点/图片URL/题号）与 apkg 字段规范（7 字段顺序固定 + `\x1f` 分隔 + `<br>` 选项格式）
- **标准题库生成 Skill**：项目内置 `.trae/skills/standard-quiz-builder/SKILL.md`，可在 TRAE IDE 中调用生成符合规范的 xlsx/apkg 题库

### 自定义出题
- **题套勾选**：二级界面（题套列表）每张题套卡片左侧带勾选框，支持跨分类多选
- **全选按键**：二级界面标题区右侧「全选（N）/ 取消全选」按钮，仅影响当前分类下的题套
- **设置数量**：底部操作栏可输入本次出题数量，留空则全部
- **随机抽样**：聚合所有勾选题套的题目后采用 Fisher-Yates 洗牌算法随机抽取指定数量
- **临时题集**：自定义题集以 `custom_时间戳` 为 ID 存于内存缓存，复用现有做题/判分/结果页流程

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
│   │   ├── cacheUtil.js           # 本地 JSON 文件缓存
│   │   ├── httpUtil.js            # 粉笔 API 请求封装
│   │   ├── idiomDict.js           # 成语词典加载（CSV → 内存 Map）
│   │   ├── pdfGenerator.js        # 错题本 PDF 生成器
│   │   ├── quizLoader.js          # 本地题库加载（xlsx → 内存）
│   │   └── quizRecord.js          # 本地题库练习记录管理
│   └── views/
│       ├── exerciseResult.ejs     # 练习报告详情页
│       ├── history-category-complex.ejs  # 分类聚合历史页（首页）
│       ├── history-category.ejs   # 分类历史页
│       ├── history.ejs            # 历史记录页
│       ├── wrong-questions.ejs     # 错题本页
│       ├── word-frequency.ejs     # 词语频次统计页
│       ├── word-stats.ejs         # 词语统计页
│       ├── question.ejs           # 单题详情页
│       ├── search.ejs            # 搜索页
│       ├── calc.ejs              # 计算器页
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
├── uploaded-quizzes/            # 上传的题库文件夹（已 gitignore，运行时生成）
├── 【1】片段阅读600题题库/         # 片段阅读题库（22 套 xlsx，436 题）
├── 【5】花生逻辑推理600题题库/     # 逻辑推理题库（30 套 xlsx，600 题）
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

```bash
# 安装依赖
npm install

# 启动服务
node src/app.js
```

服务默认监听 `http://localhost:3000`。

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
| `/word-frequency` | 词语频次统计 |
| `/shenlun-format` | 申论公文格式速查 |
| `/quiz` | 本地题库选择页 |
| `/quiz/custom` | 自定义出题（勾选题套 + 数量，Fisher-Yates 抽样） |
| `/quiz/:setId` | 本地题库做题页 |
| `/quiz-result/:recordId` | 本地题库结果页 |
| `/quiz-img/:source/*` | 题库图片静态服务（题库目录下 images/ 子目录，防路径穿越） |
| `/setup` | 登录页 |
| `/api/wrong-questions/pdf` | 导出错题本 PDF |
| `/api/exercises/export-pdf` | 按练习记录批量导出错题/未写题目 PDF |
| `/api/quiz/upload-folder` | 上传题库文件夹（xlsx/apkg，保留原始文件夹名） |
| `/api/quiz/uninstall` | 卸载上传的题库（删除磁盘文件 + 移除配置） |
| `/api/quiz/export-pdf` | 本地题库结果导出 PDF（错题+疑题） |
| `/api/quiz/export-set-pdf` | 本地题库题套导出 PDF（按 setId 导出整套题，支持范围与隐藏答案） |
| `/api/export-daily-wrong-pdf` | 按日期导出当日错题 PDF（含词语统计页） |
| `/api/word-frequency/refresh` | 手动刷新词语统计缓存 |
| `/api/wrong-questions-by-ids` | 按 ID 批量获取题目详情 |
| `/api/debug/exercises` | 调试接口（探查分类与练习数据） |

## 数据与缓存

- 所有从粉笔 API 拉取的数据会缓存到本地 `cache/` 目录（JSON 文件）
- 缓存键包括：`exercise_history`、`word_frequency`、`wrong_keypoint_tree`、`search_modules`、`quiz_records` 等
- 部分页面支持 `?refresh=1` 强制重新拉取
- 词语统计缓存有效期 15 天，过期自动失效，可通过 `POST /api/word-frequency/refresh` 手动刷新
- 本地题库练习记录持久化在 `cache/quiz_records.json`（1 年有效期），做题后自动同步进 `exercise_history.json`
- 上传题库存放于 `uploaded-quizzes/` 目录，配置持久化到 `uploaded-quizzes/config.json`，服务启动时自动加载
- `cache/`、`uploaded-quizzes/` 目录已加入 `.gitignore`，**不会上传到仓库**（含用户 cookie 等敏感数据与个人题库）

## 工程约定

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

## 部署

### Docker
项目根目录提供 `Dockerfile`，可构建镜像运行：

```bash
docker build -t fenbi-helper .
docker run -d -p 3000:3000 -v $(pwd)/cache:/app/cache fenbi-helper
```

## 历史更新

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
