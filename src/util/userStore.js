// 用户表管理：用户身份提取、角色判断、管理员配置、旧数据迁移
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const USERS_FILE = path.join(CACHE_DIR, 'users.json');
const ADMINS_FILE = path.join(CACHE_DIR, 'admins.json');
const MIGRATION_FLAG_FILE = path.join(CACHE_DIR, 'migration_done.json');

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ── 迁移清单：旧全局文件 → 带 _<userId> 后缀 ──
const LEGACY_FILES = [
    { old: 'exercise_history',    pattern: 'single' },
    { old: 'quiz_records',        pattern: 'single' },
    { old: 'wrong_q_local_quiz',  pattern: 'single' },
    { old: 'word_frequency',      pattern: 'single' },
    { old: 'wrong_keypoint_tree', pattern: 'single' },
    { old: 'wrong_q_',            pattern: 'prefix' }   // wrong_q_<keypointId>.json
];

// ══════════════════════════════════════
//  Cookie 中提取 userId
// ══════════════════════════════════════
function getUserIdByCookie(cookie) {
    if (!cookie) return '';
    const m = String(cookie).match(/userid=(\w+)/);
    return m ? m[1] : '';
}

// ══════════════════════════════════════
//  手机号脱敏：138****1234
// ══════════════════════════════════════
function maskPhone(phone) {
    if (!phone || phone.length !== 11) return phone || '';
    return phone.slice(0, 3) + '****' + phone.slice(7);
}

// ══════════════════════════════════════
//  读取用户表
// ══════════════════════════════════════
function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return { users: [] };
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (e) {
        return { users: [] };
    }
}

