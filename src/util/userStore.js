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

// ── 按用户隔离的缓存 key（userId 变化时需迁移重命名） ──
const USER_CACHE_KEYS = [
    'exercise_history',
    'quiz_records',
    'wrong_q_local_quiz',
    'word_frequency',
    'wrong_keypoint_tree',
    'wrong_review_state'
];
const USER_CACHE_PREFIX = 'wrong_q_'; // 前缀模式：wrong_q_<userId>_<keypointId>.json

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
//  userId 变化时迁移用户缓存文件
//  将 cache 目录下所有 <key>_<oldUserId>.json 和 wrong_q_<oldUserId>_<keypointId>.json
//  重命名为 <key>_<newUserId>.json / wrong_q_<newUserId>_<keypointId>.json
// ══════════════════════════════════════
function migrateUserCache(oldUserId, newUserId) {
    if (!oldUserId || !newUserId || oldUserId === newUserId) {
        return { moved: 0, skipped: 0, reason: 'same or empty userId' };
    }

    let moved = 0, skipped = 0;

    // single 模式：<key>_<oldUserId>.json → <key>_<newUserId>.json
    USER_CACHE_KEYS.forEach(key => {
        const oldFile = path.join(CACHE_DIR, key + '_' + oldUserId + '.json');
        const newFile = path.join(CACHE_DIR, key + '_' + newUserId + '.json');
        if (!fs.existsSync(oldFile)) return;
        if (fs.existsSync(newFile)) {
            // 新文件已存在（用户已用新 userId 产生数据），跳过避免覆盖
            skipped++;
            return;
        }
        try {
            fs.renameSync(oldFile, newFile);
            moved++;
        } catch (e) {
            console.error('[MIGRATE-CACHE] 重命名失败 ' + path.basename(oldFile) + ':', e.message);
            skipped++;
        }
    });

    // prefix 模式：wrong_q_<oldUserId>_<keypointId>.json → wrong_q_<newUserId>_<keypointId>.json
    const oldPrefix = USER_CACHE_PREFIX + oldUserId + '_';
    const newPrefix = USER_CACHE_PREFIX + newUserId + '_';
    let files = [];
    try {
        files = fs.readdirSync(CACHE_DIR);
    } catch (e) {
        files = [];
    }
    files.forEach(f => {
        if (!f.startsWith(oldPrefix) || !f.endsWith('.json')) return;
        if (f.endsWith('.bak')) return;
        const suffix = f.slice(oldPrefix.length); // <keypointId>.json
        const oldFile = path.join(CACHE_DIR, f);
        const newFile = path.join(CACHE_DIR, newPrefix + suffix);
        if (fs.existsSync(newFile)) {
            skipped++;
            return;
        }
        try {
            fs.renameSync(oldFile, newFile);
            moved++;
        } catch (e) {
            console.error('[MIGRATE-CACHE] 重命名失败 ' + f + ':', e.message);
            skipped++;
        }
    });

    console.log('[MIGRATE-CACHE] ' + oldUserId + ' → ' + newUserId + ': 迁移 ' + moved + ' 个, 跳过 ' + skipped + ' 个');
    return { moved, skipped };
}

// ══════════════════════════════════════
//  创建/更新用户记录（登录时调用）
//  关联策略：优先按完整手机号（phoneRaw）关联，userId 变化时自动迁移缓存
// ══════════════════════════════════════
function upsertUser(userId, phone) {
    if (!userId) return null;
    const data = readUsers();
    const adminPhones = readAdminPhones();
    const now = Date.now();
    const maskedPhone = maskPhone(phone);
    const rawPhone = phone ? String(phone).trim() : '';

    // 判断角色
    const isAdminPhone = rawPhone && adminPhones.includes(rawPhone);
    let role = isAdminPhone ? 'admin' : 'user';

    // 1. 优先按完整手机号关联（phone 非空时）
    //    同一手机号即使粉笔下发了新 userId，也能关联到旧用户记录与缓存数据
    if (rawPhone) {
        const byPhone = (data.users || []).find(u => u.phoneRaw === rawPhone);
        if (byPhone) {
            // userId 变化：迁移旧 userId 的缓存文件到新 userId
            if (byPhone.userId !== userId) {
                console.log('[USER] userId 变化: ' + byPhone.userId + ' → ' + userId + ' (phone=' + maskedPhone + ')');
                migrateUserCache(byPhone.userId, userId);
                byPhone.userId = userId;
            }
            byPhone.phone = maskedPhone;
            byPhone.phoneRaw = rawPhone;
            byPhone.lastLoginAt = now;
            if (isAdminPhone) byPhone.role = 'admin';
            writeUsers(data);
            return byPhone;
        }
    }

    // 2. 按 userId 查找（兼容旧数据或 phone 为空的情况）
    const existing = (data.users || []).find(u => u.userId === userId);
    if (existing) {
        existing.phone = maskedPhone;
        if (rawPhone) existing.phoneRaw = rawPhone;
        existing.lastLoginAt = now;
        if (isAdminPhone) existing.role = 'admin';
        writeUsers(data);
        return existing;
    }

    // 3. 新建用户
    if (!fs.existsSync(ADMINS_FILE) || adminPhones.length === 0) {
        const userCount = (data.users || []).length;
        if (userCount === 0) role = 'admin';
    }
    const newUser = {
        userId,
        phone: maskedPhone,
        phoneRaw: rawPhone,
        role,
        createdAt: now,
        lastLoginAt: now
    };
    (data.users = data.users || []).push(newUser);
    writeUsers(data);
    return newUser;
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
