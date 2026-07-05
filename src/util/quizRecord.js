// 本地题库练习记录管理器
// 写入 cache/quiz_records.json，并提供合并到 exercise_history 的接口
const fs = require('fs');
const path = require('path');
const cache = require('./cacheUtil');

const RECORDS_KEY = 'quiz_records';

// 读取所有 quiz 记录
function readAll() {
  const cached = cache.readCache(RECORDS_KEY, 365 * 24 * 60 * 60 * 1000); // 1年
  if (cached && cached.records) return cached.records;
  return [];
}

// 写入所有 quiz 记录
function writeAll(records) {
  cache.writeCache(RECORDS_KEY, { records }, 365 * 24 * 60 * 60 * 1000);
}

// 保存一条 quiz 记录
function saveRecord(record) {
  const records = readAll();
  // 同一 recordId 替换
  const idx = records.findIndex(r => r.recordId === record.recordId);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  writeAll(records);
  return record;
}

// 获取单条记录
function getRecord(recordId) {
  const records = readAll();
  return records.find(r => r.recordId === recordId) || null;
}

// 列出所有记录（精简版，用于题库页进度展示）
function listSummary() {
  return readAll().map(r => ({
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
function getSetProgress(setId) {
  const records = readAll().filter(r => r.setId === setId);
  if (records.length === 0) return { doneCount: 0, bestRate: null, lastRate: null };
  let best = -1, last = -1;
  records.forEach(r => {
    if (r.accuracy > best) best = r.accuracy;
  });
  last = records[records.length - 1].accuracy;
  return { doneCount: records.length, bestRate: best, lastRate: last };
}

// 获取所有题套进度，形如 { setId: { doneCount, bestRate, lastRate } }
function getAllSetProgress() {
  const records = readAll();
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