function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ══════════════════════════════════════
//  读取管理员手机号配置
// ══════════════════════════════════════
function readAdminPhones() {
    try {
        if (!fs.existsSync(ADMINS_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf-8'));
        return (data && data.adminPhones) || [];
    } catch (e) {
        return [];
    }
}

// ══════════════════════════════════════
//  创建/更新用户记录（登录时调用）
// ══════════════════════════════════════
function upsertUser(userId, phone) {
    if (!userId) return null;
    const data = readUsers();
    const adminPhones = readAdminPhones();
    const now = Date.now();
    const maskedPhone = maskPhone(phone);

    // 判断角色
    const isAdminPhone = phone && adminPhones.includes(phone);
    let role = isAdminPhone ? 'admin' : 'user';

    const existing = (data.users || []).find(u => u.userId === userId);
    if (existing) {
        existing.phone = maskedPhone;
        existing.lastLoginAt = now;
        // 已存在的用户：若手机号匹配 adminPhones，自动升级为 admin
        if (isAdminPhone) existing.role = 'admin';
        // 不主动降级（避免管理员手机号配置临时为空时丢失权限）
    } else {
        // 首次注册：若 admins.json 不存在或为空，首个用户成为 admin（兜底）
        if (!fs.existsSync(ADMINS_FILE) || adminPhones.length === 0) {
            const userCount = (data.users || []).length;
            if (userCount === 0) role = 'admin';
        }
        (data.users = data.users || []).push({
            userId,
            phone: maskedPhone,
            role,
            createdAt: now,
            lastLoginAt: now
        });
    }
    writeUsers(data);
    return existing || (data.users || []).find(u => u.userId === userId);
}

// ══════════════════════════════════════
//  角色查询
// ══════════════════════════════════════
function getUserRole(userId) {
    if (!userId) return null;
    const data = readUsers();
    const u = (data.users || []).find(u => u.userId === userId);
    return u ? u.role : null;
}

function setUserRole(userId, role) {
    if (!userId || (role !== 'admin' && role !== 'user')) return;
    const data = readUsers();
    const u = (data.users || []).find(u => u.userId === userId);
    if (u) { u.role = role; writeUsers(data); }
}

function isAdmin(userId) {
    return getUserRole(userId) === 'admin';
}

function listUsers() {
    return readUsers().users || [];
}

// 按 userId 查询用户（用于 navbar 展示脱敏手机号）
function getUser(userId) {
    if (!userId) return null;
    const data = readUsers();
    return (data.users || []).find(u => u.userId === userId) || null;
}

// ══════════════════════════════════════
//  旧数据迁移（首次管理员登录触发）
// ══════════════════════════════════════
function isMigrationDone() {
    return fs.existsSync(MIGRATION_FLAG_FILE);
}

function migrateLegacyDataIfNeeded(userId) {
    if (!userId) return { skipped: true, reason: 'no userId' };
    if (isMigrationDone()) return { skipped: true, reason: 'already migrated' };
    if (!isAdmin(userId)) return { skipped: true, reason: 'not admin, wait for admin' };

    console.log('[MIGRATE] 开始迁移旧数据到 userId=' + userId);
    let success = 0, failed = 0;
    const errors = [];

    LEGACY_FILES.forEach(item => {
        try {
            if (item.pattern === 'single') {
                const oldFile = path.join(CACHE_DIR, item.old + '.json');
                if (fs.existsSync(oldFile)) {
                    const newFile = path.join(CACHE_DIR, item.old + '_' + userId + '.json');
                    if (fs.existsSync(newFile)) {
                        // 目标已存在（用户已自行产生隔离数据）：保留新数据，只备份+删除旧文件
                        fs.copyFileSync(oldFile, oldFile + '.bak');
                        fs.unlinkSync(oldFile);
                        console.log('[MIGRATE] ' + item.old + '.json → 隔离文件已存在，保留新数据，旧文件备份为 .bak');
                    } else {
                        // 目标不存在：直接迁移
                        fs.copyFileSync(oldFile, newFile);
                        fs.copyFileSync(oldFile, oldFile + '.bak');
                        fs.unlinkSync(oldFile);
                        console.log('[MIGRATE] ' + item.old + '.json → ' + item.old + '_' + userId + '.json');
                    }
                    success++;
                }
            } else if (item.pattern === 'prefix') {
                // wrong_q_<keypointId>.json → wrong_q_<userId>_<keypointId>.json
                const files = fs.readdirSync(CACHE_DIR);
                files.forEach(f => {
                    if (!f.startsWith(item.old) || !f.endsWith('.json')) return;
                    if (f.endsWith('.bak')) return;
                    // 排除已在 single 模式处理的 wrong_q_local_quiz
                    if (f.startsWith('wrong_q_local_quiz')) return;
                    // 提取 keypointId：去掉 wrong_q_ 前缀和 .json 后缀
                    const keypointId = f.slice(item.old.length, -5);
                    if (!keypointId) return;
                    // 已带 userId 的文件跳过（避免重复迁移）
                    // 启发式判断：keypointId 段是否为纯数字或较短的串
                    // 旧 keypointId 通常是纯数字；userId 是粉笔的数字串
                    // 为避免误判，检查 migration_done 标记已足够
                    const oldFile = path.join(CACHE_DIR, f);
                    const newFile = path.join(CACHE_DIR, item.old + userId + '_' + keypointId + '.json');
                    if (fs.existsSync(newFile)) return; // 已存在则跳过
                    fs.copyFileSync(oldFile, newFile);
                    fs.copyFileSync(oldFile, oldFile + '.bak');
                    fs.unlinkSync(oldFile);
                    console.log('[MIGRATE] ' + f + ' → ' + item.old + userId + '_' + keypointId + '.json');
                    success++;
                });
            }
        } catch (e) {
            failed++;
            errors.push(item.old + ': ' + e.message);
            console.error('[MIGRATE] 失败 ' + item.old + ':', e.message);
        }
    });

    // 写入迁移完成标记（无论是否有失败，避免反复尝试）
    try {
        fs.writeFileSync(MIGRATION_FLAG_FILE, JSON.stringify({
            migratedAt: Date.now(),
            userId,
            success,
            failed,
            errors
        }, null, 2), 'utf-8');
    } catch (e) {
        console.error('[MIGRATE] 写入标记文件失败:', e.message);
    }

    console.log('[MIGRATE] 完成: 成功 ' + success + ' 个, 失败 ' + failed + ' 个');
    return { success, failed, errors };
}

module.exports = {
    getUserIdByCookie,
    upsertUser,
    getUserRole,
    setUserRole,
    isAdmin,
    isMigrationDone,
    migrateLegacyDataIfNeeded,
    listUsers,
    getUser,
    maskPhone
};
