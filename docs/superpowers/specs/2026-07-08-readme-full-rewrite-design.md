# README 全面重构 设计文档

> **日期**：2026-07-08
> **方案**：A — 就地重写，保持章节顺序，聚焦内容修正与补全
> **目标**：让 README 完整、准确地反映项目当前状态，消除文档与代码的偏差

## 背景与问题

经对比 README 与实际代码，发现 6 类偏差：

1. **已删除页面仍被描述**：README「功能特性」仍含「成语词典集成」章节，「主要路由」仍列 `/idioms`、`/calc`，「目录结构」仍列 `idioms.ejs`、`calc.ejs`，但页面文件与路由均已删除
2. **路由表严重缺失**：实际 47 条路由，README 只列约 25 条，大量 API 路由缺失（`/api/quiz/upload-folder`、`/api/quiz/redo`、`/api/collect/:questionId`、`/api/video/:questionId`、`/api/comment/:questionId`、`/api/zj`、`/api/word-frequency` 等）
3. **`/search` 页面未描述**：搜索页已存在并可用，但 README 功能特性和路由表均未提及
4. **导航栏统一化未同步**：`partials/navbar.ejs`、`partials/page-hero.ejs` 两个 EJS partial 已部署到 13 个页面，但 README 功能特性和工程约定均未描述该机制
5. **设备指纹识别未描述**：`src/views/js/device.js` + HTML 自动注入中间件 + `ctx.deviceId` 已实现，但 README 仅在历史更新提及，功能特性章节无描述
6. **历史更新已有条目但功能特性未同步**：艾宾浩斯复习有独立功能特性章节，但导航栏统一化、页面删除等近期变更仅在历史更新中，未同步到功能特性总览

## 设计决策

### 总体策略

- **方案选择**：方案 A（就地重写），保持现有章节顺序不变，聚焦内容修正与补全
- **章节顺序**：标题 → 致谢 → 功能特性 → 技术栈 → 目录结构 → 安装与运行 → 主要路由 → 数据与缓存 → 工程约定 → 部署 → 历史更新 → 许可（不变）
- **风险控制**：一次性完成全部重写，单次提交，diff 可读

### 用户确认的边界

- **历史更新**：保留全部 30+ 条历史条目（2020-07 至 2026-07），不精简不合并
- **路由表**：全量列出（排除辅助路由 `/favicon.ico`、`/api/debug/exercises`、`/quiz-img/:source/*`），约 44 条
- **工程约定**：保留现有 20+ 条，新增 3 条，不重组
- **功能特性**：删旧（成语词典/速算练习章节）+ 增新（搜索/导航栏统一化/设备指纹三节）

## 详细设计

### 第 1 节：功能特性章节

**删除：**
- 「成语词典集成」整节（页面已删除）

**保留不动：**
- 练习记录分析、错题本、词语频次统计、错题词语关联界面、页面返回逻辑、PDF 生成优化、申论公文格式、本地题库刷题、本地题库上传与卸载、自定义出题、艾宾浩斯错题复习、登录与认证

**新增 3 节**（按使用流程插入，位于「登录与认证」之前）：

#### 1. 搜索功能

- 全局题目搜索，支持按模块（模考/真题/每日演练/专项智能练习）筛选
- 后端 `getSearchModules` 获取粉笔搜索模块列表，前端模块 chip 选择器 + 关键词输入
- 搜索结果卡片展示题干摘要、来源标签，点击跳转单题详情

#### 2. 前端导航栏统一化

- 提取 `partials/navbar.ejs` 和 `partials/page-hero.ejs` 两个 EJS partial
- 13 个页面导航栏改用 `<%- include() %>` 引入，消除内联重复
- 后端全局变量注入中间件，`ctx.state` 自动携带 `userPhone`/`isAdmin`
- 导航项 7 主干平铺：练习总览 / 每日记录 / 错题复习 / 题库刷题 / 词频分析 / 高频词语 / 公文速查

#### 3. 设备指纹识别

