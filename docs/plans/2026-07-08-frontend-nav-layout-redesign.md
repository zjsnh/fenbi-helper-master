# 前端导航栏与页面布局统一化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提取导航栏和 hero 区为 EJS partial，新增后端中间件注入全局变量，统一 13 个页面的导航栏和 hero 布局。

**Architecture:** 方案 A — EJS include + 后端中间件注入。新建 `partials/navbar.ejs` 和 `partials/page-hero.ejs`，后端新增中间件把 `userPhone`/`isAdmin` 注入 `ctx.state`，各页面通过 `include` 引入 partial 并删除内联导航栏。

**Tech Stack:** Koa + koa-ejs（layout: false, viewExt: ejs, cache: false）+ EJS include 机制

## Global Constraints

- koa-ejs 配置：`root: path.join(__dirname, 'views')`，`layout: false`，`viewExt: 'ejs'`，`cache: false`
- EJS include 路径相对于 views 目录，partial 文件放在 `src/views/partials/` 下
- partial 内对 `userPhone`/`isAdmin` 做 `typeof` 检查防御
- 后端中间件位置：登录校验中间件（app.js 第 91-96 行）之后，`router.routes()`（第 98 行）之前
- `userStore.getUser(userId)` 返回用户对象（含 phone 字段）
- `userStore.isAdmin(userId)` 返回 boolean
- 不改 `theme.css` 的现有样式（复用 `.navbar`/`.nav-dropdown`/`.page-hero`/`.container-wide`）
- 每次改动后需重启服务验证（`node src/app.js`）
- 遵循项目规则：每次推送前更新 README.md；根目录不散落临时文件

## 文件结构

**新建：**
- `src/views/partials/navbar.ejs` — 导航栏 partial，接收 `activePage` 参数高亮当前项，从 `ctx.state` 读取 `userPhone`/`isAdmin`
- `src/views/partials/page-hero.ejs` — Hero 区 partial，接收 `title`/`subtitle`/`actions` 参数

**修改：**
- `src/app.js` — 新增全局变量注入中间件（第 96-98 行之间）
- 13 个 EJS 页面 — 删除内联 navbar，改用 include 引入；hero 区改用 include；`<head>` 添加 `<script src="/device.js"></script>`

---

### Task 1: 新建 navbar partial

**Files:**
- Create: `src/views/partials/navbar.ejs`

**Interfaces:**
- Consumes: `activePage`（传入参数），`userPhone`/`isAdmin`（从 ctx.state 读取）
- Produces: 完整的 `<div class="navbar">...</div>` HTML 块 + device badge 初始化 script

- [ ] **Step 1: 创建 partials 目录和 navbar.ejs 文件**

创建 `src/views/partials/navbar.ejs`：

```ejs
<div class="navbar">
  <a href="/history-category-complex" class="logo"><img src="/logo.svg" alt="">错题助手</a>
  <a href="/history-category-complex"<%= typeof activePage !== 'undefined' && activePage === 'history-category-complex' ? ' class="active"' : '' %>>练习总览</a>
  <a href="/history"<%= typeof activePage !== 'undefined' && activePage === 'history' ? ' class="active"' : '' %>>每日记录</a>
  <a href="/wrong-questions"<%= typeof activePage !== 'undefined' && activePage === 'wrong-questions' ? ' class="active"' : '' %>>错题复习</a>
  <a href="/quiz"<%= typeof activePage !== 'undefined' && activePage === 'quiz' ? ' class="active"' : '' %>>题库刷题</a>
  <a href="/word-frequency"<%= typeof activePage !== 'undefined' && activePage === 'word-frequency' ? ' class="active"' : '' %>>词频分析</a>
  <a href="/word-stats"<%= typeof activePage !== 'undefined' && activePage === 'word-stats' ? ' class="active"' : '' %>>高频词语</a>
  <a href="/idioms"<%= typeof activePage !== 'undefined' && activePage === 'idioms' ? ' class="active"' : '' %>>成语词典</a>
  <div class="nav-dropdown">
    <span class="dropdown-toggle">工具 &#x25BE;</span>
    <div class="dropdown-menu">
      <a href="/shenlun-format"<%= typeof activePage !== 'undefined' && activePage === 'shenlun-format' ? ' class="active"' : '' %>>公文速查</a>
      <a href="/calc"<%= typeof activePage !== 'undefined' && activePage === 'calc' ? ' class="active"' : '' %>>速算练习</a>
    </div>
  </div>
  <% if (typeof userPhone !== 'undefined' && userPhone) { %><span class="nav-user"><span class="user-phone"><%= userPhone %></span><% if (typeof isAdmin !== 'undefined' && isAdmin) { %><span class="admin-badge">管理员<span class="admin-tooltip"><span class="tip-title">👑 管理员权限</span><span class="tip-item">卸载题库</span><span class="tip-item">恢复题库</span><span class="tip-item">查看回收站</span></span></span><% } %></span><% } else { %><span style="margin-left:auto;"></span><% } %>
  <a href="/setup">切换账号</a>
  <span id="deviceBadge" style="font-size:10px;color:var(--ink-400);padding:3px 8px;border:0.5px solid var(--g-200);border-radius:6px;font-family:var(--font-mono, monospace);" title="当前设备指纹">设备 -</span>
</div>
<script>
  (function () {
    function show() {
      var id = window.__DEVICE_ID__ || (window.getDeviceId && window.getDeviceId());
      if (id) {
        var el = document.getElementById('deviceBadge');
        if (el) el.textContent = '设备 ' + id.slice(0, 8);
      }
    }
    if (window.__DEVICE_ID__) show();
    else document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 100); });
  })();
</script>
```

