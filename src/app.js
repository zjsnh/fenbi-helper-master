const Koa = require('koa');
const KoaRouter = require('koa-router');
const koaBody = require('koa-body');
const moment = require('moment');

const render = require('koa-ejs');
const serve = require('koa-static');


const path = require('path');
const qs = require('qs');
const url = require('url');
const fs = require('fs');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = new Koa();
const router = new KoaRouter();

const exerciseResult = require('./service/exercisesResult');
const loginService = require('./service/loginService');
const quizLoader = require('./util/quizLoader');
const quizRecord = require('./util/quizRecord');

render(app, {
    root: path.join(__dirname, 'views'),
    layout: false,
    viewExt: 'ejs',
    cache: false,
    debug: false,
});

app.use(serve(__dirname + '/views/js'))
app.use(serve(__dirname + '/views'))

app.use(koaBody({
    multipart: true,
    formidable: {
        maxFileSize: 200 * 1024 * 1024
    }
}))

// 动态页面禁止浏览器缓存，确保数据始终最新
app.use(async (ctx, next) => {
    await next();
    if (ctx.method === 'GET' && ctx.status === 200 && ctx.type === 'text/html') {
        ctx.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        ctx.set('Pragma', 'no-cache');
        ctx.set('Expires', '0');
    }
});

app.use(async(ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.error('Server Error:', err.message, err.stack);
        ctx.status = 500;
        if (ctx.path.startsWith('/api/')) {
            ctx.body = { code: 500, message: err.message || '服务器内部错误' };
        } else {
            ctx.body = '服务器内部错误: ' + (err.message || '');
        }
    }
});

app.use(router.routes()).use(router.allowedMethods())

app.use(async(ctx, next) => {
    if (ctx.status === 404) {
        if (ctx.path.startsWith('/api/')) {
            ctx.body = { code: 404, message: '接口不存在: ' + ctx.path };
        } else {
            ctx.redirect('/history-category-complex');
        }
    } else {
        next();
    }
});

app.listen(3000);


// 来源页白名单：仅允许 from 参数跳转到这些页面，防止开放重定向
const ALLOWED_FROM_PATHS = new Set([
    '/history-category-complex',
    '/history-category',
    '/history',
    '/wrong-questions',
    '/word-frequency',
    '/quiz'
]);

function resolveBackUrl(from) {
    if (from && ALLOWED_FROM_PATHS.has(from)) return from;
    return '/history-category-complex';
}

router.get('/exercise/:exerciseId', async ctx => {
    let exerciseId = ctx.params.exerciseId;
    let costThreshold = Number.parseInt(ctx.query.cost || 70);
    let cookie = ctx.request.headers['cookie']
    let renderObj = await exerciseResult.getResultObj(exerciseId, costThreshold, cookie);
    if (renderObj) {
        renderObj.backUrl = resolveBackUrl(ctx.query.from);
        await ctx.render('exerciseResult', renderObj);
    } else {
        ctx.redirect('/setup?redirectPath=' + ctx.originalUrl);
    }
});

router.get('/question/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    let renderObj = await exerciseResult.getQuestion(questionId, cookie);
    if (renderObj) {
        renderObj.backUrl = resolveBackUrl(ctx.query.from);
        await ctx.render('question', renderObj);
    } else {
        ctx.redirect('/setup?redirectPath=' + ctx.originalUrl);
    }
});

router.get('/wrong-questions', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('wrong-questions', await exerciseResult.getWrongQuestions(cookie));
    }
});

router.get('/word-frequency', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('word-frequency', await exerciseResult.getWordFrequency(cookie));
    }
});

router.get('/api/wrong-questions/:keypointId', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        return;
    }
    try {
        let result = await exerciseResult.getWrongQuestionDetails(ctx.params.keypointId, cookie);
        ctx.body = result;
    } catch (e) {
        ctx.body = { error: e.message, questions: [] };
    }
});

router.post('/api/wrong-questions/refresh', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }
    try {
        const cache = require('./util/cacheUtil');
        let count = cache.clearByPrefix('wrong_');
        ctx.body = { code: 200, message: '同步成功，已清除 ' + count + ' 条缓存', cleared: count };
    } catch (e) {
        ctx.body = { code: 500, message: '同步失败：' + e.message };
    }
});

router.post('/api/saveNote/:questionId', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie']
    let questionId = ctx.params.questionId;
    let {noteContent} = ctx.request.body;
    ctx.body = await exerciseResult.saveNote(questionId, noteContent, cookie);
});

router.get('/calc', async ctx => {
    await ctx.render('calc', {});
});

router.get('/shenlun-format', async ctx => {
    await ctx.render('shenlun-format', {});
});

