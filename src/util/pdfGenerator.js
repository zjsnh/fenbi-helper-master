const PDFDocument = require('pdfkit');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const FONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'simhei.ttf');
// TODO: 如需更接近粉笔原版（方正书宋），可替换为 simsun.ttf
const FONT_SONG_PATH = path.join(__dirname, '..', '..', 'fonts', 'simsun.ttf');

// ── 图片缓存：url → Buffer ──
const imageCache = new Map();

// ── 图片标记字符（Private Use Area，不会与正常文本冲突）──
const IMG_MARK_START = '\uE000';
const IMG_MARK_SEP   = '\uE001';
const IMG_MARK_END   = '\uE002';

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
//  图片处理：解析标签、下载、获取尺寸
// ══════════════════════════════════════
function parseImgTags(html) {
  if (!html) return [];
  const imgs = [];
  const regex = /<img\s+([^>]*?)\/?>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const attrs = m[1] || '';
    const flagMatch = attrs.match(/flag\s*=\s*"([^"]*)"/i);
    const srcMatch = attrs.match(/src\s*=\s*"([^"]*)"/i) || attrs.match(/src\s*=\s*'([^']*)'/i);
    const widthMatch = attrs.match(/width\s*=\s*"?(\d+)/i);
    const heightMatch = attrs.match(/height\s*=\s*"?(\d+)/i);
    if (srcMatch) {
      let url = srcMatch[1];
      if (url.startsWith('//')) url = 'https:' + url;
      imgs.push({
        url,
        flag: flagMatch ? flagMatch[1] : '',
        width: widthMatch ? parseInt(widthMatch[1]) : null,
        height: heightMatch ? parseInt(heightMatch[1]) : null,
      });
    }
  }
  return imgs;
}

function downloadImage(url) {
  return new Promise((resolve) => {
    if (imageCache.has(url)) { resolve(imageCache.get(url)); return; }
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://tiku.fenbi.com/' },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        imageCache.set(url, null);
        resolve(null);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        // 处理压缩响应：fb.fenbike.cn 对 ?width=700 强制返回 br 压缩
        const enc = (res.headers['content-encoding'] || '').toLowerCase();
        try {
          if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf);
          else if (enc.includes('gzip')) buf = zlib.gunzipSync(buf);
          else if (enc.includes('deflate')) buf = zlib.inflateSync(buf);
        } catch (e) {
          console.log(`[PDF] 解压失败 ${url}: ${e.message}`);
          imageCache.set(url, null);
          resolve(null);
          return;
        }
        imageCache.set(url, buf);
        resolve(buf);
      });
    });
    req.on('error', () => { imageCache.set(url, null); resolve(null); });
    req.on('timeout', () => { req.destroy(); imageCache.set(url, null); resolve(null); });
  });
}

async function prefetchImages(questions) {
  const urls = new Set();
  questions.forEach(q => {
    const all = (q.content || '') + '\n' + (q.options || []).join('\n');
    parseImgTags(all).forEach(img => urls.add(img.url));
  });
  if (urls.size === 0) return;
  console.log(`[PDF] 预下载 ${urls.size} 张图片...`);
  await Promise.all(Array.from(urls).map(url => downloadImage(url)));
  const ok = Array.from(urls).filter(u => imageCache.get(u)).length;
  console.log(`[PDF] 图片下载完成: ${ok}/${urls.size} 成功`);
}

// 从图片 Buffer 读取原始尺寸（支持 PNG/JPEG/GIF）
function getImageDimensions(buf) {
  if (!buf || buf.length < 8) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // JPEG：扫描 SOF 标记
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xD9 || marker === 0xDA) break;
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return null;
}

// 将带图片标记的文本拆分为 segments
function parseSegments(text) {
  const segments = [];
  const regex = /\uE000([TB])\uE001([^\uE002]+)\uE002/g;
  let lastIdx = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: 'text', text: text.slice(lastIdx, m.index) });
    }
    segments.push({ type: 'img', flag: m[1], url: m[2] });
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIdx) });
  }
  return segments;
}

