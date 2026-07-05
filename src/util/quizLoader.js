// 本地题库加载器
// 启动时扫描题库目录，加载 xlsx / apkg 到内存，统一数据结构
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
let initSqlJs;

const ROOT = path.join(__dirname, '..', '..');

// 题库目录配置（source 用完整文件夹名作为分类标题）
// ext: 文件扩展名（xlsx / apkg）
const QUIZ_DIRS = [
  { dir: '【1】片段阅读600题题库', source: '【1】片段阅读600题题库', prefix: 'fr', ext: 'xlsx' },
  { dir: '【5】花生逻辑推理600题题库', source: '【5】花生逻辑推理600题题库', prefix: 'lr', ext: 'xlsx' },
  { dir: '【4】红领巾言语理解600题', source: '【4】红领巾言语理解600题', prefix: 'hlj', ext: 'apkg' }
];

// 内存中的题套列表
// setId -> { setId, source, setName, sheetName, questions: [...] }
const setsMap = new Map();

// 全局题号索引: questionUid -> { setId, qNo }
const questionIndex = new Map();

function naturalSort(a, b) {
  const na = parseInt(String(a).match(/\d+/g).join(''), 10);
  const nb = parseInt(String(b).match(/\d+/g).join(''), 10);
  return na - nb;
}

function readXlsx(filePath) {
  const wb = xlsx.readFile(filePath);
  const result = {};
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    result[name] = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  });
  return result;
}

// 将原始行转为统一题目对象
// 片段阅读表头: 题号 / 题干 / 选项A / 选项B / 选项C / 选项D / 答案 / 解析 / 知识点
// 逻辑推理表头: 序号 / 题型 / 题目 / 选项A~F / 答案 / 解析 / 知识点 / 图片URL
function parseQuestion(row, header, source, setId, qNo) {
  const get = (key) => {
    const idx = header.indexOf(key);
    return idx >= 0 ? row[idx] : '';
  };

  // 选项列：收集 A-F
  const optionKeys = ['选项A', '选项B', '选项C', '选项D', '选项E', '选项F'];
  const options = [];
  optionKeys.forEach(k => {
    const v = get(k);
    if (v !== '' && v !== undefined && v !== null) {
      options.push(String(v));
    }
  });

  // 题干
  const stem = get('题干') || get('题目') || '';

  // 答案规范化为字母字符串
  let answer = String(get('答案') || '').trim().toUpperCase();
  // 仅保留第一个字母
  const m = answer.match(/[A-F]/);
  answer = m ? m[0] : '';

  // 解析
  const analysis = get('解析') || '';

  // 知识点
  const knowledge = get('知识点') || '';

  // 题型（仅逻辑推理有）
  const type = get('题型') || '单选';

  // 图片URL（仅逻辑推理有）
  let imageUrl = get('图片URL') || '';
  imageUrl = String(imageUrl).trim();

  // 全局唯一ID
  const uid = setId + '_q' + qNo;

  return {
    uid,            // 全局唯一 ID
    setId,          // 所属题套 ID
    source,         // 来源：片段阅读 / 逻辑推理
    qNo,            // 题套内序号
    type,           // 题型
    stem,           // 题干
    options,        // 选项数组（4 或 6 个）
    answer,         // 正确答案字母 A/B/C/D/E/F
    analysis,       // 解析
    knowledge,      // 知识点
    imageUrl        // 图片URL（可能为空）
  };
}

function loadDir(cfg) {
  const dirPath = path.join(ROOT, cfg.dir);
  if (!fs.existsSync(dirPath)) {
    console.log('[quizLoader] 目录不存在: ' + dirPath);
    return;
  }
  const ext = cfg.ext || 'xlsx';
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.' + ext)).sort(naturalSort);
  console.log('[quizLoader] ' + cfg.source + ': ' + files.length + ' 个 ' + ext + ' 文件');

  files.forEach((file, fileIdx) => {
    const full = path.join(dirPath, file);
    try {
      let questions = [];
      let sheetName = '';

      if (ext === 'xlsx') {
        const data = readXlsx(full);
        sheetName = Object.keys(data)[0];
        const rows = data[sheetName];
        if (!rows || rows.length < 2) return;
        const header = rows[0].map(h => String(h).trim());
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          const q = parseQuestion(row, header, cfg.source, '', i);
          if (q.stem) questions.push(q);
        }
      } else if (ext === 'apkg') {
        questions = parseApkgFile(full, cfg.source);
        sheetName = 'anki';
      }

      if (questions.length === 0) return;

      // setId：取文件名最后一个数字段作为套号
      const numMatches = String(file).match(/(\d+)/g) || [];
      const seqNum = numMatches.length > 0 ? parseInt(numMatches[numMatches.length - 1], 10) : (fileIdx + 1);
      const setId = cfg.prefix + '_' + String(seqNum).padStart(3, '0');

      // 题套名（去扩展名，保留中文）
      const setName = file.replace(new RegExp('\\.' + ext + '$'), '');

      // 补全 setId 与 questionIndex
      questions.forEach((q, i) => {
        q.setId = setId;
        q.uid = setId + '_q' + (i + 1);
        questionIndex.set(q.uid, { setId, qNo: i + 1 });
      });

      setsMap.set(setId, {
        setId,
        source: cfg.source,
        setName,
        sheetName,
        file,
        questionCount: questions.length,
        questions
      });
    } catch (e) {
      console.log('[quizLoader] 读取失败 ' + file + ': ' + e.message);
    }
  });
}