// ══════════════════════════════════════
//  本地题库刷题模块
// ══════════════════════════════════════
// 题库图片静态服务：/quiz-img/:source/* => 在 local-quiz-bank/ 和 uploaded-quizzes/ 下查找 :source/images/...
// 用于 xlsx 相对路径图片 + apkg 内 media 图片（parseApkgFile 解压到 images/ 子目录）
router.get('/quiz-img/:source/(.*)', async ctx => {
    const source = decodeURIComponent(ctx.params.source);
    const relPath = ctx.params[0];
    // 安全校验：禁止路径穿越
    if (relPath.indexOf('..') >= 0 || path.isAbsolute(relPath)) {
        ctx.status = 400;
        ctx.body = 'Invalid path';
        return;
    }
    // 依次在 local-quiz-bank/ 和 uploaded-quizzes/ 下查找
    const candidates = [
        path.join(__dirname, '..', 'local-quiz-bank', source, relPath),
        path.join(__dirname, '..', 'uploaded-quizzes', source, relPath)
    ];
    let fullPath = null;
    for (const p of candidates) {
        if (fs.existsSync(p)) { fullPath = p; break; }
    }
    if (!fullPath) {
        ctx.status = 404;
        ctx.body = 'Image not found';
        return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    ctx.type = mimeMap[ext] || 'application/octet-stream';
    ctx.body = fs.createReadStream(fullPath);
});

router.get('/quiz', async ctx => {
    const groups = await quizLoader.listSets();
    const progressMap = quizRecord.getAllSetProgress();

    // 组装数据
    let totalQuestions = 0;
    let totalSets = 0;
    let totalAnswered = 0;
    const sources = [];
    Object.keys(groups).forEach(sourceName => {
        const sets = groups[sourceName].map(s => {
            const p = progressMap[s.setId] || { doneCount: 0, bestRate: null };
            totalAnswered += p.doneCount * s.questionCount;
            return {
                setId: s.setId,
                setName: s.setName,
                source: s.source,
                questionCount: s.questionCount,
                doneCount: p.doneCount || 0,
                bestRate: p.bestRate !== null && p.bestRate >= 0 ? p.bestRate : null
            };
        });
        const totalQ = sets.reduce((sum, s) => sum + s.questionCount, 0);
        totalQuestions += totalQ;
        totalSets += sets.length;
        sources.push({ name: sourceName, sets, totalQ, uploaded: quizLoader.isUploadedSource(sourceName) });
    });

    await ctx.render('quiz-list', {
        sources, totalSets, totalQuestions, totalAnswered
    });
});

// 自定义出题：从多个题套聚合题目，支持随机抽取指定数量
// 注意：此路由必须在 /quiz/:setId 之前注册，否则 custom 会被当作 setId 参数
router.get('/quiz/custom', async ctx => {
    const setIdsStr = ctx.query.setIds || '';
    const count = ctx.query.count ? parseInt(ctx.query.count) : null;
    const setIds = setIdsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (setIds.length === 0) {
        ctx.redirect('/quiz');
        return;
    }
    const customSet = await quizLoader.buildCustomSet(setIds, count);
    if (!customSet) {
        ctx.redirect('/quiz');
        return;
    }
    await ctx.render('quiz-play', {
        setId: customSet.setId,
        setName: customSet.setName,
        source: customSet.source,
        questions: customSet.questions
    });
});

router.get('/quiz/:setId', async ctx => {
    const set = await quizLoader.getSet(ctx.params.setId);
    if (!set) {
        ctx.redirect('/quiz');
        return;
    }
    await ctx.render('quiz-play', {
        setId: set.setId,
        setName: set.setName,
        source: set.source,
        questions: set.questions
    });
});

// 提交判分
router.post('/quiz/:setId/submit', async ctx => {
    const setId = ctx.params.setId;
    const set = await quizLoader.getSet(setId);
    if (!set) {
        ctx.body = { error: '题套不存在' };
        ctx.status = 404;
        return;
    }

    const body = ctx.request.body;
    const answers = body.answers || {};          // { qNo: 'A' }
    const flaggedSet = new Set((body.flagged || []).map(n => Number(n)));
    // 规范化时间戳：部分环境下 body.endTime 可能是 .NET ticks（18位），需转为 Unix ms（13位）
    function normTs(ts) {
        ts = Number(ts);
        if (!ts || isNaN(ts)) return Date.now();
        if (ts > 1e15) return Math.floor((ts - 621355968000000000) / 10000); // .NET ticks → Unix ms
        return ts;
    }
    const startTime = normTs(body.startTime);
    const endTime = normTs(body.endTime);
    const durationMs = body.durationMs ? Number(body.durationMs) : (endTime - startTime);

    // 判分
    let correctCount = 0, wrongCount = 0, unansweredCount = 0;
    const isMulti = (t) => /多(选|项)/.test(String(t));
    const normMulti = (s) => {
        const letters = String(s || '').toUpperCase().match(/[A-F]/g) || [];
        return Array.from(new Set(letters)).sort().join('');
    };
    const questions = set.questions.map(q => {
        // 无选项题（填空/解答题）：不参与判分，标记为 null（不计入对错与未答）
        if (!q.options || q.options.length === 0) {
            return {
                uid: q.uid,
                qNo: q.qNo,
                type: q.type,
                stem: q.stem,
                options: q.options,
                answer: q.answer,
                myAnswer: '',
                correct: null,
                flagged: flaggedSet.has(q.qNo),
                analysis: q.analysis,
                knowledge: q.knowledge,
                imageUrl: q.imageUrl,
                analysisImageUrl: q.analysisImageUrl || ''
            };
        }
        let myAnswer = answers[q.qNo] || '';
        // 多选题：用户答案排序后再比较
        if (isMulti(q.type)) {
            myAnswer = normMulti(myAnswer);
        }
        let correct;
        if (!myAnswer) {
            unansweredCount++;
            correct = null; // 未答
        } else if (myAnswer === q.answer) {
            correctCount++;
            correct = true;
        } else {
            wrongCount++;
            correct = false;
        }
        return {
            uid: q.uid,
            qNo: q.qNo,
            type: q.type,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            myAnswer: myAnswer,
            correct: correct,
            flagged: flaggedSet.has(q.qNo),
            analysis: q.analysis,
            knowledge: q.knowledge,
            imageUrl: q.imageUrl,
            analysisImageUrl: q.analysisImageUrl || ''
        };
    });

    const answeredCount = correctCount + wrongCount;
    const accuracy = answeredCount > 0
        ? Math.round((correctCount / answeredCount) * 1000) / 10
        : 0;
    const flaggedCount = questions.filter(q => q.flagged).length;

    const recordId = 'quiz_' + setId + '_' + Date.now();
    const finishedTime = moment(endTime).format('YYYY-MM-DD HH:mm:ss');
    const finishedDate = moment(endTime).format('YYYY-MM-DD');
    const durationDesc = formatDuration(durationMs);

    const record = {
        recordId,
        setId,
        setName: set.setName,
        source: set.source,
        startTime,
        endTime,
        durationMs,
        durationDesc,
        finishedTime,
        finishedDate,
        questionCount: set.questions.length,
        answeredCount,
        correctCount,
        wrongCount,
        unansweredCount,
        accuracy,
        flaggedCount,
        questions,
        // 兼容 exercise_history 字段
        id: recordId,
        cleanName: set.setName,
        sheet: { name: set.setName, type: 999, questionCount: set.questions.length },
        updatedTime: endTime,
        elapsedTime: Math.round(durationMs / 1000),
        answerCount: answeredCount,
        correctRate: accuracy,
        status: 1,
        client: 'WEB',
        userAnswers: {},
        _isLocalQuiz: true
    };

    // 保存到 quiz_records
    quizRecord.saveRecord(record);

    // 同步错题到 wrong_q 缓存（keypointId = 'local_quiz'）
    syncWrongQuestionsToCache(questions, record);

    // 同步到 exercise_history 缓存（合并本地题库记录到练习记录）
    syncToExerciseHistory(record);

    console.log('Quiz 提交: ' + set.setName + ' 正确率=' + accuracy + '% 用时=' + durationDesc);
    ctx.body = { recordId, accuracy, correctCount, wrongCount, unansweredCount };
});

// 当日错题重做：从指定日期（可选指定练习）的错题构建重做题集，跳转到 quiz-play 页面
router.post('/api/quiz/redo', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }
    try {
        const { date, exerciseIds } = ctx.request.body;
        if (!date) {
            ctx.body = { error: '请提供日期' };
            ctx.status = 400;
            return;
        }
        console.log('当日错题重做: date=' + date + (Array.isArray(exerciseIds) && exerciseIds.length > 0 ? ', exerciseIds=' + exerciseIds.join(',') : ''));
        const stats = await exerciseResult.getDailyWrongStats(date, cookie, exerciseIds);
        if (!stats.questions || stats.questions.length === 0) {
            ctx.body = { error: '所选范围无错题数据' };
            ctx.status = 404;
            return;
        }

        // 将错题转为 quiz-play 格式
        function normAnswer(ans) {
            let val = (ans && typeof ans === 'object') ? ans.choice : ans;
            if (val === 'A' || val === 'B' || val === 'C' || val === 'D' || val === 'E' || val === 'F') return val;
            if (val === 0 || val === '0') return 'A';
            if (val === 1 || val === '1') return 'B';
            if (val === 2 || val === '2') return 'C';
            if (val === 3 || val === '3') return 'D';
            if (val === 4 || val === '4') return 'E';
            if (val === 5 || val === '5') return 'F';
            return '';
        }
        // 去除选项中的 HTML 标签（粉笔选项可能含 <p> 等）
        function stripHtml(s) {
            return String(s || '').replace(/<[^>]+>/g, '').trim();
        }

        const questions = stats.questions.map((q, i) => ({
            uid: '',
            setId: '',
            source: q.source || '错题重做',
            qNo: i + 1,
            type: '单选',
            stem: q.content || '',
            options: (q.options || []).map(opt => typeof opt === 'string' ? stripHtml(opt) : stripHtml(opt.content || opt.text || String(opt))),
            answer: normAnswer(q.correctAnswer),
            analysis: q.solution || '',
            knowledge: Array.isArray(q.keypoints) ? q.keypoints.join('、') : (q.knowledge || ''),
            imageUrl: '',
            analysisImageUrl: ''
        })).filter(q => q.stem && q.options.length > 0 && q.answer);

        if (questions.length === 0) {
            ctx.body = { error: '错题数据解析失败，无法重做' };
            ctx.status = 404;
            return;
        }

        const customId = 'custom_redo_' + date + '_' + Date.now();
        const setName = '错题重做(' + date + (Array.isArray(exerciseIds) && exerciseIds.length > 0 ? ' 所选' + exerciseIds.length + '个练习' : ' 当日') + ') · ' + questions.length + '题';
        quizLoader.registerCustomSet(customId, '错题重做', setName, questions);
        console.log('错题重做题集已注册: ' + customId + ', ' + questions.length + ' 题');
        ctx.body = { setId: customId, questionCount: questions.length };
    } catch (e) {
        console.error('错题重做失败:', e.message, e.stack);
        ctx.body = { error: '构建重做题集失败: ' + e.message };
        ctx.status = 500;
    }
});

