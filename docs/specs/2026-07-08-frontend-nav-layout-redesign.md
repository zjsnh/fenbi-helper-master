# 前端导航栏与页面布局统一化设计

日期：2026-07-08
状态：已确认，待实施

## 背景

fenbi-helper 前端基于 Koa + EJS 服务端渲染，现有 13 个页面各自内联维护导航栏 HTML，导致三个核心问题：

1. **导航维护困难** — 修改一个链接需同步改动 13 个文件，容易遗漏
2. **页面布局不一致** — 各页面容器宽度、hero 区样式、间距规则各写各的
3. **功能入口不清晰** — 7 个导航项平铺，高频与低频功能没有区分

## 方案选择

**方案 A：EJS include + 后端中间件注入全局变量**（已确认）

- 将导航栏和 hero 区提取为 EJS partial，各页面通过 `include` 引入
- 不启用 koa-ejs layout 机制（当前 `layout: false` 保持不变）
- 后端新增中间件，把 `userPhone`/`isAdmin` 注入 `ctx.state`，所有路由自动获取
- 导航项分组：7 个主干平铺 + 1 个「工具」下拉收纳低频功能
- 统一所有页面的容器宽度、hero 区样式、内容间距

未选方案 B（逐路由改 render 调用）的原因：13 个路由都要改，容易遗漏；后续新路由也必须记得传参。

未选方案 C（koa-ejs layout 机制）的原因：改动量大、需重构所有 EJS 的 `<html>/<head>/<body>` 结构，与现有 `layout: false` 约定冲突；隐式契约增加 AI 编辑成本。

## 导航栏设计

### 导航项分组

**主干项（始终可见，7 个，词语类靠右）：**

| 标签     | 路由                        | 说明       |
| -------- | --------------------------- | ---------- |
| 练习总览 | `/history-category-complex` | 默认首页   |
| 每日记录 | `/history`                  |            |
| 错题复习 | `/wrong-questions`          |            |
| 题库刷题 | `/quiz`                     |            |
| 词频分析 | `/word-frequency`           | 词语类靠右 |
| 高频词语 | `/word-stats`               | 词语类靠右 |
| 成语词典 | `/idioms`                   | 词语类靠右 |

**下拉「工具」（hover 展开，2 个）：**

| 标签     | 路由             |
| -------- | ---------------- |
| 公文速查 | `/shenlun-format` |
| 速算练习 | `/calc`           |

**右侧固定区域：**

- 用户手机号 + 管理员金色徽章（含 tooltip）
- 「切换账号」链接 → `/setup`
- 设备指纹 badge（保留并统一显示）

### 技术实现

新建 `src/views/partials/navbar.ejs`，接口：

```ejs
<%- include('partials/navbar', {
    activePage: 'history-category-complex',
    userPhone: userPhone,
    isAdmin: isAdmin
}) %>
```

- `activePage` 精确匹配当前路由 path，用于高亮对应导航项
- 下拉菜单复用现有 `theme.css` 中的 `.nav-dropdown` 样式
- 设备指纹 badge 的 JS 初始化逻辑收入 partial 内
- partial 内对 `userPhone`/`isAdmin` 做 `typeof` 检查避免渲染报错

### 不包含在导航中的页面

以下页面不使用公共导航栏：

- `quiz-play.ejs` — 答题页，沉浸式全屏
- `exerciseResult.ejs` — 练习结果页
- `question.ejs` — 题目详情页
- `quiz-result.ejs` — 刷题结果页（保留导航但不在主干项）
- `setup.ejs` — 登录页
- `search.ejs` — 搜索页（低频，保留 include）

## 后端中间件设计

在登录校验中间件之后、路由注册之前，新增全局变量注入中间件：

```javascript
// 注入全局模板变量（userPhone/isAdmin）
app.use(async (ctx, next) => {
    if (ctx.userId) {
        const user = userStore.getUser(ctx.userId);
        if (user) {
            ctx.state.userPhone = user.phone || user.phoneRaw || '';
            ctx.state.isAdmin = userStore.isAdmin(ctx.userId);
        }
    }
    await next();
});
```

- 位置：登录校验中间件（第 91-96 行）之后，`router.routes()`（第 98 行）之前
- `ctx.state` 是 koa-ejs 读取的默认渲染变量对象，注入后所有 `ctx.render` 调用自动携带
- `userStore.getUser(userId)` 返回用户对象（含 phone 字段）
- `userStore.isAdmin(userId)` 返回 boolean

