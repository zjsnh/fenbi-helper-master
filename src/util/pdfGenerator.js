const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'simhei.ttf');
// TODO: 如需更接近粉笔原版（方正书宋），可替换为 simsun.ttf
const FONT_SONG_PATH = path.join(__dirname, '..', '..', 'fonts', 'simsun.ttf');

// ── 页面（与粉笔 PDF 一致） ──
const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const MARGIN_L = 40;   // 左边距（减小）
const MARGIN_R = 40;   // 右边距（减小）
const MARGIN_T = 52;   // 顶部（页眉起始）
const MARGIN_B = 37;   // 底部（页脚）

// ── 配色（粉笔风格） ──
const BLUE      = '#3C7CFC';   // 页眉标题蓝
const FOOTER_C  = '#636E91';   // 页脚蓝灰
const LINE_C    = '#F2F2F7';   // 页眉分隔线浅灰蓝
const TEXT      = '#000000';   // 正文黑色
const BG        = '#FFFFFF';

// ── 字号 / 行高 ──
const FONT_SIZE      = 10;     // 正文（题干+选项）10pt（更小字号）
const HEADER_SIZE    = 9;      // 页眉 9pt
const FOOTER_SIZE    = 9;      // 页脚 9pt
const LINE_HEIGHT    = 15;     // 正文行高 15pt（配合小字号）
const Q_OPT_GAP     = 5;      // 题干到选项间距 5pt
const Q_GAP         = 12;     // 题目间距（选项到下一题）

const COL_START_X    = MARGIN_L;
const BODY_W         = PAGE_W - MARGIN_L - MARGIN_R;

let gCategoryName;
let gPageNum     = 1;
let gTotalPages  = 1;
let gQCount      = 0;
let gFontSong     = false;  // 是否注册了宋体

// ══════════════════════════════════════
//  获取正文字体名
// ══════════════════════════════════════
function zhFont() {
  return gFontSong ? 'song' : 'zh';
}

// ══════════════════════════════════════
//  页脚（粉笔风格：仅页码）
// ══════════════════════════════════════
function drawFooter(doc) {
  const y = PAGE_H - MARGIN_B - 10;
  doc.font('zh').fontSize(FOOTER_SIZE).fillColor(FOOTER_C);
  doc.text(gPageNum + ' / ' + gTotalPages, MARGIN_L, y, {
    width: BODY_W,
    align: 'center',
    lineBreak: false,
  });
}

// ══════════════════════════════════════
//  页眉（粉笔风格：蓝色标题 + 分隔线）
// ══════════════════════════════════════
function drawHeader(doc, isFirst, categoryName, dateStr) {
  const headerY = MARGIN_T;

  doc.font('zh').fontSize(HEADER_SIZE).fillColor(BLUE);
  const title = isFirst
    ? categoryName + ' · 错题集'
    : categoryName + ' · 错题集';
  doc.text(title, 52, headerY, { width: BODY_W, align: 'left', lineBreak: false });

  // 右侧日期（仅首页）
  if (isFirst) {
    doc.font('zh').fontSize(HEADER_SIZE).fillColor(FOOTER_C);
    doc.text(dateStr, 52, headerY, { width: PAGE_W - 52 - 50, align: 'right', lineBreak: false });
  }

  // 分隔线
  const lineY = headerY + 18;
  doc.save();
  doc.rect(0, lineY, PAGE_W, 1).fill(LINE_C);
  doc.restore();

  return lineY + 12;
}

// ══════════════════════════════════════
//  文本宽度估算（用于布局决策）
//  中文字符 ≈ 字号宽度，ASCII ≈ 字号 × 0.55
// ══════════════════════════════════════
function estimateTextWidth(s, fontSize) {
  const fs = fontSize || FONT_SIZE;
  let w = 0;
  for (let c of s) {
    if (c.charCodeAt(0) > 0x7F) w += fs;        // 中文/全角
    else w += fs * 0.55;                          // ASCII
  }
  return w;
}

// 计算文本在指定宽度内换行后的行数
function estimateLines(s, colWidth, fontSize) {
  const w = estimateTextWidth(s, fontSize);
  return Math.max(1, Math.ceil(w / colWidth));
}

