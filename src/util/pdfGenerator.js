const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'simhei.ttf');
const LOGO_PATH = path.join(__dirname, '..', 'views', 'image.png');

// ── 页面 ──
const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const MARGIN  = 50;
const BODY_W  = PAGE_W - MARGIN * 2;

// ── 配色 ──
const GREEN   = '#2e7d32';
const GREEN_L = '#a5d6a7';
const BG      = '#fafafa';
const TEXT    = '#1a1a1a';
const GRAY    = '#999999';
const LINE    = '#e8e8e8';
const ACCENT  = '#1565c0';   // 题号用深蓝，醒目但不刺眼

let gCategoryName;
let gPageNum   = 1;
let gTotalPages = 1;
let gQCount    = 0;

// ══════════════════════════════════════
//  页脚（内联，不 switchToPage）
// ══════════════════════════════════════
function drawFooter(doc) {
  const ob = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const y = PAGE_H - 28;
  doc.save();
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y)
     .lineWidth(0.3).strokeColor(LINE).stroke();
  doc.font('zh').fontSize(7).fillColor(GRAY);
  doc.text(gCategoryName, MARGIN, y + 4, { width: BODY_W * 0.35, align: 'left', lineBreak: false });
  doc.text(gPageNum + ' / ' + gTotalPages, MARGIN, y + 4, { width: BODY_W, align: 'center', lineBreak: false });
  doc.text('错题助手', MARGIN, y + 4, { width: BODY_W * 0.35, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = ob;
}

// ══════════════════════════════════════
//  头部
// ══════════════════════════════════════
function drawHeader(doc, isFirst, categoryName, dateStr) {
  const top = isFirst ? MARGIN - 8 : MARGIN - 6;
  const h   = isFirst ? 30 : 22;

  // 极淡背景条，仅作分隔，不抢视觉
  doc.save()
     .roundedRect(MARGIN - 2, top - 2, BODY_W + 4, h, 3)
     .fillAndStroke('#ffffff', LINE);

  if (isFirst) {
    try { doc.image(LOGO_PATH, MARGIN + 2, top + 2, { width: 22, height: 22 }); } catch(e){}
    doc.font('zh').fontSize(14).fillColor(GREEN);
    doc.text('粉笔助手', MARGIN + 28, top + 2, { continued:true })
       .fontSize(11).fillColor(GREEN_L).text(' 错题本', {lineBreak:false});
    doc.font('zh').fontSize(9).fillColor(GRAY);
    doc.text(categoryName + ' · ' + dateStr, MARGIN + 28, top + 16, {lineBreak:false});
  } else {
    doc.font('zh').fontSize(10).fillColor(GREEN);
    doc.text('粉笔助手 · ' + gCategoryName + ' · 错题本', MARGIN+4, top+4, {lineBreak:false});
  }
  doc.restore();

  // 底线
  doc.moveTo(MARGIN, top+h-1).lineTo(PAGE_W-MARGIN, top+h-1)
     .lineWidth(0.5).strokeColor(GREEN_L).stroke();

  return top + h + 6; // 返回内容起始y
}

// ══════════════════════════════════════
//  渲染一道题
// ══════════════════════════════════════
function renderQuestion(doc, q, num) {
  const startY = doc.y;
  const text   = stripHtml(q.content || '');
  const opts   = (q.options || []).map((o,j) => ({
    l: ['A','B','C','D','E','F'][j],
    t: stripHtml(o||''),
  }));

  // ── 题号 + 题干 ──
  // 题号：深蓝文字，无背景色块，简洁醒目
  doc.font('zh').fontSize(12).fillColor(ACCENT);
  doc.text(String(num) + '.', MARGIN, startY, {width:28, align:'left', lineBreak:false});

  // 题干正文：加粗加大，作为视觉主体
  doc.font('zh').fontSize(11).fillColor(TEXT);
  doc.text(text, MARGIN+30, startY, { width:BODY_W-34, lineGap:2.5 });

  // ── 选项：横向布局 ──
  if (opts.length > 0) {
    const maxLen = Math.max(...opts.map(o=>o.t.length));
    let cols; // 每行几个选项

    // 决定列数：基于最长选项长度
    if (maxLen <= 8)           cols = 4;  // 短 → 一行4个
    else if (maxLen <= 15)    cols = 2;  // 中等 → 一行2个（共2行）
    else                       cols = 1;  // 长 → 竖排

    const optX    = MARGIN + 28;
    const optW    = BODY_W - 32;
    const gap     = 20;
    const colW    = (optW - gap*(cols-1)) / cols;
    const lineH   = 18;  // 固定行高
    const totalH  = Math.ceil(opts.length/cols) * lineH + 6;

    // 分页检查
    if (doc.y + totalH > PAGE_H - 50) {
      drawFooter(doc);
      doc.addPage();
      doc.rect(0,0,PAGE_W,PAGE_H).fill('#ffffff');
      const cy = drawHeader(doc,false,'','');
      doc.y = cy;
      gPageNum++;
      gTotalPages++;
      return renderQuestion(doc,q,num); // 重绘当前题
    }

    doc.y += 7;

    // 逐行绘制（每行固定高度，强制横向排列）
    for (let r=0; r<Math.ceil(opts.length/cols); r++) {
      const ry = doc.y;
      const rowOpts = opts.slice(r*cols, (r+1)*cols);

      rowOpts.forEach((opt, c) => {
        const ox = optX + c*(colW+gap);
        // 选项字母用中性深灰，不抢眼
        doc.font('zh').fontSize(10).fillColor(GRAY);
        doc.text(opt.l+'.', ox, ry, {width:colW-4, continued:true, lineBreak:false});
        doc.font('zh').fontSize(10).fillColor(TEXT);
        doc.text(' '+opt.t, {width:colW-18, lineGap:0.5});
      });
      // 固定推进一行高度，不管内容多高都只占一行
      doc.y = ry + lineH;
    }
    doc.y += 5;
  } else {
    doc.y += 5;
  }

  // 题间分隔线（最后一题不加）
  if (num < gQCount) {
    const sy = doc.y + 2;
    doc.save();
    doc.moveTo(MARGIN+15,sy).lineTo(PAGE_W-MARGIN-15,sy)
       .lineWidth(0.2).dash(4,{space:3}).strokeColor(LINE).stroke().undash();
    doc.restore();
  }
  doc.y += 10;
}

// ══════════════════════════════════════
//  主入口
// ══════════════════════════════════════
async function generateWrongQuestionsPDF(options) {
  const {categoryName,questions,start,end} = options;
  const selected = questions.slice(start-1,end);
  gCategoryName = categoryName;
  gPageNum = 1;
  gTotalPages = 1;
  gQCount = selected.length;

  const d = new Date();
  const dateStr = d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();

  return new Promise((resolve,reject)=>{
    const doc = new PDFDocument({
      margin:MARGIN, size:'A4', bufferPages:true,
      info:{Title:categoryName+' - 错题本', Author:'粉笔助手'}
    });

    const buf=[];
    doc.on('data',c=>buf.push(c));
    doc.on('end',()=>resolve(Buffer.concat(buf)));
    doc.on('error',reject);
    doc.registerFont('zh',FONT_PATH);

    doc.rect(0,0,PAGE_W,PAGE_H).fill('#ffffff');

    const cy = drawHeader(doc,true,categoryName,dateStr);
    doc.y = cy;

    selected.forEach((q,i)=>{
      if (doc.y > PAGE_H - 70) {
        drawFooter(doc);
        doc.addPage();
        doc.rect(0,0,PAGE_W,PAGE_H).fill('#ffffff');
        const ny = drawHeader(doc,false,'','');
        doc.y = ny;
        gPageNum++;
        gTotalPages++;
      }
      renderQuestion(doc,q,start+i);
    });

    drawFooter(doc);
    doc.end();
  });
}

// ══════════════════════════════════════
//  HTML 清理
// ══════════════════════════════════════
function stripHtml(h){
  if(!h)return'';
  // // 调试：输出原始内容前200字符，包含所有非ASCII字符的码点
  // const nonAscii = [...h].filter(c => c.charCodeAt(0) > 127).map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase());
  // if(nonAscii.length > 0) console.log('[PDF-DEBUG] 非ASCII字符:', JSON.stringify(nonAscii.slice(0,20)), '| 原始片段:', h.substring(0,300));
  // // 同时检测img标签和特殊HTML结构
  // if(h.includes('<img') || h.includes('□') || h.includes('input')) console.log('[PDF-DEBUG] 检测到img/input/□ | 片段:', h.substring(0,300));

  return h.replace(/<br\s*\/?>/gi,'\n')
    // 填空 input → 下划线（必须在通用标签清除之前）
    .replace(/<input[^>]*>/gi,'___')
    .replace(/<\/?(p|div|tr|h\d|li|ul|ol|table|tbody|thead|th|td|section|article|header|footer|figure|figcaption|textarea|select|button|span|label|form|fieldset|legend|pre|code|blockquote|caption|colgroup|col)[^>]*>/gi,'\n')
    .replace(/<li[^>]*>/gi,'  \u2022 ').replace(/<img[^>]*\/?>/gi,'')
    // 下划线 <u>：内容全为空白（填空位）→ 下划线；有文字 → 组合下划线
    .replace(/<u[^>]*>([\s\u00a0]*)<\/u>/gi, function(m, inner){
      return '___'.repeat(Math.max(1, Math.ceil(inner.length / 4)));
    })
    .replace(/<u[^>]*>/gi, '\u0332').replace(/<\/u>/gi, '\u0332')
    // 水平线 <hr> → 可见横线
    .replace(/<hr\s*\/?>/gi, '\n────────────────────────\n')
    // 最后才清除剩余标签（<u>/<hr>已处理）
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&ensp;/g,' ').replace(/&emsp;/g,'  ')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&mdash;/g,'\u2014').replace(/&ndash;/g,'\u2013')
    .replace(/&bull;/g,'\u2022').replace(/&times;/g,'\u00d7')
    .replace(/&divide;/g,'\u00f7').replace(/&plusmn;/g,'\u00b1')
    // HTML实体形式的方格
    .replace(/&#9[0-9]{3};/g,'___')
    // 宽范围：所有方块/几何形状Unicode → 下划线
    .replace(/[\u2500-\u257f]/g,'___')   // Box Drawing + Geometric Shapes
    .replace(/[\u2b00-\u2bff]/g,'___')   // Miscellaneous Symbols and Arrows
    .replace(/[\u2600-\u26ff]/g,'___')   // Miscellaneous Symbols
    .replace(/[\u2700-\u27bf]/g,'___')   // Dingbats
    // 全角下划线等
    .replace(/\uff3f/g,'____')
    .replace(/\(\s*\)/g,'(    )').replace(/\uff08\s*\uff09/g,'(    )')
    // 连续下划线/波浪线等保留
    .replace(/_{2,}/g,m=>m)
    .replace(/\s{2,}/g,' ').replace(/\n{3,}/g,'\n\n')
    .replace(/^\s+|\s+$/g,'');
}

module.exports={generateWrongQuestionsPDF};