function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + '分' + (s < 10 ? '0' : '') + s + '秒';
}

// 同步错题到 wrong_q 缓存
function syncWrongQuestionsToCache(questions, record) {
    const cache = require('./util/cacheUtil');
    const cacheKey = 'wrong_q_local_quiz';
    let cached = cache.readCache(cacheKey, 365 * 24 * 60 * 60 * 1000);
    let existing = (cached && cached.questions) || [];

    // 移除该 recordId 下的旧错题（重新提交时替换）
    existing = existing.filter(q => q.recordId !== record.recordId);

    // 加入本次错题
    questions.forEach(q => {
        if (q.correct === false) {
            existing.push({
                questionId: q.uid,
                recordId: record.recordId,
                setId: record.setId,
                content: q.stem,
                options: q.options,
                correctAnswer: { choice: String.fromCharCode(65 + q.options.indexOf(q.answer) >= 0 ? q.options.indexOf(q.answer) : 0), type: 201 },
                correctAnswerLetter: q.answer,
                myAnswer: q.myAnswer,
                difficulty: 3,
                source: record.setName,
                tags: [],
                keypoints: [record.source, q.knowledge].filter(Boolean),
                correctRatio: null,
                mostWrongAnswer: null,
                solution: q.analysis,
                _isLocalQuiz: true
            });
        }
    });

    cache.writeCache(cacheKey, { questions: existing }, 365 * 24 * 60 * 60 * 1000);
    console.log('错题本同步: 共 ' + existing.length + ' 道本地题库错题');
}