// ══════════════════════════════════════
//  渲染一道题（粉笔风格排版 + 智能选项布局）
// ══════════════════════════════════════
function renderQuestion(doc, q, num) {
  const text = stripHtml(q.content || '');
  const opts = (q.options || []).map((o, j) => ({
    l: ['A', 'B', 'C', 'D', 'E', 'F'][j],
    t: stripHtml(o || ''),
  }));

  const f = zhFont();

  // ── 1. 决定选项布局：计算列数 ──
  // 选项字母占位宽度
  const LABEL_W = 18;
  const OPT_GAP = 20;                         // 列间距
  const availW = BODY_W - LABEL_W;             // 去掉题号缩进后的可用宽度

  let cols = 1;
  if (opts.length > 0) {
    // 计算每个选项文本显示宽度（含字母占位）
    const optWidths = opts.map(o => estimateTextWidth(o.t, FONT_SIZE) + LABEL_W + 4);
    const maxW = Math.max(...optWidths);

    // 优先 4 列：每选项都能放进 1/4 宽度
    const colW4 = (availW - OPT_GAP * 3) / 4;
    // 再尝试 2 列
    const colW2 = (availW - OPT_GAP * 1) / 2;

    if (maxW <= colW4 && opts.length <= 4) {
      cols = 4;       // 4 选项全部短语 → 一行四列
    } else if (maxW <= colW2) {
      cols = 2;       // 中等长度 → 两列
    } else {
      cols = 1;       // 长句 → 单列竖排
    }
  }

  // ── 2. 计算实际需要的高度 ──
  const colW = cols === 1 ? availW : (availW - OPT_GAP * (cols - 1)) / cols;
  const optTextW = colW - LABEL_W;            // 选项文本可用宽度
  const rows = Math.ceil(opts.length / cols);

  // 题干行数
  const stemNumW = num < 10 ? 15 : 23;
  const stemLines = estimateLines(text, BODY_W - stemNumW, FONT_SIZE);
  const stemH = stemLines * LINE_HEIGHT;

  // 选项总高度（按行计算，每行取该行最大行数）
  let optH = 0;
  const rowLineCounts = [];
  for (let r = 0; r < rows; r++) {
    const rowOpts = opts.slice(r * cols, (r + 1) * cols);
    const maxLines = Math.max(...rowOpts.map(o => estimateLines(o.t, optTextW, FONT_SIZE)));
    rowLineCounts.push(maxLines);
    optH += maxLines * LINE_HEIGHT;
  }

  const estH = stemH + Q_OPT_GAP + optH + Q_GAP;

  // ── 3. 分页检查（整题预估） ──
  if (doc.y + estH > PAGE_H - MARGIN_B - 10) {
    drawFooter(doc);
    doc.addPage();
    doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);
    const cy = drawHeader(doc, false, '', '');
    doc.y = cy;
    gPageNum++;
    gTotalPages++;
    return renderQuestion(doc, q, num);
  }

  // ── 4. 绘制题号 + 题干 ──
  const startY = doc.y;
  const numStr = String(num) + '.';
  doc.font(f).fontSize(FONT_SIZE).fillColor(TEXT);
  doc.text(numStr, MARGIN_L, startY, { width: stemNumW, align: 'left', lineBreak: false });
  doc.text(text, MARGIN_L + stemNumW, startY, {
    width: BODY_W - stemNumW,
    lineGap: LINE_HEIGHT - FONT_SIZE,
  });

  // ── 5. 绘制选项（横向布局，绝对定位） ──
  if (opts.length > 0) {
    doc.y += Q_OPT_GAP;

    for (let r = 0; r < rows; r++) {
      const rowY = doc.y;
      const maxLines = rowLineCounts[r];
      const rowH = maxLines * LINE_HEIGHT;

      // 行前分页检查
      if (rowY + rowH > PAGE_H - MARGIN_B - 10) {
        drawFooter(doc);
        doc.addPage();
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);
        const cy = drawHeader(doc, false, '', '');
        gPageNum++;
        gTotalPages++;
        // 用新页的 Y 重新绘制本行
        const newRowY = cy;
        const rowOpts = opts.slice(r * cols, (r + 1) * cols);
        rowOpts.forEach((opt, c) => {
          const ox = MARGIN_L + LABEL_W + c * (colW + OPT_GAP);
          doc.font(f).fontSize(FONT_SIZE).fillColor(TEXT);
          doc.text(opt.l + '.', ox, newRowY, { width: LABEL_W, align: 'left', lineBreak: false });
          doc.text(opt.t, ox + LABEL_W, newRowY, {
            width: optTextW,
            lineGap: LINE_HEIGHT - FONT_SIZE,
          });
        });
        doc.y = newRowY + rowH;
        continue;
      }

      // 正常绘制本行
      const rowOpts = opts.slice(r * cols, (r + 1) * cols);
      rowOpts.forEach((opt, c) => {
        const ox = MARGIN_L + LABEL_W + c * (colW + OPT_GAP);
        doc.font(f).fontSize(FONT_SIZE).fillColor(TEXT);
        doc.text(opt.l + '.', ox, rowY, { width: LABEL_W, align: 'left', lineBreak: false });
        doc.text(opt.t, ox + LABEL_W, rowY, {
          width: optTextW,
          lineGap: LINE_HEIGHT - FONT_SIZE,
        });
      });

      // 固定推进 Y（按本行最大行数）
      doc.y = rowY + rowH;
    }
  }

  // 题间距
  doc.y += Q_GAP;
}

