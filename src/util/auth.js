// 权限中间件：requireLogin / requireAdmin
// 公开路径白名单：不经过 requireLogin 校验
const userStore = require('./userStore');

// 公开路径前缀（不经过 requireLogin）
const PUBLIC_PREFIXES = [
    '/setup',
    '/api/login',
    '/js/',
    '/quiz-img/',
    '/theme.css',
    '/logo.svg',
    '/image.png',
    '/favicon.ico',
    '/shenlun-format'
];

function isPublicPath(p) {
    return PUBLIC_PREFIXES.some(pre => p === pre || p.startsWith(pre));
}

// 内存缓存：迁移是否已完成（避免每次请求都读文件系统）
let _migrationDoneCache = null;

// 解析 cookie 提取 userId，挂到 ctx.userId / ctx.state.userId
// 未登录时：API 返回 401，页面重定向 /setup?redirectPath=<原URL>
async function requireLogin(ctx, next) {
    const cookie = ctx.request.headers['cookie'] || '';
    const userId = userStore.getUserIdByCookie(cookie);
    ctx.userId = userId;
    ctx.state = ctx.state || {};
    ctx.state.userId = userId;

    if (!userId) {
        // 公开路径直接放行（理论上不应进入，因为白名单已过滤）
        if (isPublicPath(ctx.path)) {
            return await next();
        }
        // API 返回 401
        if (ctx.path.startsWith('/api/') || ctx.method !== 'GET') {
            ctx.status = 401;
            ctx.body = { error: '请先登录' };
            return;
        }
        // 页面重定向到登录
        ctx.redirect('/setup?redirectPath=' + encodeURIComponent(ctx.originalUrl));
        return;
    }

    // 已登录：确保用户存在于用户表
    // 处理 cookie 还在但 users.json 不存在/被删除的情况（如部署权限系统后首次访问）
    let user = userStore.getUser(userId);
    if (!user) {
        // 自动创建用户（不知道手机号，传空字符串；兜底机制会让首个用户成为 admin）
        user = userStore.upsertUser(userId, '');
        console.log('[AUTH] 自动创建用户 userId=' + userId);
    }
    ctx.state.userPhone = user.phone || '';
    ctx.state.isAdmin = (user.role === 'admin');

    // 检查是否需要迁移（用内存缓存避免每次请求读文件系统）
    if (_migrationDoneCache === null) {
        _migrationDoneCache = userStore.isMigrationDone();
    }
    if (!_migrationDoneCache && user.role === 'admin') {
        try {
            const r = userStore.migrateLegacyDataIfNeeded(userId);
            if (!r.skipped) {
                console.log('[AUTH-AUTO-MIGRATE] 迁移结果:', r);
                _migrationDoneCache = true;
            } else if (r.reason === 'already migrated') {
                _migrationDoneCache = true;
            }
        } catch (e) {
            console.error('[AUTH-AUTO-MIGRATE] 迁移失败:', e.message);
        }
    }

    await next();
}

// 需要管理员权限：先执行 requireLogin 逻辑，非管理员 403/重定向
async function requireAdmin(ctx, next) {
    // 复用 requireLogin 的解析（假设 requireLogin 已作为全局中间件执行过）
    // 这里再做一次兜底解析，便于路由单独挂载
    if (!ctx.userId) {
        const cookie = ctx.request.headers['cookie'] || '';
        ctx.userId = userStore.getUserIdByCookie(cookie);
        ctx.state = ctx.state || {};
        ctx.state.userId = ctx.userId;
    }

    if (!ctx.userId) {
        if (ctx.path.startsWith('/api/') || ctx.method !== 'GET') {
            ctx.status = 401;
            ctx.body = { error: '请先登录' };
            return;
        }
        ctx.redirect('/setup?redirectPath=' + encodeURIComponent(ctx.originalUrl));
        return;
    }

    if (!userStore.isAdmin(ctx.userId)) {
        if (ctx.path.startsWith('/api/') || ctx.method !== 'GET') {
            ctx.status = 403;
            ctx.body = { error: '需要管理员权限' };
            return;
        }
        // 页面重定向到 /quiz
        ctx.redirect('/quiz');
        return;
    }

    await next();
}

module.exports = { requireLogin, requireAdmin, isPublicPath, PUBLIC_PREFIXES };