- [ ] **Step 2: 验证 EJS 语法正确**

Run: `node -e "const ejs=require('ejs');ejs.render(require('fs').readFileSync('./src/views/partials/navbar.ejs','utf-8'),{activePage:'wrong-questions',userPhone:'138****0000',isAdmin:true});console.log('navbar.ejs 语法 OK');"`
Expected: 输出 `navbar.ejs 语法 OK`

- [ ] **Step 3: 提交**

```bash
git add src/views/partials/navbar.ejs
git commit -m "feat: 新建 navbar partial，提取导航栏组件"
```

---

### Task 2: 新建 page-hero partial

**Files:**
- Create: `src/views/partials/page-hero.ejs`

**Interfaces:**
- Consumes: `title`（字符串）、`subtitle`（字符串，可选）、`actions`（HTML 字符串，可选）
- Produces: `<div class="page-hero">...</div>` HTML 块

- [ ] **Step 1: 创建 page-hero.ejs 文件**

创建 `src/views/partials/page-hero.ejs`：

```ejs
<%
  const hasActions = typeof actions !== 'undefined' && actions;
  const heroStyle = hasActions ? 'display:flex;align-items:center;justify-content:space-between;' : '';
%>
<div class="page-hero"<%= heroStyle ? ' style="' + heroStyle + '"' : '' %>>
  <div>
    <div class="hero-title"><%= typeof title !== 'undefined' ? title : '' %></div>
    <% if (typeof subtitle !== 'undefined' && subtitle) { %>
    <div class="hero-sub"><%= subtitle %></div>
    <% } %>
  </div>
  <% if (hasActions) { %>
  <div class="hero-actions"><%- actions %></div>
  <% } %>
</div>
```

- [ ] **Step 2: 验证 EJS 语法正确**

Run: `node -e "const ejs=require('ejs');ejs.render(require('fs').readFileSync('./src/views/partials/page-hero.ejs','utf-8'),{title:'测试标题',subtitle:'测试副标题'});console.log('page-hero.ejs 语法 OK');"`
Expected: 输出 `page-hero.ejs 语法 OK`

- [ ] **Step 3: 验证带 actions 的渲染**

Run: `node -e "const ejs=require('ejs');const html=ejs.render(require('fs').readFileSync('./src/views/partials/page-hero.ejs','utf-8'),{title:'本地题库',subtitle:'上传题库',actions:'<button>上传</button>'});console.log('has hero-actions:',html.includes('hero-actions'));"`
Expected: 输出 `has hero-actions: true`

- [ ] **Step 4: 提交**

```bash
git add src/views/partials/page-hero.ejs
git commit -m "feat: 新建 page-hero partial，提取页面头部组件"
```

---

### Task 3: 新增后端全局变量注入中间件