// ══════════════════════════════════════
//  主入口
// ══════════════════════════════════════
async function generateWrongQuestionsPDF(options) {
  const { categoryName, questions, start, end } = options;
  const selected = questions.slice(start - 1, end);
  gCategoryName = categoryName;
  gPageNum = 1;
  gTotalPages = 1;
  gQCount = selected.length;

  const d = new Date();
  const dateStr = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 0,
      size: 'A4',
      bufferPages: true,
      info: { Title: categoryName + ' - 错题本', Author: '粉笔助手' },
    });

    const buf = [];
    doc.on('data', c => buf.push(c));
    doc.on('end', () => resolve(Buffer.concat(buf)));
    doc.on('error', reject);
    doc.registerFont('zh', FONT_PATH);

    // 尝试注册宋体
    try {
      doc.registerFont('song', FONT_SONG_PATH);
      gFontSong = true;
    } catch (e) {
      gFontSong = false;
    }

    doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);

    const cy = drawHeader(doc, true, categoryName, dateStr);
    doc.y = cy;

    selected.forEach((q, i) => {
      if (doc.y > PAGE_H - 70) {
        drawFooter(doc);
        doc.addPage();
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);
        const ny = drawHeader(doc, false, '', '');
        doc.y = ny;
        gPageNum++;
        gTotalPages++;
      }
      renderQuestion(doc, q, start + i);
    });

    drawFooter(doc);
    doc.end();
  });
}

// ══════════════════════════════════════
//  词语统计页（紧凑两列版）
//   - 错误次数：当日练习中该词语实际关联的错题数（item.questionIds.length）
//   - 不再使用全错题本累计的 w.count
// ══════════════════════════════════════
function renderWordStatsPage(doc, wordStatsList) {
  if (!wordStatsList || wordStatsList.length === 0) return;

  drawFooter(doc);
  doc.addPage();
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);
  const cy = drawHeader(doc, false, '', '');
  doc.y = cy + 2;
  gPageNum++;
  gTotalPages++;

  const f = zhFont();
  const ROW_H   = LINE_HEIGHT - 3;   // 12pt 紧凑行高
  const CELL_FS = FOOTER_SIZE;       // 9pt 表格字号

  // 列布局：词语占大头，错误次数一列窄
  const colWord = MARGIN_L;
  const colErr  = MARGIN_L + BODY_W * 0.82;
  const wWord   = BODY_W * 0.80;
  const wNum    = BODY_W * 0.18;

  // 内联绘制表头（首页 & 跨页时复用）
  function drawTableHead() {
    doc.font(f).fontSize(CELL_FS).fillColor(FOOTER_C);
    doc.text('词语',    colWord, doc.y, { width: wWord, align: 'left',   lineBreak: false });
    doc.text('错误次数', colErr,  doc.y, { width: wNum,  align: 'center', lineBreak: false });
    doc.y += ROW_H;
    doc.moveTo(MARGIN_L, doc.y).lineTo(MARGIN_L + BODY_W, doc.y)
       .lineWidth(0.3).strokeColor('#e0e0e0').stroke();
    doc.y += 3;
  }

  // 标题（一行）
  doc.font(f).fontSize(FONT_SIZE).fillColor(TEXT);
  doc.text('错误词语统计', MARGIN_L, doc.y, { width: BODY_W, align: 'left', lineBreak: false });
  doc.y += ROW_H + 2;
  doc.moveTo(MARGIN_L, doc.y).lineTo(MARGIN_L + BODY_W, doc.y)
     .lineWidth(0.5).strokeColor('#cccccc').stroke();
  doc.y += 4;

  drawTableHead();

  // 表体
  wordStatsList.forEach((item) => {
    // 行前分页检查
    if (doc.y + ROW_H > PAGE_H - MARGIN_B - 5) {
      drawFooter(doc);
      doc.addPage();
      doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);
      const ny = drawHeader(doc, false, '', '');
      doc.y = ny + 2;
      gPageNum++;
      gTotalPages++;
      drawTableHead();
    }
    const rowY = doc.y;
    const errCount = (item.questionIds || []).length;   // 当日错题实际关联数
    doc.font(f).fontSize(CELL_FS).fillColor(TEXT);
    doc.text(item.word || '', colWord, rowY, { width: wWord, align: 'left', lineBreak: false });
    doc.fillColor(FOOTER_C);
    doc.text(String(errCount), colErr, rowY, { width: wNum, align: 'center', lineBreak: false });
    doc.y = rowY + ROW_H;
  });
}

