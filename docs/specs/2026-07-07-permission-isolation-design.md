# 权限隔离设计文档

- **日期**：2026-07-07
- **状态**：待实施
- **作者**：用户与 AI 协同设计

## 一、背景与目标

### 1.1 现状

fenbi-helper 项目目前**完全没有用户身份识别和数据隔离机制**：

- 仅靠 cookie 中是否存在 `userid` 子串判断登录态（17 处 `cookie.includes('userid')` 检查）
- 从不解析 userid 的值，不区分用户
- 所有持久化数据（练习记录、错题本、题库进度、词语统计）全局共享
- 本地题库模块（`/quiz`、`/quiz/:setId/submit`、上传/卸载/恢复题库）**完全没有权限检查**
- 设备指纹已实现但仅用于日志展示，未用于数据隔离

实际使用场景为**小团队/班级共用**：一个部署实例，多人通过局域网访问，各自登录粉笔账号刷题。

### 1.2 目标

1. **多用户数据隔离**：不同用户看到各自的练习记录、错题本、词语统计、题库进度，互不干扰
2. **角色权限控制**：区分管理员/普通用户，管理员才能卸载/恢复题库
3. **接口访问控制**：统一登录态校验中间件，未登录不能访问受保护接口
4. **普通用户可上传题库**：题库全局共享，普通用户能上传但不能卸载
5. **复用粉笔账号**：不引入独立账号系统，零额外登录成本

### 1.3 非目标（本次不实现）

以下能力**本次不实现**，但记录为后续路线图：

- 用户管理界面（查看用户列表、修改角色）
- 系统运维面板（全局统计、强制刷新任意用户缓存）
- 跨用户数据访问（管理员查看任意用户错题/记录，用于辅导班级成员）
- 登出功能
- 账号封禁/停用
- 找回密码、验证码

## 二、用户身份与角色

### 2.1 userId 提取

粉笔登录接口 `https://tiku.fenbi.com/api/users/loginV2` 返回的 Set-Cookie 中包含 `userid=<值>`。

- 提取方式：正则 `userid=(\w+)` 从 cookie 字符串提取
- 提取后挂到 `ctx.userId` / `ctx.state.userId`，全链路传递

### 2.2 用户表

**文件**：`cache/users.json`（cache/ 已 gitignore，含敏感数据）

**结构**：

```json
{
  "users": [
    {
      "userId": "12345678",
      "phone": "138****1234",
      "role": "admin",
      "createdAt": 1783500000000,
      "lastLoginAt": 1783500000000
    }
  ]
}
```

- **userId**：粉笔 userid，主键
- **phone**：登录时传入的手机号，脱敏存储（中间四位 `****`）
- **role**：`admin` 或 `user`，默认 `user`
- **createdAt**：首次登录时间
- **lastLoginAt**：每次登录更新

### 2.3 管理员配置

**文件**：`cache/admins.json`

**结构**：

```json
{ "adminPhones": ["13812345678", "13987654321"] }
```

- 登录时若手机号匹配 `adminPhones`，自动赋予 `admin` 角色
- 文件不存在或为空时，**首次登录的用户自动成为 admin**（兜底机制，避免锁死）
- 已存在的用户登录时，若手机号匹配 `adminPhones`，自动升级为 admin（支持后续添加管理员）

### 2.4 新增模块

**文件**：`src/util/userStore.js`

**API**：

| 函数 | 作用 |
|------|------|
| `getUserIdByCookie(cookie)` | 从 cookie 字符串提取 userid，无则返回 `''` |
| `upsertUser(userId, phone)` | 登录时创建/更新用户记录；脱敏手机号；更新 lastLoginAt；若匹配 adminPhones 则赋予 admin 角色 |
| `getUserRole(userId)` | 返回 `'admin'` / `'user'` / `null`（用户不存在） |
| `setUserRole(userId, role)` | 修改用户角色（预留，本次不开放 API） |
| `isAdmin(userId)` | 便捷判断 |
| `listUsers()` | 返回所有用户（预留，本次不开放 API） |
| `migrateLegacyDataIfNeeded(userId)` | 首次管理员登录时触发数据迁移（见第五章） |

## 三、数据隔离策略

### 3.1 按用户隔离的数据