// 同步到 exercise_history 缓存
function syncToExerciseHistory(record) {
    const cache = require('./util/cacheUtil');
    const cacheKey = 'exercise_history';
    let cached = cache.readCache(cacheKey, 30 * 24 * 60 * 60 * 1000);
    if (!cached || !cached.data) {
        // 没有缓存，初始化一个空结构
        cached = {
            _cachedAt: Date.now(),
            _expireMs: 30 * 24 * 60 * 60 * 1000,
            data: {
                groupItems: [],
                exerciseHeatMapData: {},
                exerciseHistoryGroup: {},
                exerciseHistory: []
            }
        };
    }
    const data = cached.data;

    // 移除该 recordId 的旧记录
    data.exerciseHistory = (data.exerciseHistory || []).filter(h => h.id !== record.id);

    // 插入到列表头部（最新优先）
    data.exerciseHistory.unshift({
        id: record.id,
        key: record.id,
        userId: 0,
        createdTime: record.startTime,
        updatedTime: record.endTime,
        status: 1,
        quizId: 0,
        client: 'WEB',
        features: {},
        version: 0,
        userAnswers: {},
        elapsedTime: record.elapsedTime,
        currentTime: record.endTime,
        sheet: {
            id: 0,
            keypointId: 0,
            type: 999,
            name: record.setName,
            paperId: 0,
            questionCount: record.questionCount,
            time: 0,
            chapters: [],
            questionIds: []
        },
        // 本地题库扩展字段：用于列表视图显示「题库名称 + 题目数量」
        source: record.source || '',
        setId: record.setId || '',
        setName: record.setName || '',
        questionCount: record.questionCount,
        correctCount: record.correctCount,
        score: 0,
        finishedTime: record.finishedTime,
        finishedDate: record.finishedDate,
        answerCount: record.answeredCount,
        correctRate: record.accuracy,
        cleanName: record.cleanName,
        _isLocalQuiz: true
    });

    // 重新分组
    data.exerciseHistoryGroup = groupExerciseHistory(data.exerciseHistory);

    // 重新计算热力图
    data.exerciseHeatMapData = {};
    data.exerciseHistory.forEach(h => {
        let v = moment(h.finishedDate).toDate().getTime() / 1000;
        data.exerciseHeatMapData[v] = (data.exerciseHeatMapData[v] || 0) + (h.answerCount || 0);
    });

    cache.writeCache(cacheKey, { data }, 30 * 24 * 60 * 60 * 1000);
    console.log('练习记录同步: 已加入本地题库记录 ' + record.setName);
}

// 分组函数（与 exercisesResult.js 保持一致）
function groupExerciseHistory(exerciseHistory) {
    const _ = require('lodash');
    return _.groupBy(exerciseHistory, h => {
        let name = (h.sheet && h.sheet.name) || '';
        if (h._isLocalQuiz) {
            h.cleanName = name;
            return '本地题库';
        } else if (name.startsWith('专项智能练习')) {
            h.cleanName = name.replace(/(专项智能练习)（(.*)）/, '$1');
            return name.replace(/专项智能练习（(.*)）/, '$1');
        } else if (name.startsWith('每日演练')) {
            h.cleanName = name;
            return '每日演练';
        } else {
            return 'others';
        }
    });
}

router.get('/quiz-result/:recordId', async ctx => {
    const record = quizRecord.getRecord(ctx.params.recordId);
    await ctx.render('quiz-result', {
        record,
        backUrl: resolveBackUrl(ctx.query.from)
    });
});

