---
name: "standard-quiz-builder"
description: "Generates standardized local quiz banks (xlsx/apkg) for the fenbi-helper project, including extracting questions from PDF quiz books and converting them to the project's upload format. Invoke when user asks to create, build, or convert question banks, extract from PDF, design quiz templates, or standardize raw question data into the project's upload format."
---

# Standard Quiz Builder · 标准题库生成器

为粉笔助手项目（fenbi-helper）生成可直接上传到本地题库的标准题库文件。覆盖三种来源：**从零生成 xlsx/apkg**、**从 PDF 题库（含扫描版）提取并转换**、**双文件题目册+答案册合并**。所有输出严格对齐 [quizLoader.js](file:///d:/fenbi/fenbi-helper-master/src/util/quizLoader.js) 的解析逻辑。

---

## 一、字段规范（与 quizLoader.js 严格对齐）

### 1. xlsx 表头（首行必需）

| 字段名 | 必填 | 说明 |
|---|---|---|
| 题干 | 是 | 题目正文；也支持列名「题目」 |
| 选项A ~ 选项D | 是 | 至少 4 列；多选可扩展到「选项E」「选项F」 |
| 答案 | 是 | 单选填 `A`/`B`/`C`/`D`；多选填字母组合如 `ABC`，顺序无关，系统自动排序去重 |
| 题型 | 选填 | 「单选」「多选」「多项选择」；留空默认按单选处理 |
| 解析 | 选填 | 题目解析文本 |
| 知识点 | 选填 | 考点标签 |
| 图片URL | 选填 | 题目配图链接，http/https 开头 |
| 题号 | 选填 | 仅记录用，不影响加载 |

**关键约束：**
- 列名严格区分中文，必须完全匹配（如 `选项A` 不能写成 `A选项`）
- 多余列会被忽略，但不会报错
- 一个 `.xlsx` 文件 = 一个题套；文件名作为题套名
- 文件名建议含数字段，如 `专项练习01.xlsx`、`第03套.xlsx`，系统按末尾数字排序

### 2. apkg 字段（Anki 导出，7 字段顺序固定）

apkg 是 Anki 导出包，本质是 ZIP，内含 `collection.anki2` SQLite 数据库。`notes` 表的 `flds` 列用 `\x1f`（0x1F）分隔 7 个字段：

| 序 | 字段 | 说明 |
|---|---|---|
| 1 | 题型 | 「单选」/「多选」/「多项选择」 |
| 2 | 题号 | 题号文本（选填） |
| 3 | 题干 | 题目正文 |
| 4 | 选项 | 用 `<br>` 分隔：`A. 选项一<br>B. 选项二<br>C. 选项三<br>D. 选项四` |
| 5 | 答案 | 单选填单字母；多选填字母组合 |
| 6 | 解析 | 解析文本 |
| 7 | 知识点 | 考点标签 |

---

## 二、多选题处理规则（重要）

系统对多选题的识别与答案处理遵循以下规则，生成题库时必须配合：

1. **题型识别正则：** `/多(选|项)/` → 匹配「多选」「多项选择」「多项选择题」等变体
2. **答案规范化：**
   - 单选题：取首个 `[A-F]` 字母，其余忽略
   - 多选题：提取所有 `[A-F]` 字母，去重后按字母序排列
3. **前端交互：** 多选题不自动跳转，需手动点击「下一题」
4. **判分逻辑：** 后端 `normMulti()` 同样去重排序后比较

**生成多选题时：**
- `题型` 字段必须包含「多选」或「多项」字样
- `答案` 字段填写字母组合（如 `ACD`、`BDE`），顺序无关
- 至少提供 4 个选项，可扩展到 6 个（选项A~选项F）

---

## 三、生成 xlsx 题库（Node.js 脚本模板）

```javascript
// generate-quiz.js
// 依赖：npm install xlsx
const xlsx = require('xlsx');
const path = require('path');

// 题目数据（示例）
const questions = [
  {
    题型: '单选',
    题干: '下列哪项属于宏观经济调控的目标？',
    选项A: '经济增长',
    选项B: '物价稳定',
    选项C: '充分就业',
    选项D: '国际收支平衡',
    答案: 'ABCD', // 注意：单选题只取首字母 A，请按实际正确答案填写
    解析: '宏观经济四大目标：经济增长、物价稳定、充分就业、国际收支平衡。',
    知识点: '宏观经济',
    题号: '1'
  },
  {
    题型: '多选',
    题干: '下列属于货币政策工具的有？',
    选项A: '法定存款准备金率',
    选项B: '再贴现率',
    选项C: '公开市场业务',
    选项D: '税收',
    选项E: '政府支出',
    答案: 'ABC',
    解析: '货币政策工具包括法定存款准备金率、再贴现率、公开市场业务；税收与政府支出属于财政政策工具。',
    知识点: '货币政策',
    题号: '2'
  }
];

// 表头顺序（与 quizLoader.js parseQuestion 的 optionKeys 一致）
const header = ['题号', '题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '答案', '解析', '知识点', '图片URL'];

// 转为二维数组（首行表头 + 数据行）
const aoa = [header];
questions.forEach(q => {
  aoa.push([
    q.题号 || '',
    q.题型 || '单选',
    q.题干 || '',
    q.选项A || '',
    q.选项B || '',
    q.选项C || '',
    q.选项D || '',
    q.选项E || '',
    q.选项F || '',
    q.答案 || '',
    q.解析 || '',
    q.知识点 || '',
    q.图片URL || ''
  ]);
});

// 生成工作簿
const ws = xlsx.utils.aoa_to_sheet(aoa);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');

// 输出文件（命名建议含数字段）
const outPath = path.join(__dirname, '专项练习01.xlsx');
xlsx.writeFile(wb, outPath);
console.log('已生成: ' + outPath + '，共 ' + questions.length + ' 题');
```

**生成多套题：** 循环上述脚本，文件名按 `专项练习01.xlsx`、`专项练习02.xlsx` 递增，放入同一文件夹后整体上传。

---

## 四、生成 apkg 题库（高级，可选）

apkg 生成需借助 Anki 客户端或第三方库（如 Python 的 `genanki`）。若需程序化生成：

```python
# generate-apkg.py
# 依赖：pip install genanki
import genanki

# Anki 模型：7 字段顺序与 quizLoader.js parseApkgFile 严格一致
# [题型, 题号, 题干, 选项, 答案, 解析, 知识点]
model = genanki.Model(
  1607392319,  # 模型 ID（自行固定）
  '粉笔题库模型',
  fields=[
    {'name': '题型'},
    {'name': '题号'},
    {'name': '题干'},
    {'name': '选项'},
    {'name': '答案'},
    {'name': '解析'},
    {'name': '知识点'},
  ],
  templates=[{
    'name': 'Card 1',
    'qfmt': '{{题干}}<br>{{选项}}',
    'afmt': '{{FrontSide}}<hr>答案：{{答案}}<br>解析：{{解析}}',
  }])

deck = genanki.Deck(2059402934, '粉笔专项题库')

# 题目数据
questions = [
  {
    '题型': '单选',
    '题号': '1',
    '题干': '下列哪项是货币政策的工具？',
    '选项': 'A. 法定存款准备金率<br>B. 税收<br>C. 政府支出<br>D. 国债发行',
    '答案': 'A',
    '解析': '货币政策工具由央行执行；税收、政府支出、国债属于财政政策。',
    '知识点': '货币政策',
  },
  # ...更多题目
]

for q in questions:
  note = genanki.Note(
    model=model,
    fields=[q['题型'], q['题号'], q['题干'], q['选项'], q['答案'], q['解析'], q['知识点']])
  deck.add_note(note)

# 导出
genanki.Package(deck).write_to_file('专项练习01.apkg')
print('已生成 apkg 文件')
```

**关键点：** 7 字段顺序必须为 `[题型, 题号, 题干, 选项, 答案, 解析, 知识点]`，且 `选项` 用 `<br>` 分隔。

---

## 五、文件夹组织规范

上传时整体选择一个文件夹，文件夹内放多个 xlsx 或 apkg 文件：

```
我的专项题库/                    ← 文件夹名 = 分类名（原样保留）
├── 专项练习01.xlsx              ← 题套1
├── 专项练习02.xlsx              ← 题套2
├── 专项练习03.xlsx              ← 题套3
└── 专项练习04.xlsx              ← 题套4
```

**规范：**
1. **同格式不混放：** 一个文件夹内只放 xlsx 或只放 apkg，避免混淆
2. **文件名含数字：** 系统按末尾数字段排序，无数字则按文件创建顺序
3. **文件夹名即分类名：** 上传弹窗的「分类名」字段留空时使用文件夹名；填写则覆盖
4. **避免特殊字符：** 文件夹/文件名避免 `/\:*?"<>|` 等 Windows 非法字符

---

## 六、从 PDF 题库提取并转换（重要）

### 适用场景

许多教辅题库原始形态是 PDF：
- **单文件 PDF**：题目、选项、答案、解析在同一份文档中（可能答案解析附在每题后，也可能集中在文末）
- **双文件 PDF**：一本题目册 PDF + 一本答案册 PDF（最常见于纸质教辅扫描件）
- **扫描版 PDF**：纯图片，无文本层，需 OCR

**系统限制：** [quizLoader.js](file:///d:/fenbi/fenbi-helper-master/src/util/quizLoader.js) 只能加载 xlsx / apkg，**不能直接读 PDF**。必须先把 PDF 内容提取并转成本规范定义的 xlsx 格式，再上传。

### 转换流程总览

```
PDF 题库 ──文本提取──> 结构化文本 ──正则/规则解析──> 题目对象数组 ──写入──> 标准 xlsx
              ↑                                                            ↑
       文本层 PDF：pdfplumber/PyMuPDF                         合并题目+答案（双文件场景）
       扫描版 PDF：OCR（paddleocr/Tesseract）
```

### 第一步：PDF 文本提取

#### 1.1 文本层 PDF（可复制文字的 PDF）

推荐 Python `pdfplumber`（按行保留布局）或 `PyMuPDF`（速度更快）：

```python
# extract_pdf_text.py
# 依赖：pip install pdfplumber
import pdfplumber

def extract_text(pdf_path, out_txt_path):
    """提取 PDF 全文，保留分页与行结构"""
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_no, page in enumerate(pdf.pages, 1):
            lines.append(f'=== 第 {page_no} 页 ===')
            text = page.extract_text() or ''
            for line in text.split('\n'):
                lines.append(line.rstrip())
    with open(out_txt_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'已提取 {pdf_path} -> {out_txt_path}，共 {len(lines)} 行')

# 用法
extract_text('题目册.pdf', '题目册.txt')
extract_text('答案册.pdf', '答案册.txt')
```

**关键点：**
- `extract_text()` 保留阅读顺序，适合单栏排版
- 双栏排版用 `page.extract_text(layout=True)` 或按坐标分栏提取
- 表格类内容用 `page.extract_tables()` 单独处理

#### 1.2 扫描版 PDF（图片型，无文本层）

需先 OCR，推荐 `PaddleOCR`（中文识别率高）：

```python
# ocr_pdf.py
# 依赖：pip install paddlepaddle paddleocr pdf2image pillow
# 系统依赖：poppler（pdf2image 需要）
from paddleocr import PaddleOCR
from pdf2image import convert_from_path
import os

def ocr_pdf(pdf_path, out_txt_path):
    ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
    images = convert_from_path(pdf_path, dpi=300)
    lines = []
    for i, img in enumerate(images, 1):
        img_path = f'_tmp_page_{i}.png'
        img.save(img_path, 'PNG')
        result = ocr.ocr(img_path, cls=True)
        lines.append(f'=== 第 {i} 页 ===')
        if result and result[0]:
            for line in result[0]:
                text = line[1][0]
                lines.append(text)
        os.remove(img_path)
    with open(out_txt_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'OCR 完成: {pdf_path} -> {out_txt_path}')

ocr_pdf('扫描题目册.pdf', '题目册.txt')
```

**OCR 注意事项：**
- DPI 建议 300，低于 200 识别率明显下降
- OCR 后**必须人工抽检**，常见错误：`A` 识别为 `4`、`B` 识别为 `8`、`〇` 与 `O` 混淆
- 选项字母前的点号可能丢失，后续正则需宽松匹配

### 第二步：题目结构化解析

从提取的文本中按规则切分出每道题的字段。不同题库排版差异大，**需根据实际样张调整正则**，以下为通用模板：

```python
# parse_questions.py
import re

def parse_quiz_text(txt_path):
    """从题目册文本解析出题目列表"""
    with open(txt_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # 去除页眉页脚（按实际样张调整）
    text = re.sub(r'=== 第 \d+ 页 ===', '', text)
    text = re.sub(r'.*?\d+/\d+.*', '', text)  # 形如 "12/100" 的页码

    questions = []
    # 题号开头：1. / 1、 / （一） / 1)
    # 注意：题号正则需匹配实际排版，常见有 "1." "1、" "1）" "(1)" 等
    q_pattern = re.compile(
        r'(?:^|\n)\s*(?P<no>\d{1,3})\s*[\.、）\)]\s*(?P<stem>.*?)(?=(?:\n\s*\d{1,3}\s*[\.、）\)])|\Z)',
        re.DOTALL
    )

    for m in q_pattern.finditer(text):
        block = m.group('stem')
        q_no = m.group('no')

        # 选项识别：A. / A、 / A) / A）
        opt_pattern = re.compile(
            r'([A-F])\s*[\.、）\)]\s*(.*?)(?=(?:\n\s*[A-F]\s*[\.、）\)])|\Z)',
            re.DOTALL
        )
        options = {}
        for om in opt_pattern.finditer(block):
            letter = om.group(1)
            opt_text = om.group(2).strip().replace('\n', ' ')
            options[letter] = opt_text

        # 题干 = block 去掉选项部分后的剩余
        first_opt_pos = block.find('A.')
        if first_opt_pos < 0:
            first_opt_pos = block.find('A、')
        stem = block[:first_opt_pos].strip().replace('\n', ' ') if first_opt_pos > 0 else block.strip().replace('\n', ' ')

        # 题型推断：选项 5-6 个或题干含"多项""多选"
        q_type = '单选'
        if len(options) > 4 or '多选' in stem or '多项' in stem:
            q_type = '多选'

        questions.append({
            '题号': q_no,
            '题型': q_type,
            '题干': stem,
            '选项A': options.get('A', ''),
            '选项B': options.get('B', ''),
            '选项C': options.get('C', ''),
            '选项D': options.get('D', ''),
            '选项E': options.get('E', ''),
            '选项F': options.get('F', ''),
        })
    return questions

def parse_answer_text(txt_path):
    """从答案册文本解析出答案映射：题号 -> {答案, 解析}"""
    with open(txt_path, 'r', encoding='utf-8') as f:
        text = f.read()

    answers = {}
    # 答案行常见格式："1. A" "1、ACD" "1. A 解析：..." "1. A 【解析】..."
    ans_pattern = re.compile(
        r'(?:^|\n)\s*(?P<no>\d{1,3})\s*[\.、）\)]\s*(?P<ans>[A-Fa-f]+)\s*(?:[:：】\s]*|\s*【?解析】?\s*[:：]?\s*)(?P<analysis>.*?)(?=(?:\n\s*\d{1,3}\s*[\.、）\)])|\Z)',
        re.DOTALL
    )
    for m in ans_pattern.finditer(text):
        no = m.group('no')
        ans = m.group('ans').upper()
        analysis = m.group('analysis').strip().replace('\n', ' ')
        answers[no] = {'答案': ans, '解析': analysis}
    return answers
```

**解析规则需根据样张调整的关键点：**
- 题号正则：`1.` `1、` `1）` `(1)` `（一）` 等排版差异
- 选项标识：`A.` `A、` `A)` `A）` `（A）` 等
- 答案行：`1.A` `1、A` `1. A 解析：xxx` `1. A【解析】xxx`
- 多选题题型推断：选项数 > 4、题干含"多选/多项"、答案含多个字母
- 解析可能跨行，需合并到一行（写入 xlsx 时换行会被压缩）

### 第三步：题目与答案合并

```python
def merge_quiz_and_answer(quiz_list, answer_map):
    """合并题目列表与答案映射，未匹配的题目告警"""
    merged = []
    unmatched = []
    for q in quiz_list:
        no = q['题号']
        ans_info = answer_map.get(no)
        if not ans_info:
            unmatched.append(no)
            q['答案'] = ''
            q['解析'] = ''
            q['知识点'] = ''
        else:
            q['答案'] = ans_info['答案']
            q['解析'] = ans_info['解析']
            q['知识点'] = ''
        merged.append(q)
    if unmatched:
        print(f'警告：{len(unmatched)} 题未找到答案，题号: {unmatched}')
    return merged
```

**合并键选择：**
- 题目册与答案册都含「题号」→ 按题号匹配（推荐，最稳）
- 两本题目顺序、数量完全一致 → 按索引匹配（兜底方案）
- 题号含套号（如 `1-1`、`2-15`）→ 用完整键匹配

### 第四步：写入标准 xlsx

```python
# write_xlsx.py
# 依赖：pip install openpyxl 或 pip install xlsxwriter
from openpyxl import Workbook

HEADER = ['题号', '题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '答案', '解析', '知识点', '图片URL']

def write_to_xlsx(questions, out_path):
    wb = Workbook()
    ws = wb.active
    ws.append(HEADER)
    for q in questions:
        ws.append([
            q.get('题号', ''),
            q.get('题型', '单选'),
            q.get('题干', ''),
            q.get('选项A', ''),
            q.get('选项B', ''),
            q.get('选项C', ''),
            q.get('选项D', ''),
            q.get('选项E', ''),
            q.get('选项F', ''),
            q.get('答案', ''),
            q.get('解析', ''),
            q.get('知识点', ''),
            q.get('图片URL', ''),
        ])
    wb.save(out_path)
    print(f'已写入 {out_path}，共 {len(questions)} 题')
```

### 完整流程脚本（单文件版）

```python
# pdf_to_xlsx.py - PDF 题库一键转 xlsx
import pdfplumber
import re
from openpyxl import Workbook

def pdf_to_xlsx(pdf_path, out_xlsx_path, mode='single'):
    """
    mode:
      'single'  - 单文件 PDF，题目与答案在同一文档
      'double'  - 双文件 PDF，需另外提供答案册路径
    """
    # 1. 提取文本
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            lines.append(page.extract_text() or '')
    text = '\n'.join(lines)

    # 2. 解析题目（用上面的 parse_quiz_text 逻辑）
    questions = parse_quiz_text_inline(text)

    # 3. 单文件模式：从同一文本提取答案
    if mode == 'single':
        answer_map = parse_answer_text_inline(text)
        for q in questions:
            ans_info = answer_map.get(q['题号'], {'答案': '', '解析': ''})
            q['答案'] = ans_info['答案']
            q['解析'] = ans_info['解析']

    # 4. 写入 xlsx
    wb = Workbook()
    ws = wb.active
    ws.append(['题号', '题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '答案', '解析', '知识点', '图片URL'])
    for q in questions:
        ws.append([q.get(k, '') for k in ['题号','题型','题干','选项A','选项B','选项C','选项D','选项E','选项F','答案','解析','知识点','图片URL']])
    wb.save(out_xlsx_path)
    print(f'转换完成: {pdf_path} -> {out_xlsx_path} ({len(questions)} 题)')
```

### PDF 提取转换检查清单

- [ ] 确认 PDF 类型：文本层 PDF / 扫描版 PDF（决定用 extract_text 还是 OCR）
- [ ] 确认排版：单栏 / 双栏 / 表格（影响提取策略）
- [ ] 确认结构：单文件含答案 / 双文件题目+答案分离
- [ ] 抽样人工核对前 5 题与末 5 题，确认题号、题干、选项、答案、解析全部对齐
- [ ] 多选题题型字段含「多选」或「多项」
- [ ] 答案字母全大写，多选答案为字母组合
- [ ] 解析文本压缩为单行（避免 xlsx 单元格内换行被渲染为空白）
- [ ] 输出 xlsx 表头严格匹配规范：题号 / 题型 / 题干 / 选项A~F / 答案 / 解析 / 知识点 / 图片URL
- [ ] 文件命名含数字段，多套题按序号递增
- [ ] 上传 `/quiz` 验证：题套数正确、每题有答案与解析、多选题交互正常

---

## 七、生成流程清单

生成标准题库时按以下步骤逐项检查：

- [ ] 确认题目数据字段齐全（题干、选项A~D、答案至少必填）
- [ ] 单选题答案为单个字母（A/B/C/D）
- [ ] 多选题答案为字母组合，`题型` 字段含「多选」或「多项」
- [ ] 多选题选项若超过 4 个，确保使用「选项E」「选项F」列
- [ ] xlsx 首行为表头，列名严格匹配（区分中文）
- [ ] 文件名含数字段，便于排序
- [ ] 同文件夹内不混放 xlsx 与 apkg
- [ ] 上传后在 `/quiz` 页面验证题套数量、题目数量、多选题交互

---

## 八、验证与调试

生成并上传后，可在以下位置验证：

1. **题库列表：** 访问 `http://localhost:3000/quiz`，确认分类与题套数量正确
2. **单题验证：** 进入任一题套，检查题干、选项、答案、解析渲染
3. **多选验证：** 多选题选择选项后不应自动跳转，需手动点击「下一题」
4. **结果页验证：** 提交后检查解析文本无大量空白、知识点标签显示
5. **后端日志：** 启动时控制台输出 `[quizLoader] 加载完成，共 X 套题，Y 道题`

**常见问题排查：**
- 题套不显示 → 检查文件名是否含目标扩展名、文件夹路径是否正确
- 多选题被当单选 → 检查 `题型` 字段是否包含「多选」或「多项」字样
- 答案错误 → 单选题答案只取首字母，多选题答案去重排序，确认填写规范
- 解析空白多 → 已在结果页自动 `replace(/\s+/g, ' ')`，源数据可保留原始换行