// 渲染题干（支持内联 tex 公式图 + 块状图）
function renderStemWithImages(doc, segments, startX, startY, maxWidth, fontSize, lineHeight) {
  const f = zhFont();

  // ── 调试：进入函数时打印 segment 概览 ──
  const imgSegs = segments.filter(s => s.type === 'img');
  if (imgSegs.length > 0) {
    console.log(`[renderStem] segments=${segments.length}, imgs=${imgSegs.length}`);
    imgSegs.forEach((s, i) => {
      const buf = imageCache.get(s.url);
      const dims = buf ? getImageDimensions(buf) : null;
      console.log(`  [img#${i}] flag=${s.flag} url=${s.url}`);
      console.log(`           cache=${buf ? buf.length + 'B' : 'MISS'} dims=${dims ? dims.width + 'x' + dims.height : 'null'}`);
    });
  }

  // 无图片：直接走原路径
  if (segments.length === 1 && segments[0].type === 'text') {
    doc.font(f).fontSize(fontSize).fillColor(TEXT);
    doc.text(segments[0].text, startX, startY, {
      width: maxWidth,
      lineGap: lineHeight - fontSize,
    });
    return;
  }

  let currentX = startX;
  let currentY = startY;

  segments.forEach((seg) => {
    if (seg.type === 'text') {
      if (!seg.text) return;
      doc.font(f).fontSize(fontSize).fillColor(TEXT);
      const remainingW = maxWidth - (currentX - startX);
      if (remainingW <= 0) {
        currentY += lineHeight;
        currentX = startX;
      }
      doc.text(seg.text, currentX, currentY, {
        width: maxWidth - (currentX - startX),
        lineGap: lineHeight - fontSize,
      });
      currentX = doc.x;
      currentY = doc.y;
    } else if (seg.type === 'img') {
      const buf = imageCache.get(seg.url);
      if (!buf) {
        console.log(`  [renderStem] SKIP: cache MISS for ${seg.url}`);
        return;
      }

      if (seg.flag === 'T') {
        // 内联公式图：高度与字号一致，与文字同基线
        const dims = getImageDimensions(buf);
        if (!dims) {
          console.log(`  [renderStem] SKIP: dims null for ${seg.url}`);
          return;
        }
        const imgH = fontSize + 2;
        const imgW = imgH * (dims.width / dims.height);
        // 当前行放不下则换行
        if (currentX + imgW > startX + maxWidth) {
          currentY = doc.y + lineHeight;
          currentX = startX;
        }
        // 与文字基线对齐（doc.y 是文本底部，往上偏移 fontSize）
        const imgY = (doc.y || currentY) - fontSize - 1;
        try {
          doc.image(buf, currentX, imgY, { height: imgH });
          currentX += imgW;
          console.log(`  [renderStem] OK inline: x=${currentX.toFixed(1)} y=${imgY.toFixed(1)} w=${imgW.toFixed(1)} h=${imgH}`);
        } catch (e) {
          console.log(`  [renderStem] FAIL inline: ${e.message} url=${seg.url}`);
        }
      } else {
        // 块状图：新行、居中、按页面宽度自适应
        try {
          const dims = getImageDimensions(buf);
          if (!dims) {
            console.log(`  [renderStem] SKIP block: dims null for ${seg.url}`);
            return;
          }
          const imgW = Math.min(dims.width, maxWidth);
          const imgH = dims.height * (imgW / dims.width);
          if (currentX > startX + 1) {
            currentY = (doc.y || currentY) + lineHeight;
            currentX = startX;
          }
          const imgX = startX + (maxWidth - imgW) / 2;
          doc.image(buf, imgX, currentY, { width: imgW, height: imgH });
          console.log(`  [renderStem] OK block: x=${imgX.toFixed(1)} y=${currentY.toFixed(1)} w=${imgW.toFixed(1)} h=${imgH.toFixed(1)}`);
          currentY += imgH + 4;
          currentX = startX;
          doc.y = currentY;
        } catch (e) {
          console.log(`  [renderStem] FAIL block: ${e.message} url=${seg.url}`);
        }
      }
    }
  });
}