// 上传本地题库文件夹
router.post('/api/quiz/upload-folder', async ctx => {
    try {
        const filesObj = ctx.request.files || {};
        // 取 field 名为 files 的文件列表
        let fileList = filesObj.files || filesObj['files'] || [];
        if (!Array.isArray(fileList)) fileList = [fileList];

        const source = (ctx.request.body.source || '').trim();
        const folderNameRaw = (ctx.request.body.folderName || '').trim();

        if (fileList.length === 0) {
            ctx.body = { code: 400, message: '未收到任何文件，请选择包含 xlsx / apkg / md 的文件夹' };
            return;
        }

        // 仅保留目标扩展名文件
        const validFiles = fileList.filter(f => {
            const n = (f.name || '').toLowerCase();
            return n.endsWith('.xlsx') || n.endsWith('.apkg') || n.endsWith('.md');
        });
        if (validFiles.length === 0) {
            ctx.body = { code: 400, message: '文件夹内未发现 .xlsx / .apkg / .md 文件' };
            return;
        }

        // 检测主扩展名（取数量多的那种）
        const xlsxCount = validFiles.filter(f => f.name.toLowerCase().endsWith('.xlsx')).length;
        const apkgCount = validFiles.filter(f => f.name.toLowerCase().endsWith('.apkg')).length;
        const mdCount = validFiles.filter(f => f.name.toLowerCase().endsWith('.md')).length;
        let ext;
        if (mdCount >= xlsxCount && mdCount >= apkgCount) ext = 'md';
        else if (xlsxCount >= apkgCount) ext = 'xlsx';
        else ext = 'apkg';

        // 过滤出对应扩展名的文件（混合时只取主类型，其余忽略）
        const targetFiles = validFiles.filter(f => f.name.toLowerCase().endsWith('.' + ext));

        // 磁盘文件夹名：优先使用原始文件夹名，其次用 source
        const sanitize = s => s.replace(/[\\/:*?"<>|]/g, '_').trim() || '题库';
        const folderName = sanitize(folderNameRaw || source || '上传题库');
        const uploadDir = path.join(__dirname, '..', 'uploaded-quizzes', folderName);
        fs.mkdirSync(uploadDir, { recursive: true });

        // 保存文件
        const savedNames = [];
        for (const f of targetFiles) {
            const baseName = path.basename(f.name);
            const target = path.join(uploadDir, baseName);
            // 路径已由 folderName 唯一化，无需再处理重名
            fs.copyFileSync(f.path, target);
            savedNames.push(baseName);
        }

        // 注册到动态配置并重新加载题库
        const displaySource = source || folderNameRaw || folderName;
        const cfg = quizLoader.addUploadedConfig(folderName, displaySource, ext);
        await quizLoader.reload();

        ctx.body = {
            code: 0,
            message: '上传成功，已加载 ' + savedNames.length + ' 个 ' + ext + ' 文件',
            data: {
                source: cfg.source,
                prefix: cfg.prefix,
                ext: cfg.ext,
                fileCount: savedNames.length,
                files: savedNames
            }
        };
    } catch (err) {
        console.error('[upload-folder] 失败:', err.message, err.stack);
        ctx.status = 500;
        ctx.body = { code: 500, message: '上传失败: ' + err.message };
    }
});

// 卸载上传的题库（按 source 删除）
router.post('/api/quiz/uninstall', async ctx => {
    try {
        const { source } = ctx.request.body;
        if (!source) {
            ctx.body = { code: 400, message: '缺少 source 参数' };
            return;
        }
        // 查找对应动态配置
        const configs = quizLoader.loadDynamicConfigs();
        const cfg = configs.find(c => c.source === source);
        if (!cfg) {
            ctx.body = { code: 404, message: '未找到该题库配置，可能为内置题库，无法卸载' };
            return;
        }
        // 从配置中提取文件夹名（dir 形如 uploaded-quizzes/xxx）
        const folderName = path.basename(cfg.dir);
        // 删除磁盘文件
        const dirPath = path.join(__dirname, '..', cfg.dir);
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
        // 删除动态配置
        quizLoader.removeUploadedConfig(folderName);
        // 重新加载
        await quizLoader.reload();
        ctx.body = { code: 0, message: '已卸载题库：' + source };
    } catch (err) {
        console.error('[uninstall] 失败:', err.message, err.stack);
        ctx.status = 500;
        ctx.body = { code: 500, message: '卸载失败: ' + err.message };
    }
});

// 本地题库结果导出 PDF（按做题记录导出错题+疑题）
router.post('/api/quiz/export-pdf', async ctx => {
    try {
        const { recordId, hideAnswer } = ctx.request.body;
        const record = quizRecord.getRecord(recordId);
        if (!record) {
            ctx.body = { error: '记录不存在' };
            ctx.status = 404;
            return;
        }

        const pdfGenerator = require('./util/pdfGenerator');
        // 选取错题+疑题作为导出内容
        const wrongAndFlagged = record.questions.filter(q => q.correct === false || q.flagged);

        if (wrongAndFlagged.length === 0) {
            ctx.body = { error: '本次练习无错题或疑题，无需导出' };
            ctx.status = 404;
            return;
        }

        // 转换为 pdfGenerator 期望的格式
        const pdfQuestions = wrongAndFlagged.map(q => ({
            content: q.stem,
            options: q.options,
            correctAnswer: { choice: q.answer, type: 201 },
            source: record.setName + ' 第' + q.qNo + '题',
            tags: [],
            keypoints: [record.source, q.knowledge].filter(Boolean),
            solution: q.analysis,
            _myAnswer: q.myAnswer,
            _flagged: q.flagged
        }));

        const categoryName = record.setName + (record.flaggedCount > 0 ? ' · 错题+疑题' : ' · 错题集');
        const pdfBuffer = await pdfGenerator.generateWrongQuestionsPDF({
            categoryName: categoryName,
            questions: pdfQuestions,
            start: 1,
            end: pdfQuestions.length,
            hideAnswer: hideAnswer === true
        });

        const fileName = encodeURIComponent(record.setName + '-错题.pdf');
        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `inline; filename*=UTF-8''${fileName}`);
        ctx.body = pdfBuffer;
    } catch (e) {
        console.error('本地题库PDF导出失败:', e.message, e.stack);
        ctx.body = { error: '导出失败: ' + e.message };
        ctx.status = 500;
    }
});

// 本地题库题套导出 PDF（按 setId 导出整套题，沿用错题本导出逻辑）
router.post('/api/quiz/export-set-pdf', async ctx => {
    try {
        const { setId, start, end, hideAnswer } = ctx.request.body;
        const set = await quizLoader.getSet(setId);
        if (!set) {
            ctx.body = { error: '题套不存在' };
            ctx.status = 404;
            return;
        }

        const pdfGenerator = require('./util/pdfGenerator');
        // 转换为 pdfGenerator 期望的格式
        const pdfQuestions = set.questions.map(q => ({
            content: q.stem,
            options: q.options,
            correctAnswer: { choice: q.answer, type: 201 },
            source: set.setName + ' 第' + q.qNo + '题',
            tags: [],
            keypoints: [set.source, q.knowledge].filter(Boolean),
            solution: q.analysis
        }));

        const categoryName = set.setName;
        const pdfBuffer = await pdfGenerator.generateWrongQuestionsPDF({
            categoryName: categoryName,
            questions: pdfQuestions,
            start: parseInt(start) || 1,
            end: parseInt(end) || pdfQuestions.length,
            hideAnswer: hideAnswer === true
        });

        const fileSuffix = hideAnswer === true ? '' : '（解析）';
        const fileName = encodeURIComponent(set.setName + fileSuffix + '.pdf');
        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `inline; filename*=UTF-8''${fileName}`);
        ctx.body = pdfBuffer;
    } catch (e) {
        console.error('题套PDF导出失败:', e.message, e.stack);
        ctx.body = { error: '导出失败: ' + e.message };
        ctx.status = 500;
    }
});