| 当前文件 | 隔离后文件名 |
|---------|-------------|
| `cache/exercise_history.json` | `cache/exercise_history_<userId>.json` |
| `cache/quiz_records.json` | `cache/quiz_records_<userId>.json` |
| `cache/wrong_q_local_quiz.json` | `cache/wrong_q_local_quiz_<userId>.json` |
| `cache/word_frequency.json` | `cache/word_frequency_<userId>.json` |
| `cache/wrong_keypoint_tree.json` | `cache/wrong_keypoint_tree_<userId>.json` |
| `cache/wrong_q_<keypointId>.json` | `cache/wrong_q_<userId>_<keypointId>.json` |

### 3.2 全局共享（不隔离）的数据

| 文件 | 说明 |
|------|------|
| `uploaded-quizzes/config.json` | 题库配置（全局共享题库） |
| `uploaded-quizzes/<folder>/` | 题库文件 |
| `.deleted-quizzes/trash.json` | 回收站元数据 |
| `cache/search_modules.json` | 粉笔分类，固定 |
| `cache/users.json` | 用户表本身 |
| `cache/admins.json` | 管理员配置 |
| `cache/migration_done.json` | 迁移完成标记 |

### 3.3 cacheUtil 改造

**文件**：`src/util/cacheUtil.js`

**新增 API**：

```js
readForUser(userId, key, customExpireMs)   // 内部调用 read(key + '_' + userId, customExpireMs)
writeForUser(userId, key, value, expireMs) // 内部调用 write(key + '_' + userId, value, expireMs)
clearForUser(userId, prefix)               // 清除某用户某前缀缓存（如 wrong_q_<userId>_）
```

**保留原 API**：`read` / `write` / `clearByPrefix` / `getCacheTime` 供全局缓存使用（`search_modules`、`users.json` 等）。

### 3.4 quizRecord 改造

**文件**：`src/util/quizRecord.js`

- `saveRecord(record)` → `saveRecord(userId, record)`
- `getRecord(recordId)` → `getRecord(userId, recordId)`
- `readAll()` → `readAll(userId)`
- `getSetProgress(setId)` → `getSetProgress(userId, setId)`
- `getAllSetProgress()` → `getAllSetProgress(userId)`
- `listSummary()` → `listSummary(userId)`

内部所有 `cacheUtil.read('quiz_records')` / `cacheUtil.write('quiz_records', ...)` 改为 `cacheUtil.readForUser(userId, 'quiz_records')` / `cacheUtil.writeForUser(userId, 'quiz_records', ...)`。

## 四、权限中间件

### 4.1 新增模块

**文件**：`src/util/auth.js`

**导出**：

| 中间件 | 作用 |
|--------|------|
| `requireLogin` | 解析 cookie 提取 userId 挂到 `ctx.userId` / `ctx.state.userId`；未登录时 API 返回 401，页面重定向 `/setup?redirectPath=<原URL>` |
| `requireAdmin` | 先执行 requireLogin 逻辑；非管理员时 API 返回 403，页面重定向 `/quiz` |

### 4.2 应用方式

**全局中间件链**（app.js）：

```
设备指纹中间件（现有）
  → requireLogin 中间件（新增，用白名单放行公开路径）
    → 业务路由
```

**公开路径白名单**（不经过 requireLogin）：

- `/setup`、`/api/login`
- `/js/*`、`/quiz-img/*`、`/theme.css`、`/logo.svg`
- `/calc`、`/shenlun-format`

**路由级 requireAdmin**（仅管理员可访问）：

- `POST /api/quiz/uninstall`（卸载题库）
- `POST /api/quiz/restore`（恢复题库）

### 4.3 API 权限矩阵

