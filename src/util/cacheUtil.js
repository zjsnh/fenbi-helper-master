const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const EXPIRE_MS = 2 * 24 * 60 * 60 * 1000; // 2天（普通缓存）
const LONG_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000; // 30天（练习记录等需手动刷新的缓存）

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getCachePath(key) {
    // key中可能含/，替换为_
    let safeKey = String(key).replace(/[\/\\:]/g, '_');
    return path.join(CACHE_DIR, safeKey + '.json');
}

function readCache(key, customExpireMs) {
    let filePath = getCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    try {
        let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        let now = Date.now();
        let expireMs = customExpireMs || data._expireMs || EXPIRE_MS;
        if (data._cachedAt && (now - data._cachedAt) < expireMs) {
            return data;
        }
        return null; // 过期
    } catch (e) {
        return null;
    }
}

function writeCache(key, value, expireMs) {
    let filePath = getCachePath(key);
    let data = {
        _cachedAt: Date.now(),
        _expireMs: expireMs || EXPIRE_MS,
        ...value
    };
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    return data;
}

function isCacheValid(key) {
    let filePath = getCachePath(key);
    if (!fs.existsSync(filePath)) return false;
    try {
        let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data._cachedAt && (Date.now() - data._cachedAt) < EXPIRE_MS;
    } catch (e) {
        return false;
    }
}

// 获取缓存时间
function getCacheTime(key) {
    let filePath = getCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    try {
        let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return data._cachedAt || null;
    } catch (e) {
        return null;
    }
}

// 清除指定前缀的缓存
function clearByPrefix(prefix) {
    let files = fs.readdirSync(CACHE_DIR);
    let count = 0;
    files.forEach(f => {
        if (f.startsWith(prefix) && f.endsWith('.json')) {
            fs.unlinkSync(path.join(CACHE_DIR, f));
            count++;
        }
    });
    return count;
}

// ══════════════════════════════════════
//  按用户隔离的缓存读写
//  实际 key 为 `<key>_<userId>`，文件名形如 <key>_<userId>.json
// ══════════════════════════════════════
function readForUser(userId, key, customExpireMs) {
    if (!userId) return null;
    return readCache(key + '_' + userId, customExpireMs);
}

function writeForUser(userId, key, value, expireMs) {
    if (!userId) return null;
    return writeCache(key + '_' + userId, value, expireMs);
}

// 清除某用户某前缀的缓存：前缀形如 'wrong_q_'，将匹配 'wrong_q_<userId>_*.json'
function clearForUser(userId, prefix) {
    if (!userId) return 0;
    const fullPrefix = prefix + userId + '_';
    let files = fs.readdirSync(CACHE_DIR);
    let count = 0;
    files.forEach(f => {
        if (f.startsWith(fullPrefix) && f.endsWith('.json')) {
            fs.unlinkSync(path.join(CACHE_DIR, f));
            count++;
        }
    });
    return count;
}

module.exports = { readCache, writeCache, isCacheValid, getCacheTime, clearByPrefix, readForUser, writeForUser, clearForUser };