router.get('/history', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        let data = await exerciseResult.getExerciseHistory(cookie, false);
        // 本地题库记录回填一级题库名（source）
        // 旧缓存记录可能没有 source/setId 字段，需多路径回填
        await quizLoader.loadAll();
        // 从 quiz_records 构建反查映射：recordId -> { setId, source }
        const localRecords = quizRecord.readAll();
        const recMap = {};
        localRecords.forEach(r => { recMap[r.recordId || r.id] = r; });
        data.exerciseHistory.forEach(h => {
            if (!h._isLocalQuiz) return;
            // 路径1：记录自带 source
            if (h.source) return;
            // 路径2：通过 setId 反查 setsMap
            if (h.setId) {
                const src = quizLoader.getSourceBySetIdSync(h.setId);
                if (src) { h.source = src; return; }
            }
            // 路径3：通过 recordId 反查 quiz_records
            const rec = recMap[h.id];
            if (rec) {
                if (rec.source) { h.source = rec.source; h.setId = h.setId || rec.setId; return; }
                if (rec.setId) {
                    const src2 = quizLoader.getSourceBySetIdSync(rec.setId);
                    if (src2) { h.source = src2; h.setId = rec.setId; return; }
                }
            }
            // 兜底
            h.source = (h.sheet && h.sheet.name) ? h.sheet.name : '本地题库';
        });
        // 按日期分组
        let grouped = {};
        let total = 0;
        data.exerciseHistory.forEach(h => {
            let dateKey = moment(h.updatedTime).format('YYYY-MM-DD');
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(h);
            total++;
        });
        // 日期倒序
        let dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
        await ctx.render('history', {
            grouped: grouped,
            dateKeys: dateKeys,
            total: total,
            moment: moment,
            cleanTitle: function(name) { return name.replace(/<[^>]+>/g, ''); }
        });
    }
});

router.get('/history-category', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('history-category', await exerciseResult.getExerciseHistory(cookie, false));
    }
});

router.get('/history-category-complex', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        let forceRefresh = ctx.query.refresh === '1';
        let data = await exerciseResult.getExerciseHistory(cookie, forceRefresh);
        await ctx.render('history-category-complex', data);
    }
});

router.get('/setup', async ctx => {
    await ctx.render('setup', {});
});

router.post('/api/login', async ctx => {
    let {phone, password} = ctx.request.body;
    try {
        let result = await loginService.login(phone, password);
        let cookies = result.cookies;
        let body = result.body;
        if (cookies.length > 1) {
            cookies.forEach(cookie => {
                let {name, value} = cookie;
                ctx.cookies.set(name, value, {
                    path: '/',
                    maxAge: 0,
                    expires: new Date('2099-07-06'),
                    httpOnly: false
                });
            });
            let referer = ctx.request.headers.referer;
            let redirectPath = qs.parse(url.parse(referer).query)['redirectPath'] || '/history';
            ctx.body = {
                code: 200,
                redirectPath
            };
        } else {
            ctx.body = {
                code: 500,
                message: (body && body.message) || '登录失败，请检查账号密码'
            };
        }
    } catch (e) {
        ctx.body = {
            code: 500,
            message: '登录请求异常：' + e.message
        };
    }
});

