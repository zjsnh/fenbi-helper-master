// 本地题库加载器
// 启动时扫描题库目录，加载 xlsx / apkg 到内存，统一数据结构
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
let initSqlJs;

const ROOT = path.join(__dirname, '..', '..');

// 上传题库存放根目录（相对项目根）
const UPLOADED_BASE = 'uploaded-quizzes';
const UPLOADED_CONFIG_FILE = path.join(ROOT, UPLOADED_BASE, 'config.json');

// 题库目录配置（source 用完整文件夹名作为分类标题）
// ext: 文件扩展名（xlsx / apkg）
const QUIZ_DIRS = [
  { dir: '【1】片段阅读600题题库', source: '【1】片段阅读600题题库', prefix: 'fr', ext: 'xlsx' },
  { dir: '【5】花生逻辑推理600题题库', source: '【5】花生逻辑推理600题题库', prefix: 'lr', ext: 'xlsx' },
  { dir: '【4】红领巾言语理解600题', source: '【4】红领巾言语理解600题', prefix: 'hlj', ext: 'apkg' }
];

// 读取上传题库的动态配置
function loadDynamicConfigs() {
  if (!fs.existsSync(UPLOADED_CONFIG_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(UPLOADED_CONFIG_FILE, 'utf-8'));
  } catch (e) {
    console.log('[quizLoader] 读取动态配置失败: ' + e.message);
    return [];
  }
}

// 保存上传题库的动态配置
function saveDynamicConfigs(configs) {
  const configDir = path.join(ROOT, UPLOADED_BASE);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(UPLOADED_CONFIG_FILE, JSON.stringify(configs, null, 2));
}