- `src/views/js/device.js` 采集 Canvas + WebGL + UA 等 10 项特征，FNV-1a 双重 hash 输出 16 位 hex
- 存入 localStorage + 10 年 cookie，XHR/fetch 自动注入 `X-Device-Id` header
- app.js HTML 自动注入中间件在 `</body>` 前注入 device.js
- 导航栏显示指纹前 8 位徽章

**新增章节顺序**：搜索功能 → 前端导航栏统一化 → 设备指纹识别 → 登录与认证（现有）

### 第 2 节：主要路由章节

**删除 2 条已删除路由：**
- `/idioms` | 成语词典
- `/calc` | 计算器页

**排除辅助路由**（不列入表格）：
- `/favicon.ico`
- `/api/debug/exercises`
- `/quiz-img/:source/*`（静态资源服务，已在功能特性中描述）

**新增 22 条缺失路由**，按功能分组顺序排列：

页面路由：
- `/search` | 全局搜索页（按模块筛选 + 关键词搜索题目）
- `/word-stats` | 高频词语统计页

题库相关 API：
- `POST /api/quiz/upload-folder` | 上传题库文件夹（xlsx/apkg/md，保留原始文件夹名）
- `POST /api/quiz/uninstall` | 卸载题库（移入回收站，2 天可恢复，需管理员权限）
- `GET /api/quiz/trash` | 列出回收站可恢复题库（需管理员权限）
- `POST /api/quiz/restore` | 从回收站恢复题库（需管理员权限）
- `POST /api/quiz/export-pdf` | 本地题库结果导出 PDF（错题+疑题）
- `POST /api/quiz/export-review-pdf` | 艾宾浩斯复习题目导出 PDF（按 recordId）
- `POST /api/quiz/export-set-pdf` | 本地题库题套导出 PDF（按 setId，支持范围与隐藏答案）
- `POST /api/quiz/redo` | 当日错题重做（构建 `custom_redo_<date>_<ts>` 内存题集）
- `GET /api/quiz/review/today` | 艾宾浩斯复习今日概览
- `POST /api/quiz/review/start` | 艾宾浩斯复习开始（构建复习题集）
- `GET /api/quiz/review/plan` | 艾宾浩斯复习规划模拟（按 startDate 模拟曲线）
- `POST /api/quiz/review/apply-plan` | 艾宾浩斯复习规划写入状态

错题/练习 API：
- `GET /api/wrong-questions/:keypointId` | 按知识点获取错题列表
- `POST /api/wrong-questions/refresh` | 刷新错题本缓存
- `POST /api/wrong-questions-by-ids` | 按 ID 批量获取题目详情
- `POST /api/wrong-questions/pdf` | 导出错题本 PDF
- `POST /api/export-daily-wrong-pdf` | 按日期导出当日错题 PDF（含词语统计页）
- `POST /api/exercises/export-pdf` | 按练习记录批量导出错题/未写题目 PDF

单题/辅助 API：
- `POST /api/collect/:questionId` | 收藏/取消收藏题目
- `GET /api/video/:questionId` | 获取题目讲解视频
- `GET /api/comment/:questionId` | 获取题目评论
- `POST /api/zj` | 造句查询（zaojv.com）
- `POST /api/saveNote/:questionId` | 保存题目笔记
- `GET /api/word-frequency` | 获取词语频次统计（JSON）
- `POST /api/word-frequency/refresh` | 手动刷新词语统计缓存

**路由表排序逻辑**：页面路由 → 题库 API → 错题/练习 API → 单题/辅助 API（保持现有分组逻辑，仅补全）

### 第 3 节：目录结构章节

**删除 2 个已删除文件：**
- `calc.ejs` # 计算器页
- `idioms.ejs` # 成语词典

**新增 partials 目录**（位于 `views/` 下第一个子目录）：
```
│   └── views/
│       ├── partials/             # EJS partial 组件
│       │   ├── navbar.ejs        # 导航栏 partial（activePage 高亮 + 用户信息 + 设备 badge）
│       │   └── page-hero.ejs     # 页面头部 partial（title / subtitle / actions）
│       ├── exerciseResult.ejs     # 练习报告详情页
│       ...
```