router.post('/api/collect/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    await exerciseResult.addCollect(questionId, cookie);
    ctx.body = '';
});

router.del('/api/collect/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    await exerciseResult.delCollect(questionId, cookie);
    ctx.body = '';
});

router.get('/api/video/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie'];
    try {
        ctx.body = await exerciseResult.getVideoUrl(questionId, cookie);
    } catch (e) {
        console.error('视频解析获取失败:', e.message);
        ctx.body = null;
    }
});

router.get('/api/comment/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getComments(questionId, cookie);
});

router.post('/api/zj', koaBody(), async ctx => {
    let {word} = ctx.request.body;
    ctx.body = await exerciseResult.zjWord(word);
});

router.get('/word-frequency', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('word-frequency', {});
    }
});

router.get('/api/word-frequency', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }
    try {
        let forceRefresh = ctx.query.refresh === '1';
        ctx.body = await exerciseResult.getWordFrequency(cookie, forceRefresh);
    } catch (e) {
        ctx.body = { error: e.message, words: [], total: 0 };
    }
});

router.post('/api/word-frequency/refresh', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }
    try {
        let data = await exerciseResult.getWordFrequency(cookie, true);
        ctx.body = {
            code: 200,
            message: '更新成功，共 ' + (data.words.length + data.idioms.length) + ' 条词语',
            total: data.words.length + data.idioms.length,
            cachedAt: data.cachedAt
        };
    } catch (e) {
        ctx.body = { code: 500, message: '更新失败：' + e.message };
    }
});

router.post('/api/wrong-questions-by-ids', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }
    try {
        let { ids } = ctx.request.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            ctx.body = [];
            return;
        }
        let solutions = await exerciseResult.getSolutionsByIds(ids, cookie);
        let questions = ids.map(id => {
            let sol = solutions[id];
            if (!sol) return null;
            // 解析可能在多个位置
            let solution = sol.solution || sol.explanation || sol.analysis || sol.detail;
            // 如果都没有，尝试从 accessories 中找
            if (!solution && sol.accessories) {
                for (let acc of sol.accessories) {
                    if (acc.solution || acc.explanation) {
                        solution = acc.solution || acc.explanation;
                        break;
                    }
                }
            }
            console.log('[Q-DETAIL] id:', id, 'hasSolution:', !!solution, 'solKeys:', Object.keys(sol).join(','));
            return {
                questionId: id,
                content: sol.content,
                options: sol.accessories && sol.accessories[0] ? sol.accessories[0].options : [],
                correctAnswer: sol.correctAnswer,
                source: sol.source,
                solution: solution
            };
        }).filter(q => q !== null);
        console.log('[Q-DETAIL] 返回', questions.length, '题, 有解析:', questions.filter(q=>q.solution).length);
        ctx.body = questions;
    } catch (e) {
        ctx.body = { error: e.message };
        ctx.status = 500;
    }
});

// PDF 导出路由
router.post('/api/wrong-questions/pdf', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }

    try {
        const { keypointId, start, end } = ctx.request.body;
        console.log('PDF导出请求: keypointId=' + keypointId + ', start=' + start + ', end=' + end);
        const pdfGenerator = require('./util/pdfGenerator');

        // 获取题目详情
        const result = await exerciseResult.getWrongQuestionDetails(keypointId, cookie);

        if (!result.questions || result.questions.length === 0) {
            ctx.body = { error: '没有可导出的题目' };
            ctx.status = 404;
            return;
        }

        // 生成 PDF（仅使用标准单栏模板）
        const pdfBuffer = await pdfGenerator.generateWrongQuestionsPDF({
            categoryName: result.name || '错题本',
            questions: result.questions,
            start: parseInt(start) || 1,
            end: parseInt(end) || result.questions.length
        });
        
        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `attachment; filename="wrong-questions-${keypointId}.pdf"`);
        ctx.body = pdfBuffer;
    } catch (e) {
        console.error('PDF生成失败:', e.message);
        ctx.body = { error: 'PDF生成失败: ' + e.message };
        ctx.status = 500;
    }
});

// 按日期导出当日错题 PDF（含逻辑填空词语统计页）
router.post('/api/export-daily-wrong-pdf', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }

    try {
        const { date, exerciseIds } = ctx.request.body;
        if (!date) {
            ctx.body = { error: '请提供日期' };
            ctx.status = 400;
            return;
        }
        console.log('当日错题统计: date=' + date + (Array.isArray(exerciseIds) && exerciseIds.length > 0 ? ', exerciseIds=' + exerciseIds.join(',') : ''));
        const pdfGenerator = require('./util/pdfGenerator');

        const stats = await exerciseResult.getDailyWrongStats(date, cookie, exerciseIds);

        if (!stats.questions || stats.questions.length === 0) {
            ctx.body = { error: '所选范围无错题数据' };
            ctx.status = 404;
            return;
        }

        const pdfBuffer = await pdfGenerator.generateDailyWrongStatsPDF(stats, { hideAnswer: true });

        ctx.set('Content-Type', 'application/pdf');
        const fileName = date + (Array.isArray(exerciseIds) && exerciseIds.length > 0 ? '-错题(所选' + exerciseIds.length + '个练习)' : '-当日错题') + '.pdf';
        ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        ctx.body = pdfBuffer;
    } catch (e) {
        console.error('当日错题PDF生成失败:', e.message);
        ctx.body = { error: 'PDF生成失败: ' + e.message };
        ctx.status = 500;
    }
});