| 操作 | 当前 | 改造后 |
|------|------|--------|
| 登录页 `/setup` | 无 | 公开 |
| 登录接口 `/api/login` | 无 | 公开 |
| 工具页 `/calc` `/shenlun-format` | 无 | 公开 |
| 题库图片 `/quiz-img/*` | 无 | 公开（题库全局共享） |
| 题库列表 `/quiz` | 无 | **requireLogin** |
| 做题 `/quiz/:setId` | 无 | **requireLogin** |
| 提交判分 `/quiz/:setId/submit` | 无 | **requireLogin**（写入当前用户数据） |
| 上传题库 `/api/quiz/upload-folder` | 无 | **requireLogin** |
| 查看记录 `/quiz-result/:recordId` | 无 | **requireLogin** + 校验记录归属当前用户 |
| 导出 PDF（各类） | 无 | **requireLogin** + 校验归属 |
| 卸载题库 `/api/quiz/uninstall` | 无 | **requireAdmin** |
| 恢复题库 `/api/quiz/restore` | 无 | **requireAdmin** |
| 查看回收站 `/api/quiz/trash` | 无 | **requireAdmin** |
| 历史记录/错题本/词语统计 | 部分 requireLogin | **requireLogin**（数据按 userId 隔离） |
| 刷新缓存 | requireLogin | **requireLogin**（仅刷自己的） |
| 保存笔记/收藏 | 无 | **requireLogin** |

### 4.4 资源归属校验

对于 `/quiz-result/:recordId` 和各类导出 PDF 接口：

- 从 `ctx.userId` 获取当前用户
- 调用 `quizRecord.getRecord(userId, recordId)` 读取记录
- 若返回 null（记录不存在或不属于该用户），返回 404
- 这样天然实现隔离：用户只能访问自己的记录

## 五、数据迁移

### 5.1 迁移触发时机

**延迟迁移**：首次管理员登录时触发。

原因：迁移时需要知道目标 userId，而 userId 在用户登录时才能获取。

### 5.2 迁移流程

1. 用户登录成功后，`upsertUser` 创建/更新用户记录
2. 调用 `migrateLegacyDataIfNeeded(userId)`：
   - 检查 `cache/migration_done.json` 是否存在
   - 若存在，直接返回（已迁移）
   - 若不存在，检查当前用户是否为 admin
   - 若非 admin，直接返回（等待管理员迁移）
   - 若为 admin，执行迁移：
     - 遍历第三章的 6 个文件，将全局文件重命名为带 `_<userId>` 后缀的版本
     - 对于 `wrong_q_<keypointId>.json` 这类多文件，用 glob 匹配所有 `wrong_q_*.json`（排除已带 userId 的），逐个重命名
     - 旧文件备份为 `.bak`（保留 7 天，后续可手动删）
     - 写入 `cache/migration_done.json`：`{ "migratedAt": <timestamp>, "userId": "<adminUserId>" }`

### 5.3 迁移的文件清单

```js
const LEGACY_FILES = [
  { old: 'exercise_history',    pattern: 'single' },
  { old: 'quiz_records',        pattern: 'single' },
  { old: 'wrong_q_local_quiz',  pattern: 'single' },
  { old: 'word_frequency',      pattern: 'single' },
  { old: 'wrong_keypoint_tree', pattern: 'single' },
  { old: 'wrong_q_',            pattern: 'prefix' }   // wrong_q_<keypointId>.json
];
```

- `single`：单个文件，直接重命名 `cache/<old>.json` → `cache/<old>_<userId>.json`
- `prefix`：前缀匹配，`cache/wrong_q_*.json` → `cache/wrong_q_<userId>_<原keypointId>.json`
  - **排除规则**：跳过 `wrong_q_local_quiz*`（已在 single 模式处理）和文件名中包含下划线分隔的 16 位以上十六进制串的文件（已带 userId，避免重复迁移）
  - **keypointId 提取**：从原文件名 `wrong_q_<keypointId>.json` 中剥离 `wrong_q_` 前缀和 `.json` 后缀得到

### 5.4 迁移失败处理

- 迁移过程中任一文件重命名失败，记录日志，继续迁移其余文件
- 迁移完成后无论是否有失败，都写入 `migration_done.json`（避免反复尝试）
- 失败的文件保留原状，管理员可手动处理

## 六、前端调整

### 6.1 全局上下文

所有 EJS 模板可通过 `ctx.state` 读取：

- `ctx.state.userId`：当前用户 ID
- `ctx.state.userPhone`：脱敏手机号（如 `138****1234`）
- `ctx.state.isAdmin`：布尔值

### 6.2 navbar 用户标识

所有页面的 navbar 右侧（"切换账号"链接之前）显示：

- 脱敏手机号（如 `138****1234`）
- 管理员额外显示蓝色 `admin` 徽章

### 6.3 题库列表页（quiz-list.ejs）