**其余文件结构保持不变。**

### 第 4 节：工程约定章节

**保留现有所有条目**（20+ 条），**新增 3 条**：

#### 1. EJS partial 组件机制

插入到「EJS 模板必须以 `<!DOCTYPE html>` 开头」条目之后：
- 导航栏和页面头部提取为 `src/views/partials/navbar.ejs` 和 `page-hero.ejs` 两个 partial
- 各页面通过 `<%- include('./partials/navbar.ejs', { activePage: 'xxx' }) %>` 引入
- `app.js` 全局变量注入中间件把 `userPhone`/`isAdmin` 写入 `ctx.state`，所有 `ctx.render` 自动携带，partial 内用 `typeof` 检查防御
- 高亮 class 必须用 `<%- %>`（不转义）输出，`<%= %>` 会把 `"` 转义为 `&#34;` 导致高亮失效

#### 2. 设备指纹中间件链

插入到「设备指纹识别」相关条目附近：
- HTML 自动注入中间件在 `</body>` 前注入 device.js
- 设备识别中间件注入 `ctx.deviceId`，访问日志含 deviceId
- `src/views/js/device.js` 生成 16 位 hex 指纹，存 localStorage + 10 年 cookie，XHR/fetch 自动注入 `X-Device-Id` header

#### 3. 公开路径白名单

插入到「页面返回通过 `?from=` 参数 + 白名单校验」条目之后：
- `src/util/auth.js` 的 `PUBLIC_PREFIXES` 白名单：`/setup`、`/api/login`、`/js/`、`/quiz-img/`、`/theme.css`、`/logo.svg`、`/image.png`、`/favicon.ico`、`/shenlun-format`
- 白名单内路径不需登录校验，其余路径未登录时页面重定向 `/setup?redirectPath=<原URL>`，API 返回 401

### 第 5 节：历史更新章节

**保留全部现有 30+ 条历史条目**（2020-07 至 2026-07-08），按时间倒序排列不变。

**新增 1 条本次重构条目**（插入到 2026-07-08 条目之后，作为同日第二条）：

```
- **2026-07-08** README 全面重构：删除已下线的成语词典/速算练习章节与路由；路由表全量补全（从 25 条扩充至 44 条，覆盖页面路由 + 题库/错题/复习/单题 API，排除辅助路由）；功能特性新增「搜索功能」「前端导航栏统一化」「设备指纹识别」三节；目录结构同步 partials/ 目录；工程约定新增 EJS partial 机制、设备指纹中间件链、公开路径白名单三条
```

**处理细节：**
- 现有 `2026-07-08` 条目（艾宾浩斯复习 + 导航栏统一化）保留不动
- 本次重构作为同日第二条追加在其后
- 其余历史条目全部保留原样

## 验收标准

1. README「功能特性」不再包含「成语词典集成」章节，不再提及 `/calc` 速算练习
2. README「功能特性」包含「搜索功能」「前端导航栏统一化」「设备指纹识别」三个新章节
3. README「主要路由」表不含 `/idioms`、`/calc`，不含辅助路由（`/favicon.ico`、`/api/debug/exercises`、`/quiz-img/:source/*`）
4. README「主要路由」表包含全部 44 条业务路由（页面 + API）
5. README「目录结构」不含 `calc.ejs`、`idioms.ejs`，包含 `partials/` 目录
6. README「工程约定」新增 EJS partial 机制、设备指纹中间件链、公开路径白名单三条
7. README「历史更新」保留全部 30+ 条历史条目，新增 1 条本次重构条目
8. README 内无 `TBD`、`TODO`、过时描述或与代码矛盾的内容

## 不在范围内

- 不改动 `PROJECT_RULES.md`（工程规则主版本，独立维护）
- 不改动 `api-reference.md`（已 gitignore）
- 不改动任何代码文件（仅 README.md）
- 不精简不合并历史更新条目
- 不重组工程约定章节结构
