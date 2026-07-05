// 成语词典加载器
// 从「言语成语表_结构化.csv」加载成语 → { 释义, 考频, 组主题 } 的查询表
// CSV 格式：组号,组主题,成语,释义,考频
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', '..', '言语成语表_结构化.csv');

let dict = null;   // Map<成语, {definition, freq, theme}>

function parseCsvLine(line) {
  // 简单 CSV 解析：5 列，以逗号分隔；释义中可能含逗号但前面 3 列+考频在末尾，可分段切
  // 安全切法：按逗号 split 成 5 段（释义内含的逗号保留在中间）
  // 但释义中确实可能有逗号 → 采用：前 3 个逗号切前 4 列，最后一段为考频
  const parts = line.split(',');
  if (parts.length < 5) return null;
  const groupNo = parts[0].trim();
  const theme = parts[1].trim();
  const idiom = parts[2].trim();
  const freq = parts[parts.length - 1].trim();
  const definition = parts.slice(3, parts.length - 1).join(',').trim();
  return { groupNo, theme, idiom, definition, freq };
}

function load() {
  if (dict) return dict;
  if (!fs.existsSync(CSV_PATH)) {
    console.warn('[IDIOM-DICT] CSV 不存在:', CSV_PATH);
    dict = new Map();
    return dict;
  }
  dict = new Map();
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = text.split(/\r?\n/);
  // 跳过表头
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const row = parseCsvLine(line);
    if (!row || !row.idiom) continue;
    dict.set(row.idiom, {
      definition: row.definition,
      freq: Number(row.freq) || 0,
      theme: row.theme,
      groupNo: Number(row.groupNo) || 0,
    });
  }
  console.log('[IDIOM-DICT] 已加载', dict.size, '条成语词典');
  return dict;
}

// 查询单个成语：返回 {definition, freq, theme, groupNo} 或 null
function lookup(idiom) {
  const d = load();
  return d.get(idiom) || null;
}

// 批量查询：给词语数组 [{word, ...}] 注入 definition/freq/theme 字段
function enrich(words) {
  if (!words || words.length === 0) return words;
  const d = load();
  return words.map(w => {
    const meta = d.get(w.word);
    return {
      ...w,
      definition: meta ? meta.definition : '',
      freq: meta ? meta.freq : 0,
      theme: meta ? meta.theme : '',
    };
  });
}

module.exports = { load, lookup, enrich };
