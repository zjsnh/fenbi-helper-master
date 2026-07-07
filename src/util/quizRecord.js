// 本地题库练习记录管理器（按 userId 隔离）
// 写入 cache/quiz_records_<userId>.json，并提供合并到 exercise_history 的接口
const cache = require('./cacheUtil');

const RECORDS_KEY = 'quiz_records';

// 读取所有 quiz 记录（按 userId 隔离）
function readAll(userId) {
    if (!userId) return [];
    const cached = cache.readForUser(userId, RECORDS_KEY, 365 * 24 * 60 * 60 * 1000); // 1年
    if (cached && cached.records) return cached.records;
    return [];
}

// 写入所有 quiz 记录
function writeAll(userId, records) {
    if (!userId) return;
    cache.writeForUser(userId, RECORDS_KEY, { records }, 365 * 24 * 60 * 60 * 1000);
}

// 保存一条 quiz 记录
function saveRecord(userId, record) {
    if (!userId) return record;
    const records = readAll(userId);
    // 同一 recordId 替换
    const idx = records.findIndex(r => r.recordId === record.recordId);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    writeAll(userId, records);
    return record;
}

// 获取单条记录
function getRecord(userId, recordId) {
    if (!userId) return null;
    const records = readAll(userId);
    return records.find(r => r.recordId === recordId) || null;
}

// 列出所有记录（精简版，用于题库页进度展示）
function listSummary(userId) {
    return readAll(userId).map(r => ({
        setId: r.setId,
        setName: r.setName,
        source: r.source,
        bestRate: r.bestRate,
        lastRate: r.lastRate,
        doneCount: r.doneCount,
        lastTime: r.endTime
    }));
}

// 按 setId 聚合最佳成绩
function getSetProgress(userId, setId) {
    const records = readAll(userId).filter(r => r.setId === setId);
    if (records.length === 0) return { doneCount: 0, bestRate: null, lastRate: null };
    let best = -1, last = -1;
    records.forEach(r => {
        if (r.accuracy > best) best = r.accuracy;
    });
    last = records[records.length - 1].accuracy;
    return { doneCount: records.length, bestRate: best, lastRate: last };
}

// 获取所有题套进度，形如 { setId: { doneCount, bestRate, lastRate } }
function getAllSetProgress(userId) {
    const records = readAll(userId);
    const map = {};
    records.forEach(r => {
        if (!map[r.setId]) map[r.setId] = { doneCount: 0, bestRate: -1, lastRate: null };
        map[r.setId].doneCount++;
        if (r.accuracy > map[r.setId].bestRate) map[r.setId].bestRate = r.accuracy;
        map[r.setId].lastRate = r.accuracy;
        map[r.setId].lastTime = r.endTime;
    });
    return map;
}

module.exports = {
    saveRecord,
    getRecord,
    listSummary,
    getSetProgress,
    getAllSetProgress,
    readAll
};
