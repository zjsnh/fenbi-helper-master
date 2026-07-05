const Koa = require('koa');
const KoaRouter = require('koa-router');
const koaBody = require('koa-body');
const moment = require('moment');

const render = require('koa-ejs');
const serve = require('koa-static');


const path = require('path');
const qs = require('qs');
const url = require('url');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = new Koa();
const router = new KoaRouter();

const exerciseResult = require('./service/exercisesResult');
const loginService = require('./service/loginService');

render(app, {
    root: path.join(__dirname, 'views'),
    layout: false,
    viewExt: 'ejs',
    cache: false,
    debug: false,
});

app.use(serve(__dirname + '/views/js'))
app.use(serve(__dirname + '/views'))

app.use(koaBody())

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
        ctx.redirect('/history-category-complex');
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
    '/word-frequency'
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

router.get('/history', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        let data = await exerciseResult.getExerciseHistory(cookie, false);
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
        const { date } = ctx.request.body;
        if (!date) {
            ctx.body = { error: '请提供日期' };
            ctx.status = 400;
            return;
        }
        console.log('当日错题统计: date=' + date);
        const pdfGenerator = require('./util/pdfGenerator');

        const stats = await exerciseResult.getDailyWrongStats(date, cookie);

        if (!stats.questions || stats.questions.length === 0) {
            ctx.body = { error: '该日期无错题数据' };
            ctx.status = 404;
            return;
        }

        const pdfBuffer = await pdfGenerator.generateDailyWrongStatsPDF(stats);

        ctx.set('Content-Type', 'application/pdf');
        ctx.set('Content-Disposition', `attachment; filename="wrong-stats-${date}.pdf"`);
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