## 页面布局统一

### 统一结构模板

```html
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= pageTitle %> · 错题助手</title>
  <link rel="stylesheet" href="/theme.css">
  <script src="/device.js"></script>
  <style>
    /* 仅页面特有的样式 */
  </style>
</head>
<body>
  <%- include('partials/navbar', { activePage: 'xxx' }) %>

  <div class="container-wide">
    <%- include('partials/page-hero', { title: '页面标题', subtitle: '页面副标题' }) %>

    <!-- 页面内容 -->
  </div>
</body>
</html>
```

### 统一规则

1. **容器宽度：** 所有使用导航栏的页面统一为 `container-wide`（max-width: 1180px）
2. **Hero 区：** 提取为 `partials/page-hero.ejs`，使用 `theme.css` 中 `.page-hero` 基础样式（去掉各页面自定义的水墨渐变、pulse 动画等差异化背景）
3. **间距规范：** 卡片间距 8px（`margin-bottom: 8px`），区块间距 24px
4. **字体/颜色：** 沿用现有 Apple Design CSS 变量体系，不做变动
5. **device.js 引入：** 所有页面 `<head>` 统一 `<script src="/device.js"></script>`（当前无页面引入，badge 显示"设备 -"是降级态）

### Hero 区 partial 接口

```ejs
<%- include('partials/page-hero', {
    title: '练习记录',
    subtitle: '回顾每一次练习，追踪进步轨迹'
}) %>
```

支持额外 actions 插槽（某些页面 hero 右侧有按钮）：

```ejs
<%- include('partials/page-hero', {
    title: '本地题库',
    subtitle: '上传题库文件，开始刷题',
    actions: '<button class="btn btn-primary" onclick="openUploadModal()">上传题库</button>'
}) %>
```

## 需要改动的页面清单

以下 11 个页面需要替换导航栏为 partial include（quiz-result/search 保留但优先级低）：

| 页面                          | activePage 值                  | Hero 改动  |
| ----------------------------- | ------------------------------ | ---------- |
| `history-category-complex.ejs`| `history-category-complex`     | 替换       |
| `history-category.ejs`        | `history-category`             | 替换       |
| `history.ejs`                 | `history`                      | 替换       |
| `wrong-questions.ejs`         | `wrong-questions`              | 替换       |
| `word-frequency.ejs`          | `word-frequency`               | 替换       |
| `word-stats.ejs`              | `word-stats`                   | 替换       |
| `quiz-list.ejs`               | `quiz`                         | 替换       |
| `idioms.ejs`                  | `idioms`                       | 替换       |
| `calc.ejs`                    | `calc`                         | 替换       |
| `shenlun-format.ejs`          | `shenlun-format`               | 替换       |
| `review-plan.ejs`             | `review-plan`                  | 替换       |
| `search.ejs`                  | `search`                       | 替换       |
| `quiz-result.ejs`             | `quiz-result`                  | 替换       |

每个页面的改动模式：
1. 删除内联 `<div class="navbar">...</div>` 及相关 `<script>` 块
2. 在 `<body>` 开头插入 `<%- include('partials/navbar', { activePage: 'xxx' }) %>`
3. 将 hero 区替换为 `<%- include('partials/page-hero', { ... }) %>`
4. `<head>` 添加 `<script src="/device.js"></script>`
5. 清理页面专属 `<style>` 中被统一后不再需要的样式

## 不变的部分

- `theme.css` 全局组件样式体系（btn、card、tag、stats、table、empty-state 等）
- 各页面的业务逻辑 JavaScript
- 后端路由（`app.js`）和 API 接口
- `src/service/` 和 `src/util/` 工具模块

## 新建文件

```
src/views/partials/
  navbar.ejs      ← 导航栏组件
  page-hero.ejs   ← 页面头部组件
```

## 风险与注意事项

1. **EJS include 路径：** koa-ejs 配置的 `root` 为 `src/views/`，include 路径相对于 views 目录，partial 文件放在 `views/partials/` 下
2. **变量传递：** 通过 `ctx.state` 中间件注入，所有路由自动获取 `userPhone`/`isAdmin`；partial 内仍做 `typeof` 检查防御
3. **设备指纹 badge：** device.js 当前未被任何页面引入，统一在 partial 内引入并初始化
4. **回归测试：** 改动后需逐页面验证导航高亮、下拉菜单、链接跳转、响应式表现、用户信息展示