// ══════════════════════════════════════
//  按日期生成当日错题统计报告
// ══════════════════════════════════════
async function generateDailyWrongStatsPDF(stats) {
  const { date, questions, wordStatsList } = stats;
  gCategoryName = date + ' 错题';
  gPageNum = 1;
  gTotalPages = 1;
  gQCount = questions.length;

  const d = new Date();
  const dateStr = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 0,
      size: 'A4',
      bufferPages: true,
      info: { Title: date + ' 当日错题', Author: '粉笔助手' },
    });

    const buf = [];
    doc.on('data', c => buf.push(c));
    doc.on('end', () => resolve(Buffer.concat(buf)));
    doc.on('error', reject);
    doc.registerFont('zh', FONT_PATH);

    try {
      doc.registerFont('song', FONT_SONG_PATH);
      gFontSong = true;
    } catch (e) {
      gFontSong = false;
    }

    doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);

    const cy = drawHeader(doc, true, date + ' 当日错题', dateStr);
    doc.y = cy;

    questions.forEach((q, i) => {
      if (doc.y > PAGE_H - 70) {
        drawFooter(doc);
        doc.addPage();
        doc.rect(0, 0, PAGE_W, PAGE_H).fill(BG);
        const ny = drawHeader(doc, false, '', '');
        doc.y = ny;
        gPageNum++;
        gTotalPages++;
      }
      renderQuestion(doc, q, i + 1);
    });

    if (wordStatsList && wordStatsList.length > 0) {
      renderWordStatsPage(doc, wordStatsList);
    }

    drawFooter(doc);
    doc.end();
  });
}

// ══════════════════════════════════════
//  HTML 清理
// ══════════════════════════════════════
function stripHtml(h) {
  if (!h) return '';
  return h.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<input[^>]*>/gi, '___')
    .replace(/<\/?(p|div|tr|h\d|li|ul|ol|table|tbody|thead|th|td|section|article|header|footer|figure|figcaption|textarea|select|button|span|label|form|fieldset|legend|pre|code|blockquote|caption|colgroup|col)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  \u2022 ').replace(/<img[^>]*\/?>/gi, '')
    .replace(/<u[^>]*>([\s\u00a0]*)<\/u>/gi, function(m, inner) {
      return '___'.repeat(Math.max(1, Math.ceil(inner.length / 4)));
    })
    .replace(/<u[^>]*>/gi, '\u0332').replace(/<\/u>/gi, '\u0332')
    .replace(/<hr\s*\/?>/gi, '\n────────────────────────\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&ensp;/g, ' ').replace(/&emsp;/g, '  ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
    .replace(/&bull;/g, '\u2022').replace(/&times;/g, '\u00d7')
    .replace(/&divide;/g, '\u00f7').replace(/&plusmn;/g, '\u00b1')
    .replace(/&#9[0-9]{3};/g, '___')
    .replace(/[\u2500-\u257f]/g, '___')
    .replace(/[\u2b00-\u2bff]/g, '___')
    .replace(/[\u2600-\u26ff]/g, '___')
    .replace(/[\u2700-\u27bf]/g, '___')
    .replace(/\uff3f/g, '____')
    .replace(/\(\s*\)/g, '(    )').replace(/\uff08\s*\uff09/g, '(    )')
    .replace(/_{2,}/g, m => m)
    .replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

module.exports = { generateWrongQuestionsPDF, generateDailyWrongStatsPDF };