// ── apkg 解析 ──
// apkg 本质是 ZIP，内含 collection.anki2（SQLite），notes 表的 flds 字段用 \x1f 分隔 7 个字段：
// [题型, 题号, 题干, 选项, 答案, 解析, 知识点]
async function loadApkgModule() {
  if (initSqlJs) return initSqlJs;
  initSqlJs = require('sql.js');
  return initSqlJs;
}

function parseApkgFile(filePath, source) {
  // 同步解压 + 读取 SQLite（sql.js 是同步 API，但加载 wasm 是异步，提前在 loadAll 里 await）
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(filePath);
  const entry = zip.getEntries().find(e => e.entryName === 'collection.anki2');
  if (!entry) return [];
  const buf = entry.getData(); // Buffer

  const SQL = require('sql.js');
  // sql.js 在 Node 下提供同步 Database（initSqlJs 是异步，但已缓存后 require 即可用）
  // 这里用同步方式：调用 loadDbSync（sql.js 0.x 不支持），改为先 init 再用
  // 实际：parseApkgFile 由 parseApkgFileAsync 调用，parseApkgFileAsync 已 await initSqlJs
  // 为保证同步可用，直接用全局已 init 的 SQL.Database
  if (!global._sqlJsReady) {
    throw new Error('sql.js 未初始化，请先调用 loadAll()');
  }
  const db = new global._SQL.Database(buf);

  const res = db.exec('SELECT flds FROM notes ORDER BY id ASC');
  const questions = [];
  if (res.length) {
    res[0].values.forEach((row, idx) => {
      const flds = row[0];
      const parts = flds.split('\x1f'); // 7 字段
      if (parts.length < 5) return;
      const type = (parts[0] || '单选').trim();
      const qNoStr = (parts[1] || '').trim();
      const stem = (parts[2] || '').trim();
      const optionsRaw = parts[3] || '';
      const answer = (parts[4] || '').trim().toUpperCase().substring(0, 1);
      const analysis = parts[5] || '';
      const knowledge = parts[6] || '';

      // 选项拆分：格式 "A. xxx<br>B. yyy<br>C. zzz<br>D. www"
      const options = [];
      const optParts = optionsRaw.split(/<br\s*\/?>/i);
      optParts.forEach(p => {
        const t = p.trim();
        if (t) options.push(t);
      });

      if (!stem) return;

      questions.push({
        uid: '',               // 后续补全
        setId: '',             // 后续补全
        source,
        qNo: idx + 1,
        type,
        stem,
        options,
        answer,
        analysis,
        knowledge: knowledge.trim(),
        imageUrl: ''
      });
    });
  }

  db.close();
  return questions;
}

async function loadAll() {
  if (setsMap.size > 0) return; // 已加载
  console.log('[quizLoader] 开始加载题库...');

  // 初始化 sql.js（用于解析 apkg）
  const hasApkg = QUIZ_DIRS.some(c => c.ext === 'apkg');
  if (hasApkg && !global._sqlJsReady) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    global._sqlJsReady = SQL;
    global._SQL = SQL;
    console.log('[quizLoader] sql.js 初始化完成');
  }

  QUIZ_DIRS.forEach(loadDir);
  console.log('[quizLoader] 加载完成，共 ' + setsMap.size + ' 套题，' + questionIndex.size + ' 道题');
}

// 列出所有题套，按来源分组
async function listSets() {
  await loadAll();
  const groups = {};
  setsMap.forEach(s => {
    if (!groups[s.source]) groups[s.source] = [];
    groups[s.source].push({
      setId: s.setId,
      setName: s.setName,
      source: s.source,
      questionCount: s.questionCount
    });
  });
  // 排序
  Object.keys(groups).forEach(k => groups[k].sort((a, b) => a.setId.localeCompare(b.setId)));
  return groups;
}

// 获取某套题完整内容（含题目）
async function getSet(setId) {
  await loadAll();
  const s = setsMap.get(setId);
  if (!s) return null;
  return {
    setId: s.setId,
    source: s.source,
    setName: s.setName,
    sheetName: s.sheetName,
    questionCount: s.questionCount,
    questions: s.questions
  };
}

// 获取单题
async function getQuestion(uid) {
  await loadAll();
  const meta = questionIndex.get(uid);
  if (!meta) return null;
  const s = setsMap.get(meta.setId);
  if (!s) return null;
  return s.questions[meta.qNo - 1] || null;
}

module.exports = { loadAll, listSets, getSet, getQuestion };