// 生成不重复的 prefix（u001 / u002 ...）
function generatePrefix(configs) {
  let max = 0;
  configs.forEach(c => {
    const m = String(c.prefix).match(/^u(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'u' + String(max + 1).padStart(3, '0');
}

// 注册一个上传题库文件夹，返回生成的配置
// 同 source 的记录会更新（保留原 prefix），避免重复累积
function addUploadedConfig(folderName, source, ext) {
  const configs = loadDynamicConfigs();
  const dirPath = path.join(UPLOADED_BASE, folderName);
  const existing = configs.find(c => c.source === source);
  if (existing) {
    // 更新目录与扩展名，保留 prefix
    existing.dir = dirPath;
    existing.ext = ext;
    saveDynamicConfigs(configs);
    return existing;
  }
  const prefix = generatePrefix(configs);
  const cfg = { dir: dirPath, source, prefix, ext };
  configs.push(cfg);
  saveDynamicConfigs(configs);
  return cfg;
}

// 内存中的题套列表
// setId -> { setId, source, setName, sheetName, questions: [...] }
const setsMap = new Map();

// 全局题号索引: questionUid -> { setId, qNo }
const questionIndex = new Map();

function naturalSort(a, b) {
  const ma = String(a).match(/\d+/g);
  const mb = String(b).match(/\d+/g);
  const na = ma ? parseInt(ma.join(''), 10) : 0;
  const nb = mb ? parseInt(mb.join(''), 10) : 0;
  return na - nb;
}

/**
 * 修复非标准 LaTeX 语法
 * 题库生成时可能产生 [matrix]、⎩⎨⎧ 等非标准标记，KaTeX 无法识别
 * 此函数将其转为标准 LaTeX 环境（matrix / pmatrix / cases）
 */
function fixNonStandardMath(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.includes('[matrix]') && !text.includes('⎩⎨⎧')) return text;

  // 一次性处理 $$...$$ 和 $...$（$$ 优先）
  text = text.replace(/\$\$([\s\S]*?)\$\$|\$([^\$]+)\$/g, function (m, display, inline) {
    if (display !== undefined) return '$$' + fixMathInner(display) + '$$';
    return '$' + fixMathInner(inline) + '$';
  });

  return text;
}

/**
 * 修复单个 math 块内部的 [matrix] 标记
 * 规则：
 *   ⎩⎨⎧[matrix]  → \begin{cases}   （Unicode 分段括号）
 *   {[matrix]     → \begin{cases}   （花括号分段）
 *   ([matrix]     → \begin{pmatrix} （带圆括号的向量/矩阵）
 *   [matrix]      → \begin{matrix}  （裸矩阵）
 * 闭合规则：
 *   matrix  → 遇到下一个 \begin{...}、) 或块尾时闭合
 *   pmatrix → 遇到 ) 或块尾时闭合
 *   cases   → 块尾闭合
 */
function fixMathInner(math) {
  if (!math.includes('[matrix]') && !math.includes('⎩⎨⎧')) return math;

  // ⎩⎨⎧[matrix] → \begin{cases}
  math = math.replace(/⎩⎨⎧\[matrix\]/g, '\\begin{cases}');
  // 移除残留的 ⎩⎨⎧
  math = math.replace(/⎩⎨⎧/g, '');

  // {[matrix] → \begin{cases}
  math = math.replace(/\{\[matrix\]/g, '\\begin{cases}');

  // ([matrix] → \begin{pmatrix}
  math = math.replace(/\(\[matrix\]/g, '\\begin{pmatrix}');

  // 剩余 [matrix] → \begin{matrix}
  math = math.replace(/\[matrix\]/g, '\\begin{matrix}');

  // token 扫描：补全 \end{...}
  var tokenRegex = /(\\begin\{(cases|pmatrix|matrix)\})|(\))/g;
  var opens = [];
  var result = '';
  var lastIndex = 0;
  var match;

  while ((match = tokenRegex.exec(math)) !== null) {
    result += math.substring(lastIndex, match.index);
    lastIndex = tokenRegex.lastIndex;

    if (match[1]) {
      // 新环境开始：如果上一个 matrix 未闭合，先闭合（matrix 不嵌套）
      if (opens.length > 0 && opens[opens.length - 1] === 'matrix') {
        opens.pop();
        result += '\\end{matrix}';
      }
      result += match[1];
      opens.push(match[2]);
    } else if (match[3]) {
      // 遇到 )：闭合 pmatrix 或 matrix
      if (opens.length > 0) {
        var top = opens[opens.length - 1];
        if (top === 'pmatrix' || top === 'matrix') {
          opens.pop();
          result += '\\end{' + top + '}';
        } else {
          result += ')';
        }
      } else {
        result += ')';
      }
    }
  }

  result += math.substring(lastIndex);
  while (opens.length > 0) {
    result += '\\end{' + opens.pop() + '}';
  }

  return result;
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

  // 题型（先取，用于判断多选）
  const type = get('题型') || '单选';

  // 答案规范化：多选题保留全部字母并排序，单选题仅取首字母
  let answer = String(get('答案') || '').trim().toUpperCase();
  if (/多(选|项)/.test(type)) {
    // 保留所有 A-F 字母，去重并排序
    const letters = answer.match(/[A-F]/g) || [];
    const uniq = Array.from(new Set(letters)).sort();
    answer = uniq.join('');
  } else {
    const m = answer.match(/[A-F]/);
    answer = m ? m[0] : '';
  }

  // 解析
  const analysis = get('解析') || '';

  // 知识点
  const knowledge = get('知识点') || '';

  // 图片URL（题干配图）
  let imageUrl = get('图片URL') || '';
  imageUrl = String(imageUrl).trim();

  // 解析图片URL（解析区配图）
  let analysisImageUrl = get('解析图片URL') || '';
  analysisImageUrl = String(analysisImageUrl).trim();

  // 全局唯一ID
  const uid = setId + '_q' + qNo;

  return {
    uid,            // 全局唯一 ID
    setId,          // 所属题套 ID
    source,         // 来源：片段阅读 / 逻辑推理
    qNo,            // 题套内序号
    type,           // 题型
    stem: fixNonStandardMath(stem),           // 题干
    options,        // 选项数组（4 或 6 个）
    answer: fixNonStandardMath(answer),       // 正确答案字母 A/B/C/D/E/F
    analysis: fixNonStandardMath(analysis),   // 解析
    knowledge,      // 知识点
    imageUrl,       // 题干图片URL（可能为空，多图用|分隔）
    analysisImageUrl // 解析图片URL（可能为空，多图用|分隔）
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
      } else if (ext === 'md') {
        questions = parseMdFile(full, cfg.source);
        sheetName = 'markdown';
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

  // 解压 apkg 内的 media 文件（图片等）到题库目录的 images/ 子目录
  // apkg 内含: media(JSON映射 数字->实际文件名) + 数字命名的文件(0,1,2...)
  const mediaMapEntry = zip.getEntries().find(e => e.entryName === 'media');
  let mediaDir = '';
  if (mediaMapEntry) {
    try {
      const mediaMap = JSON.parse(mediaMapEntry.getData().toString('utf8'));
      // 题库目录 = apkg 文件所在目录
      mediaDir = path.join(path.dirname(filePath), 'images');
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      Object.keys(mediaMap).forEach(numKey => {
        const realName = mediaMap[numKey];
        const fileEntry = zip.getEntries().find(e => e.entryName === numKey);
        if (fileEntry) {
          const destPath = path.join(mediaDir, realName);
          // 避免重复写入（多 apkg 共享同一 images 目录时跳过已存在文件）
          if (!fs.existsSync(destPath)) {
            fs.writeFileSync(destPath, fileEntry.getData());
          }
        }
      });
    } catch (e) {
      console.warn('[quizLoader] media 解压失败:', e.message);
    }
  }

  // 图片 src 前缀转换：把题干/解析里的 src="xxx.png" 转为 /quiz-img/{source}/images/xxx.png
  const encodedSource = encodeURIComponent(source);
  function rewriteImgSrc(html) {
    if (!html || !mediaDir) return html;
    // 匹配 src="xxx.png" 或 src='xxx.png'（相对路径，非 http/https/绝对路径）
    return html.replace(/src=(["'])([^"']+)\1/gi, (match, quote, src) => {
      if (/^https?:\/\//i.test(src) || src.charAt(0) === '/') return match;
      return 'src=' + quote + '/quiz-img/' + encodedSource + '/images/' + src + quote;
    });
  }

  const SQL = require('sql.js');
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
      const analysis = parts[5] || '';
      const knowledge = parts[6] || '';
      // 多选题保留全部字母，单选题取首字母
      let answer;
      const rawAnswer = (parts[4] || '').trim().toUpperCase();
      if (/多(选|项)/.test(type)) {
        const letters = rawAnswer.match(/[A-F]/g) || [];
        answer = Array.from(new Set(letters)).sort().join('');
      } else {
        const m = rawAnswer.match(/[A-F]/);
        answer = m ? m[0] : '';
      }

      // 选项拆分：格式 "A. xxx<br>B. yyy<br>C. zzz<br>D. www"
      const options = [];
      const optParts = optionsRaw.split(/<br\s*\/?>/i);
      optParts.forEach(p => {
        const t = p.trim();
        if (t) options.push(t);
      });

      if (!stem) return;

      // 题干和解析中的图片 src 转换为 /quiz-img/ 绝对路径
      const stemWithImg = rewriteImgSrc(stem);
      const analysisWithImg = rewriteImgSrc(analysis);

      questions.push({
        uid: '',               // 后续补全
        setId: '',             // 后续补全
        source,
        qNo: idx + 1,
        type,
        stem: fixNonStandardMath(stemWithImg),
        options,
        answer: fixNonStandardMath(answer),
        analysis: fixNonStandardMath(analysisWithImg),
        knowledge: knowledge.trim(),
        imageUrl: '',          // apkg 图片嵌在题干 HTML 里，不单独存
        analysisImageUrl: ''
      });
    });
  }

  db.close();
  return questions;
}

// ── Markdown 解析（考研数学等无选项题型）──
// md 文件结构：
//   ## 填空题 / ## 解答题
//   ### 第 X 题
//   **考点**：...
//   **题目**：...
//   **答案**：...
//   **解析**：...
// 返回题目对象：{ type, stem, options: [], answer, analysis, knowledge, imageUrl: '', analysisImageUrl: '' }
function parseMdFile(filePath, source) {
  const content = fs.readFileSync(filePath, 'utf8');
  const questions = [];

  // 按题号拆分（### 第 X 题）
  const titleRegex = /^#{3}\s*第\s*(\d+)\s*题(?:[（(]([^)）]*)[）)])?\s*$/gm;
  const matches = [];
  let m;
  while ((m = titleRegex.exec(content)) !== null) {
    matches.push({ qNo: parseInt(m[1], 10), title: m[0], start: m.index, full: m[2] || '' });
  }
  if (matches.length === 0) return questions;

  // 当前章节题型（填空题/解答题）
  let currentType = '填空';
  const sectionRegex = /^#{2}\s*(填空题|解答题|选择题)\s*$/gm;

  for (let i = 0; i < matches.length; i++) {
    const block = content.substring(matches[i].start, i + 1 < matches.length ? matches[i + 1].start : content.length);

    // 在该题块之前的最近一个 ## 章节 标题决定题型
    const sectionMatch = block.match(/^#{2}\s*(填空题|解答题|选择题)\s*$/m);
    if (sectionMatch) {
      currentType = sectionMatch[1].replace('题', '');
    }

    // 提取字段：**考点**、**题目**、**答案**、**解析**
    function extractField(field) {
      const re = new RegExp('\\*\\*' + field + '\\*\\*[：:]\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)');
      const fm = block.match(re);
      if (!fm) return '';
      // 去掉字段内容中尾部的分隔线 ---
      let text = fm[1].replace(/\r/g, '').replace(/\n---\s*$/, '').trim();
      return text;
    }

    const knowledge = extractField('考点');
    let stem = extractField('题目');
    const answer = extractField('答案');
    let analysis = extractField('解析');

    // 题目可能含「（本题满分 X 分）」前缀，去掉
    stem = stem.replace(/^（本题满分\s*\d+\s*分）\s*/, '').replace(/^\(本题满分\s*\d+\s*分\)\s*/, '');

    if (!stem) continue;

    questions.push({
      uid: '',
      setId: '',
      source,
      qNo: matches[i].qNo,
      type: currentType,
      stem: fixNonStandardMath(stem),
      options: [],                    // 无选项
      answer: fixNonStandardMath(answer),   // 答案文本（含 LaTeX）
      analysis: fixNonStandardMath(analysis), // 解析文本（含 LaTeX）
      knowledge,
      imageUrl: '',
      analysisImageUrl: ''
    });
  }

  return questions;
}

async function loadAll() {
  if (setsMap.size > 0) return; // 已加载
  console.log('[quizLoader] 开始加载题库...');

  // 合并静态配置 + 动态配置（上传的题库）
  const dynamicConfigs = loadDynamicConfigs();
  const allConfigs = QUIZ_DIRS.concat(dynamicConfigs);

  // 初始化 sql.js（用于解析 apkg）
  const hasApkg = allConfigs.some(c => c.ext === 'apkg');
  if (hasApkg && !global._sqlJsReady) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    global._sqlJsReady = SQL;
    global._SQL = SQL;
    console.log('[quizLoader] sql.js 初始化完成');
  }

  allConfigs.forEach(loadDir);
  console.log('[quizLoader] 加载完成，共 ' + setsMap.size + ' 套题，' + questionIndex.size + ' 道题，动态配置 ' + dynamicConfigs.length + ' 个');
}

// 清空内存数据并重新加载（上传新题库后调用）
async function reload() {
  setsMap.clear();
  questionIndex.clear();
  await loadAll();
}

// 按文件夹名删除一个上传题库的动态配置（不删磁盘文件，由调用方处理）
function removeUploadedConfig(folderName) {
  const configs = loadDynamicConfigs();
  const dirPath = path.join(UPLOADED_BASE, folderName);
  const idx = configs.findIndex(c => c.dir === dirPath);
  if (idx < 0) return null;
  const removed = configs[idx];
  configs.splice(idx, 1);
  saveDynamicConfigs(configs);
  return removed;
}

// 判断某个 source 是否为上传题库（动态配置）
function isUploadedSource(source) {
  const configs = loadDynamicConfigs();
  return configs.some(c => c.source === source);
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
// 支持普通题套与自定义题集（custom_ 前缀）
async function getSet(setId) {
  await loadAll();
  // 自定义题集
  if (String(setId).indexOf('custom_') === 0) {
    const c = customSetsMap.get(setId);
    if (!c) return null;
    return {
      setId: c.setId,
      source: c.source,
      setName: c.setName,
      sheetName: 'custom',
      questionCount: c.questions.length,
      questions: c.questions
    };
  }
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

// 自定义题集内存缓存：customSetId -> { setId, source, setName, questions }
const customSetsMap = new Map();

// 从多个题套聚合题目，生成自定义题集
// setIds: 题套 ID 数组；count: 抽取数量（null/0 = 全部）
async function buildCustomSet(setIds, count) {
  await loadAll();
  const allQuestions = [];
  const sourceNames = [];
  setIds.forEach(id => {
    const s = setsMap.get(id);
    if (!s) return;
    if (sourceNames.indexOf(s.source) < 0) sourceNames.push(s.source);
    s.questions.forEach(q => allQuestions.push(Object.assign({}, q)));
  });

  if (allQuestions.length === 0) return null;

  // 随机抽取
  let picked = allQuestions;
  if (count && count > 0 && count < allQuestions.length) {
    // Fisher-Yates 随机抽样
    const arr = allQuestions.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    picked = arr.slice(0, count);
  }

  // 重新编号
  const customId = 'custom_' + Date.now();
  picked.forEach((q, i) => {
    q.setId = customId;
    q.qNo = i + 1;
    q.uid = customId + '_q' + (i + 1);
  });

  const setName = '自定义练习(' + picked.length + '题)';
  const source = sourceNames.length > 0 ? sourceNames.join(' + ') : '自定义';

  const customSet = {
    setId: customId,
    source,
    setName,
    questions: picked
  };
  customSetsMap.set(customId, customSet);
  return customSet;
}

// 注册一个预构建的自定义题集（用于错题重做等场景）
// questions 需已符合 quiz-play 格式：{ qNo, type, stem, options, answer, analysis, ... }
function registerCustomSet(customId, source, setName, questions) {
  // 重新编号
  questions.forEach((q, i) => {
    q.setId = customId;
    q.qNo = i + 1;
    q.uid = customId + '_q' + (i + 1);
  });
  const customSet = {
    setId: customId,
    source,
    setName,
    questions
  };
  customSetsMap.set(customId, customSet);
  return customSet;
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

// 同步反查：通过 setId 获取一级题库名（source）
// 必须在 loadAll 完成后调用，否则 setsMap 为空
function getSourceBySetIdSync(setId) {
  const s = setsMap.get(setId);
  return s ? s.source : '';
}

module.exports = { loadAll, listSets, getSet, getQuestion, reload, addUploadedConfig, loadDynamicConfigs, removeUploadedConfig, isUploadedSource, buildCustomSet, registerCustomSet, getSourceBySetIdSync };