- **卸载按钮**：非管理员隐藏卸载按钮（仅显示做题入口）
- **回收站区域**：非管理员**完全隐藏**整个回收站区域（不显示、不加载、不渲染）
- 通过 `isAdmin` 标志控制，EJS 模板用 `<% if (isAdmin) { %>` 包裹

### 6.4 登录页（setup.ejs）

- 登录成功后，后端 `upsertUser` 创建/更新用户记录
- `redirectPath` 保持不变（默认 `/history-category-complex`）

## 七、新增文件清单

| 文件 | 作用 |
|------|------|
| `src/util/userStore.js` | 用户表管理（增删改查、角色判断、迁移） |
| `src/util/auth.js` | 权限中间件（requireLogin、requireAdmin） |
| `cache/users.json` | 用户表（运行时生成） |
| `cache/admins.json` | 管理员手机号配置（需手动创建） |
| `cache/migration_done.json` | 迁移完成标记（运行时生成） |

## 八、需修改文件清单

| 文件 | 改动 |
|------|------|
| `src/app.js` | 注册 requireLogin 全局中间件 + 公开路径白名单；路由级 requireAdmin；登录路由调用 upsertUser + migrateLegacyDataIfNeeded；所有路由从 `ctx.userId` 取用户传给业务层；移除 17 处 `cookie.includes('userid')` 散落检查 |
| `src/util/cacheUtil.js` | 新增 `readForUser` / `writeForUser` / `clearForUser` |
| `src/util/quizRecord.js` | 所有函数加 userId 参数，内部用 `cacheUtil.readForUser` / `writeForUser` |
| `src/service/exercisesResult.js` | `getExerciseHistory` / `getWrongQuestions` / `getWordFrequency` 等函数加 userId 参数；内部缓存读写改用 `readForUser` / `writeForUser`；`syncToExerciseHistory` / `syncWrongQuestionsToCache` 加 userId 参数 |
| `src/views/setup.ejs` | 无改动（登录流程不变，后端处理用户创建） |
| `src/views/quiz-list.ejs` | 卸载按钮/回收站区域用 `<% if (isAdmin) { %>` 包裹 |
| 所有 EJS 模板（navbar） | 显示用户标识和 admin 徽章 |

## 九、后续路线图（写入 PROJECT_RULES.md）

以下能力本次不实现，记录为后续待办：

- **用户管理界面**：管理员查看用户列表、修改用户角色、查看用户最近活动
- **系统运维面板**：全局统计、强制刷新任意用户缓存、查看系统状态
- **跨用户数据访问**：管理员查看任意用户错题/记录，用于辅导班级成员
- **登出功能**：主动清除登录态
- **账号封禁/停用**：管理员禁用某用户
- **找回密码、验证码**：与粉笔账号体系对齐

## 十、测试验证

### 10.1 基础功能

- [ ] 管理员手机号配置后，登录自动获得 admin 角色
- [ ] 普通用户登录后为 user 角色
- [ ] 未登录访问 `/quiz` 重定向到 `/setup?redirectPath=/quiz`
- [ ] 未登录调用 `/api/quiz/uninstall` 返回 401

### 10.2 数据隔离

- [ ] 用户 A 做题后，用户 B 看不到用户 A 的记录
- [ ] 用户 A 的错题本不包含用户 B 的错题
- [ ] 用户 A 刷新词语统计，不影响用户 B 的缓存
- [ ] `/quiz-result/:recordId` 只能访问自己的记录

### 10.3 权限控制

- [ ] 普通用户看不到卸载按钮
- [ ] 普通用户看不到回收站区域
- [ ] 普通用户调用卸载接口返回 403
- [ ] 普通用户可以上传题库
- [ ] 管理员可以卸载/恢复题库

### 10.4 数据迁移

- [ ] 首次管理员登录后，6 类文件正确迁移到带 userId 后缀
- [ ] 迁移后旧文件备份为 `.bak`
- [ ] 再次登录不重复迁移
- [ ] 普通用户登录不触发迁移

### 10.5 边界情况

- [ ] `admins.json` 不存在时，首个登录用户成为 admin
- [ ] cookie 中无 userid 时，`getUserIdByCookie` 返回空字符串
- [ ] 同一账号不同设备登录，数据互通（userId 相同）