// ══════════════════════════════════════
//  渲染一道题（粉笔风格排版 + 智能选项布局）
// ══════════════════════════════════════
function renderQuestion(doc, q, num) {
  const text = stripHtml(q.content || '', true);  // keepImages=true：保留图片标记
  const stemSegments = parseSegments(text);
  const opts = (q.options || []).map((o, j) => ({
    l: ['A', 'B', 'C', 'D', 'E', 'F'][j],
    t: stripHtml(o || '', false),  // 选项不嵌图，直接剥离
  }));

  // ── 调试：检测含图片的题目 ──
  const imgCount = stemSegments.filter(s => s.type === 'img').length;
  if (/img\s/i.test(q.content || '') || imgCount > 0) {
    console.log(`\n[Q${num}] 检测到图片题目`);
    console.log(`  content 长度=${(q.content || '').length}, 选项数=${opts.length}`);
    console.log(`  segments=${stemSegments.length}, 图片段=${imgCount}`);
  }

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

  // 题干行数（用纯文本估算，不含图片标记）
  const stemNumW = num < 10 ? 15 : 23;
  const stemTextOnly = text.replace(/\uE000[^\uE002]*\uE002/g, '');
  const stemLines = estimateLines(stemTextOnly, BODY_W - stemNumW, FONT_SIZE);
  const stemH = stemLines * LINE_HEIGHT;

  // 块状图额外占的高度
  const blockImgs = stemSegments.filter(s => s.type === 'img' && s.flag !== 'T');
  let blockImgH = 0;
  blockImgs.forEach(seg => {
    const buf = imageCache.get(seg.url);
    if (!buf) return;
    const dims = getImageDimensions(buf);
    if (dims) {
      const w = Math.min(dims.width, BODY_W - stemNumW);
      blockImgH += (dims.height * w / dims.width) + 4;
    } else {
      blockImgH += 60;
    }
  });

  // 选项总高度（按行计算，每行取该行最大行数）
  let optH = 0;
  const rowLineCounts = [];
  for (let r = 0; r < rows; r++) {
    const rowOpts = opts.slice(r * cols, (r + 1) * cols);
    const maxLines = Math.max(...rowOpts.map(o => estimateLines(o.t, optTextW, FONT_SIZE)));
    rowLineCounts.push(maxLines);
    optH += maxLines * LINE_HEIGHT;
  }

  const estH = stemH + blockImgH + Q_OPT_GAP + optH + Q_GAP;

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

  // ── 4. 绘制题号 + 题干（含内联/块状图） ──
  const startY = doc.y;
  const numStr = String(num) + '.';
  doc.font(f).fontSize(FONT_SIZE).fillColor(TEXT);
  doc.text(numStr, MARGIN_L, startY, { width: stemNumW, align: 'left', lineBreak: false });
  renderStemWithImages(doc, stemSegments, MARGIN_L + stemNumW, startY, BODY_W - stemNumW, FONT_SIZE, LINE_HEIGHT);

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

  // 预下载所有图片（公式图、资料图等）
  await prefetchImages(selected);

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

  // 预下载所有图片
  await prefetchImages(questions);

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
function stripHtml(h, keepImages) {
  if (!h) return '';
  let s = h.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<input[^>]*>/gi, '___')
    .replace(/<\/?(p|div|tr|h\d|li|ul|ol|table|tbody|thead|th|td|section|article|header|footer|figure|figcaption|textarea|select|button|span|label|form|fieldset|legend|pre|code|blockquote|caption|colgroup|col)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  \u2022 ');

  // 处理 <img>：保留为标记 or 直接剥离
  if (keepImages) {
    s = s.replace(/<img\s+([^>]*?)\/?>/gi, function(match, attrs) {
      const srcMatch = attrs.match(/src\s*=\s*"([^"]*)"/i) || attrs.match(/src\s*=\s*'([^']*)'/i);
      const flagMatch = attrs.match(/flag\s*=\s*"([^"]*)"/i);
      if (!srcMatch) return '';
      let url = srcMatch[1];
      if (url.startsWith('//')) url = 'https:' + url;
      const flag = flagMatch ? flagMatch[1] : '';
      // 标记格式：\uE000 + (T|B) + \uE001 + url + \uE002
      return IMG_MARK_START + (flag === 'tex' ? 'T' : 'B') + IMG_MARK_SEP + url + IMG_MARK_END;
    });
  } else {
    s = s.replace(/<img[^>]*\/?>/gi, '');
  }

  s = s.replace(/<u[^>]*>([\s\u00a0]*)<\/u>/gi, function(m, inner) {
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
  return s;
}

module.exports = { generateWrongQuestionsPDF, generateDailyWrongStatsPDF };