// 按练习记录批量导出错题/未写题目 PDF
router.post('/api/exercises/export-pdf', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        ctx.status = 401;
        return;
    }
    try {
        const { exerciseIds, type, moduleName } = ctx.request.body;
        if (!exerciseIds || !Array.isArray(exerciseIds) || exerciseIds.length === 0) {
            ctx.body = { error: '请至少选择一个练习' };
            ctx.status = 400;
            return;
        }
        if (type !== 'wrong' && type !== 'unanswered') {
            ctx.body = { error: '类型参数无效' };
            ctx.status = 400;
            return;
        }

        console.log('练习导出PDF: type=' + type + ', exerciseIds=' + exerciseIds.join(',') + ', module=' + moduleName);
        const questions = await exerciseResult.getQuestionsByExerciseIds(exerciseIds, type, cookie);

        if (!questions || questions.length === 0) {
            ctx.body = { error: type === 'wrong' ? '所选练习中没有错题' : '所选练习中没有未写题目' };
            ctx.status = 404;
            return;
        }

        const pdfGenerator = require('./util/pdfGenerator');
        const categoryName = (moduleName || '') + (type === 'wrong' ? ' · 错题集' : ' · 未写题目');
        const pdfBuffer = await pdfGenerator.generateWrongQuestionsPDF({
            categoryName: categoryName,
            questions: questions,
            start: 1,
            end: questions.length
        });

        const fileName = encodeURIComponent((moduleName || '练习') + (type === 'wrong' ? '-错题' : '-未写') + '.pdf');
        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        ctx.body = pdfBuffer;
    } catch (e) {
        console.error('练习导出PDF失败:', e.message, e.stack);
        ctx.body = { error: '导出失败: ' + e.message };
        ctx.status = 500;
    }
});

router.get('/favicon.ico', async ctx => {
    ctx.body = ''
});

// 调试接口：查看API原始返回
router.get('/api/debug/exercises', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    if (!cookie || !cookie.includes('userid')) {
        ctx.body = { error: '请先登录' };
        return;
    }
    try {
        const { httpRequest } = require('./util/httpUtil');
        let results = {};

        // 1. 获取分类树，找出所有categoryId
        let category = await httpRequest({
            url: `https://tiku.fenbi.com/api/xingce/categories?&filter=keypoint&app=web&kav=12&version=3.0.0.0`,
            method: 'GET',
            json: true,
            headers: { cookie }
        });
        results.categories = [];
        if (category && category.length > 0) {
            function walkCats(cats, depth) {
                if (!cats) return;
                for (let c of cats) {
                    results.categories.push({ id: c.id, name: c.name, depth: depth });
                    if (c.children) walkCats(c.children, depth + 1);
                }
            }
            walkCats(category, 0);
        }

        // 2. 测试多个categoryId的category-exercises，找出有数据的分类
        results.exercises = {};
        let testIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        if (results.categories.length > 0) {
            testIds = [...new Set([...testIds, ...results.categories.map(c => c.id)])];
        }
        for (let catId of testIds) {
            try {
                let res = await httpRequest({
                    url: `https://tiku.fenbi.com/api/xingce/category-exercises?categoryId=${catId}&cursor=0&count=30`,
                    method: 'GET',
                    json: true,
                    headers: {
                        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'accept-language': 'zh-CN,zh;q=0.9',
                        'cache-control': 'no-cache',
                        cookie
                    }
                });
                if (res && res.datas && res.datas.length > 0) {
                    results.exercises['cat' + catId] = {
                        count: res.datas.length,
                        otherKeys: Object.keys(res).filter(k => k !== 'datas'),
                        firstItem: {
                            id: res.datas[0].id,
                            updatedTime: res.datas[0].updatedTime,
                            sheetName: res.datas[0].sheet && res.datas[0].sheet.name,
                            answerCount: res.datas[0].answerCount
                        }
                    };
                }
            } catch (e) {
                // 忽略单个失败
            }
        }

        // 3. 探查每日演练可能的API端点
        results.dailyEndpoints = {};
        let dailyUrls = [
            'https://tiku.fenbi.com/api/xingce/daily-exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/daily?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/my-exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/practice-exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/recent-exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/gwy/daily-exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/users/exercises?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/sheets?cursor=0&count=30',
            'https://tiku.fenbi.com/api/xingce/exercise-sheets?cursor=0&count=30'
        ];
        for (let url of dailyUrls) {
            try {
                let res = await httpRequest({
                    url: url,
                    method: 'GET',
                    json: true,
                    headers: {
                        'accept': 'application/json',
                        'accept-language': 'zh-CN,zh;q=0.9',
                        cookie
                    }
                });
                if (res) {
                    let summary = {
                        type: typeof res,
                        keys: res && typeof res === 'object' ? Object.keys(res).slice(0, 10) : [],
                        sample: JSON.stringify(res).substring(0, 300)
                    };
                    results.dailyEndpoints[url.split('?')[0].split('/api/')[1]] = summary;
                }
            } catch (e) {
                // 忽略
            }
        }

        ctx.body = results;
    } catch (e) {
        ctx.body = { error: e.message, stack: e.stack };
    }
});

router.all('/', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        ctx.redirect('/history-category-complex');
    }
});