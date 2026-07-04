# 粉笔助手（Fenbi Helper）

国考 / 公考备考刷题辅助工具，基于粉笔网题库 API，提供练习记录分析、错题本整理、词语频次统计、PDF 错题本导出等功能。本地部署，数据缓存于本地，保护隐私。

## 功能特性

### 练习记录分析
- 自动拉取**模考/真题**、**每日演练**、**专项智能练习** 三类练习记录（cursor 分页全量获取，不去重）
- 按分类树聚合展示，支持练习报告查看
- 单题详情页提供耗时分布图、知识点标签、收藏标记、笔记、评论、讲解视频
- 题目按原始顺序展示，导航栏一键切换「全部题目 / 仅错题」

### 错题本
- 按知识点分类树组织错题
- 支持刷新错题本、按知识点筛选
- 错题本 PDF 导出：题号深蓝醒目、题干加粗、选项中性灰，弱化装饰突出题目本身
- 题目内可写笔记、收藏、造句查询

### 词语频次统计
- 全错题本逻辑填空题选项词语自动提取
- 区分**四字成语**（全部统计）与**普通词语**（出现 >3 次统计）
- 点击词语可跳转关联错题
- 练习详情页的「逻辑填空词语统计」直接复用全错题本数据，确保词条完整

### 登录与认证
- 支持粉笔网账号密码登录（含图形验证码）
- Cookie 本地缓存，自动续期

## 技术栈

- **后端**：Node.js + Koa 2 + Koa-Router + koa-ejs（服务端渲染）
- **模板**：EJS
- **PDF 生成**：PDFKit
- **工具库**：lodash、moment、percentile、qs
- **图表**：ECharts（前端）
- **HTTP**：request
- **字体**：simhei.ttf / msyh.ttc / CascadiaMono.ttf（PDF 中文支持）

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
│   │   └── pdfGenerator.js        # 错题本 PDF 生成器
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
│       ├── setup.ejs             # 登录页
│       ├── theme.css             # 全局主题
│       └── js/                   # 前端静态资源（echarts、easymde 等）
├── fonts/                         # PDF 中文字体
├── fenbi-helper-design/          # 设计稿
├── cache/                        # 本地缓存（已 gitignore，含敏感数据）
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
| `/setup` | 登录页 |
| `/api/wrong-questions/pdf` | 导出错题本 PDF |
| `/api/debug/exercises` | 调试接口（探查分类与练习数据） |

## 数据与缓存

- 所有从粉笔 API 拉取的数据会缓存到本地 `cache/` 目录（JSON 文件）
- 缓存键包括：`exercise_history`、`word_frequency`、`wrong_keypoint_tree`、`search_modules` 等
- 部分页面支持 `?refresh=1` 强制重新拉取
- `cache/` 目录已加入 `.gitignore`，**不会上传到仓库**（含用户 cookie 等敏感数据）

## 工程约定

- 练习记录数据获取采用 **cursor 游标分页**，全量拉取不去重
- 三个 categoryId 并发拉取：`1=模考/真题`、`2=每日演练`、`3=专项智能练习`
- 词语统计区分成语（4 字汉字）与普通词（>3 次出现）
- 动态页面禁用浏览器缓存（`Cache-Control: no-store`），确保数据最新

## 部署

### Docker
项目根目录提供 `Dockerfile`，可构建镜像运行：

```bash
docker build -t fenbi-helper .
docker run -d -p 3000:3000 -v $(pwd)/cache:/app/cache fenbi-helper
```

## 历史更新

- **2026-07** 词语统计数据源切换为全错题本数据；按钮配色与 PDF 样式优化；新增每日演练数据拉取；分类树与历史记录聚合重构
- **2020-07** 讲解视频、PDF 导出、笔记、评论、耗时分析图、习题标签
- **2020-07-04** 题目展开收起、省市联考国考标签、收藏标记
- **2020-06-29** 初版上线

## 许可

仅供学习交流使用，请勿用于商业用途。