**Files:**
- Modify: `src/app.js`（第 96-98 行之间，登录校验中间件之后，router.routes() 之前）

**Interfaces:**
- Consumes: `ctx.userId`（由登录中间件设置）、`userStore.getUser`/`userStore.isAdmin`
- Produces: `ctx.state.userPhone` 和 `ctx.state.isAdmin`，所有 `ctx.render` 调用自动携带

- [ ] **Step 1: 确认 userStore 已 require**

检查 `src/app.js` 顶部是否已 `require('./util/userStore')`。如果没有，在 require 区添加。

Run: `node -e "const s=require('fs').readFileSync('./src/app.js','utf-8');console.log('userStore required:',s.includes(\"require('./util/userStore')\")||s.includes('require(\\'./util/userStore\\')'));"`
Expected: 输出 `userStore required: true`（若为 false，在 app.js 顶部 require 区添加 `const userStore = require('./util/userStore');`）

- [ ] **Step 2: 在登录校验中间件后插入全局变量注入中间件**

定位 `src/app.js` 第 96 行 `});`（登录校验中间件结束）和第 98 行 `app.use(router.routes())` 之间，插入：

```javascript
// 注入全局模板变量（userPhone/isAdmin），所有 ctx.render 自动携带
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

- [ ] **Step 3: 语法检查**

Run: `node -c src/app.js`
Expected: 无输出（语法正确）

- [ ] **Step 4: 重启服务验证**

Run: `node src/app.js`（后台运行）
Expected: 输出 `服务已启动：...`

- [ ] **Step 5: 访问页面验证 ctx.state 注入生效**

用浏览器访问 `http://localhost:3000/history-category-complex`，检查页面导航栏右侧是否显示手机号（登录态下）。
Expected: 导航栏右侧显示手机号（而非空白）

- [ ] **Step 6: 提交**

```bash
git add src/app.js
git commit -m "feat: 新增全局变量注入中间件，ctx.state 携带 userPhone/isAdmin"
```

---

### Task 4: 改造 history-category-complex.ejs（首个验证页面）

**Files:**
- Modify: `src/views/history-category-complex.ejs`

**Interfaces:**
- Consumes: `partials/navbar`、`partials/page-hero`、`ctx.state.userPhone`/`ctx.state.isAdmin`

作为首个改造页面，验证 partial include 机制和中间件注入是否正常工作。

- [ ] **Step 1: 读取现有 navbar 和 hero 区结构**

读取 `src/views/history-category-complex.ejs` 第 325-370 行，记录现有 navbar HTML（第 330-341 行）和 hero 区（第 357-370 行）的内容。注意 hero 区有 `style="display:flex;align-items:center;justify-content:space-between;"`，需要用 actions 参数。

- [ ] **Step 2: 替换 navbar 为 include**

删除第 330-355 行（`<div class="navbar">...</div>` 及其后的 `<script>` 块），替换为：

```ejs
  <%- include('partials/navbar', { activePage: 'history-category-complex' }) %>
```

- [ ] **Step 3: 替换 hero 区为 include**

删除第 357-370 行的 `<div class="page-hero">...</div>` 块，替换为：

```ejs
    <%- include('partials/page-hero', {
        title: '练习记录',
        subtitle: '回顾每一次练习，追踪进步轨迹',
        actions: '<button class="btn btn-ghost" onclick="exportHistoryPdf()">导出PDF</button>'
    }) %>
```

注意：需保留原 hero 区内 actions 按钮的 onclick 逻辑（exportHistoryPdf 等），从原代码提取。

- [ ] **Step 4: 在 `<head>` 添加 device.js 引入**

在 `<head>` 内 `<link rel="stylesheet" href="/theme.css">` 之后添加：

```ejs
  <script src="/device.js"></script>
```

- [ ] **Step 5: 重启服务并验证**

Run: `node src/app.js`
访问 `http://localhost:3000/history-category-complex`
Expected: 导航栏显示完整 7 个主干项 + 工具下拉 + 手机号 + 设备 badge；hero 区显示标题、副标题、导出按钮；当前页"练习总览"高亮

- [ ] **Step 6: 提交**

```bash
git add src/views/history-category-complex.ejs
git commit -m "refactor: history-category-complex 改用 navbar/page-hero partial"
```

---

### Task 5: 改造剩余 12 个页面（批量执行）

**Files:**
- Modify: `src/views/history-category.ejs`
- Modify: `src/views/history.ejs`
- Modify: `src/views/wrong-questions.ejs`
- Modify: `src/views/word-frequency.ejs`
- Modify: `src/views/word-stats.ejs`
- Modify: `src/views/quiz-list.ejs`
- Modify: `src/views/idioms.ejs`
- Modify: `src/views/calc.ejs`
- Modify: `src/views/shenlun-format.ejs`
- Modify: `src/views/review-plan.ejs`
- Modify: `src/views/search.ejs`
- Modify: `src/views/quiz-result.ejs`

每个页面执行相同模式：删除内联 navbar + hero，改用 include 引入。

- [ ] **Step 1: 改造 history-category.ejs**

activePage: `history-category`
hero: title=`分类练习记录`，subtitle=`按知识点分类回顾练习`（从原 hero 读取实际文案）

- [ ] **Step 2: 改造 history.ejs**

activePage: `history`
hero: title=`每日记录`，subtitle=`按日期查看练习记录`（从原 hero 读取实际文案）
注意：history.ejs 用的是 `container list-view` 而非 `container-wide`，保留其容器类名不变（只改 navbar 和 hero）

- [ ] **Step 3: 改造 wrong-questions.ejs**

activePage: `wrong-questions`
hero: title=`错题本`，subtitle=`按知识点归类错题，追踪掌握进度`（从原 hero 读取实际文案）

- [ ] **Step 4: 改造 word-frequency.ejs**

activePage: `word-frequency`
hero: title=`词频分析`，subtitle=`分析错题中的高频词语`（从原 hero 读取实际文案）

- [ ] **Step 5: 改造 word-stats.ejs**

activePage: `word-stats`
hero: 从原 `page-header` 读取文案。word-stats 用的是 `<div class="page-wrap"><div class="page-header"><h2>高频词语统计</h2></div>`，不是标准 page-hero，改用 page-hero partial 后需调整外层容器。

- [ ] **Step 6: 改造 quiz-list.ejs**

activePage: `quiz`
hero: title=`本地题库`，subtitle=`上传题库文件，开始刷题`，actions=`<button class="btn btn-primary" onclick="openUploadModal()">上传题库</button>`（从原 hero 读取实际按钮）

- [ ] **Step 7: 改造 idioms.ejs**

activePage: `idioms`
hero: 同 word-stats，从 `page-header` 读取文案，调整为 page-hero。

- [ ] **Step 8: 改造 calc.ejs**

activePage: `calc`
hero: 从 `.calc-hero` 读取文案（title=`速算练习`，subtitle=`心算训练，提升数字敏感度`）。calc 用的是 `.calc-wrap` 容器（max-width 640px），保留其容器不变。

- [ ] **Step 9: 改造 shenlun-format.ejs**

activePage: `shenlun-format`
hero: 从原 hero 读取实际文案。

- [ ] **Step 10: 改造 review-plan.ejs**

activePage: `review-plan`
hero: title=`复习规划`，subtitle=`选择起点日期，按艾宾浩斯间隔（1/2/4/7/15/30 天）重排复习计划`（从原 hero 读取实际文案）

- [ ] **Step 11: 改造 search.ejs**

activePage: `search`
hero: 从原 hero 读取实际文案。

- [ ] **Step 12: 改造 quiz-result.ejs**

activePage: `quiz-result`
hero: 从原 hero 读取实际文案。

- [ ] **Step 13: 每个页面改完后重启服务，浏览器访问验证**

每改完一个页面，重启服务（`node src/app.js`）并访问对应路由，检查：
- 导航栏 7 主干项 + 工具下拉正常显示
- 当前页对应导航项高亮
- hero 区标题副标题正确
- 手机号 + 管理员徽章显示（登录态）
- 设备 badge 显示设备 ID（非"设备 -"）

- [ ] **Step 14: 提交所有页面改动**

```bash
git add src/views/history-category.ejs src/views/history.ejs src/views/wrong-questions.ejs src/views/word-frequency.ejs src/views/word-stats.ejs src/views/quiz-list.ejs src/views/idioms.ejs src/views/calc.ejs src/views/shenlun-format.ejs src/views/review-plan.ejs src/views/search.ejs src/views/quiz-result.ejs
git commit -m "refactor: 12 个页面改用 navbar/page-hero partial 统一布局"
```

---

### Task 6: 清理冗余样式与最终验证

**Files:**
- Modify: 各页面的 `<style>` 块（清理被统一后不再需要的 navbar/hero 自定义样式）

- [ ] **Step 1: 检查各页面是否有冗余的 navbar/hero 样式**

用 Grep 搜索各页面 `<style>` 块中是否还有 `.navbar`、`.page-hero`、`.hero-title`、`.hero-sub` 的自定义样式（这些已在 theme.css 定义，页面级覆盖应删除）。

Run: `grep -n "\.navbar\|\.page-hero\|\.hero-title\|\.hero-sub" src/views/*.ejs | grep -v "class=" | grep -v "<%-" | grep -v "partials/"`
Expected: 无输出或只有注释行

- [ ] **Step 2: 清理发现的冗余样式**

对每个发现的冗余样式，从页面 `<style>` 块中删除。注意保留页面特有样式（如 calc.ejs 的 `.calc-hero`）。

- [ ] **Step 3: 全站回归验证**

重启服务，逐页面访问以下路由，验证导航栏、hero、下拉菜单、用户信息、设备 badge 全部正常：
- `/history-category-complex`
- `/history-category`
- `/history`
- `/wrong-questions`
- `/word-frequency`
- `/word-stats`
- `/idioms`
- `/quiz`
- `/calc`
- `/shenlun-format`
- `/review-plan`
- `/search`
- `/quiz-result/<某个有效 recordId>`

Expected: 所有页面导航栏一致、hero 布局统一、当前页高亮、用户信息显示

- [ ] **Step 4: 提交清理改动**

```bash
git add src/views/*.ejs
git commit -m "refactor: 清理各页面冗余的 navbar/hero 自定义样式"
```

---

### Task 7: 更新 README.md 并推送

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README.md 的「历史更新」章节**

在历史更新章节顶部追加：

```markdown
## 2026-07-08
- 前端导航栏与页面布局统一化：提取 `partials/navbar.ejs` 和 `partials/page-hero.ejs`，13 个页面改用 include 引入
- 新增后端全局变量注入中间件，`ctx.state` 自动携带 `userPhone`/`isAdmin`
- 导航项分组：7 个主干平铺（练习总览/每日记录/错题复习/题库刷题/词频分析/高频词语/成语词典）+ 工具下拉（公文速查/速算练习）
- 统一 device.js 引入，设备指纹 badge 全站显示
```

- [ ] **Step 2: 更新 README.md 的「目录结构」章节（如有）**

在目录结构中添加 `src/views/partials/` 目录说明。

- [ ] **Step 3: 提交并推送**

```bash
git add README.md
git commit -m "docs: 更新 README 记录导航栏统一化改动"
git push
```

---

## 验收标准

1. 所有 13 个页面的导航栏 HTML 来自 `partials/navbar.ejs`，无内联重复
2. 所有页面的 hero 区来自 `partials/page-hero.ejs`
3. 导航栏显示 7 主干项 + 工具下拉（公文速查/速算练习）
4. 当前页对应导航项高亮
5. 登录态下所有页面显示手机号 + 管理员徽章（管理员账号）
6. 所有页面显示设备指纹 badge（真实设备 ID，非"设备 -"）
7. 所有页面 `<head>` 引入 `device.js`
8. 无页面残留冗余的 navbar/hero 自定义样式
9. `node -c src/app.js` 语法检查通过
10. README.md 已更新

## 风险点

1. **word-stats/idioms/calc 页面容器非 container-wide** — 改造时保留原容器类名，只替换 navbar 和 hero
2. **quiz-result 路由带参数** — 验证时需用有效的 recordId
3. **EJS include 路径** — koa-ejs root 是 `src/views/`，include 路径 `partials/navbar` 正确
4. **device.js 首次引入** — 需确认 `serve` 中间件已托管 `/device.js`（`app.use(serve(__dirname + '/views/js'))` 已配置）
