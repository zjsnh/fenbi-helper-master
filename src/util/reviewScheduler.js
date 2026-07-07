// 艾宾浩斯遗忘曲线错题复习调度器
// 独立维护复习状态，不污染现有错题缓存结构
// 经典 6 次复习间隔：1天 → 2天 → 4天 → 7天 → 15天 → 30天
const cache = require('./cacheUtil');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const REVIEW_KEY = 'wrong_review_state';
const EXPIRE_MS = 365 * 24 * 60 * 60 * 1000; // 365 天

// 经典艾宾浩斯复习间隔（天）
const INTERVALS_DAYS = [1, 2, 4, 7, 15, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

// ══════════════════════════════════════
//  状态读写
// ══════════════════════════════════════
function getReviewState(userId) {
    if (!userId) return { items: {} };
    const data = cache.readForUser(userId, REVIEW_KEY, EXPIRE_MS);
    if (!data || !data.items) return { items: {} };
    return data;
}

function saveReviewState(userId, state) {
    if (!userId) return;
    cache.writeForUser(userId, REVIEW_KEY, state, EXPIRE_MS);
}

// ══════════════════════════════════════
//  选项/答案规范化（与 redo 路由保持一致）
// ══════════════════════════════════════
function normAnswer(ans) {
    let val = (ans && typeof ans === 'object') ? ans.choice : ans;
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(val)) return val;
    const map = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F' };
    return map[val] || '';
}

function stripHtml(s) {
    return String(s || '').replace(/<[^>]+>/g, '').trim();
}

// ══════════════════════════════════════
//  把错题加入复习队列（已存在则跳过）
//  question 格式：{ questionId, content, options, correctAnswer, solution, keypoints, source, _isLocalQuiz }
// ══════════════════════════════════════
function enqueueQuestions(userId, questions) {
    if (!userId || !Array.isArray(questions) || questions.length === 0) return 0;
    const state = getReviewState(userId);
    let added = 0;
    const now = Date.now();

    questions.forEach(q => {
        if (!q || !q.questionId) return;
        const qid = String(q.questionId);
        if (state.items[qid]) return; // 已在队列中

        state.items[qid] = {
            questionId: qid,
            source: q._isLocalQuiz ? 'local' : 'fenbi',
            stem: q.content || '',
            options: (q.options || []).map(opt => {
                if (typeof opt === 'string') return stripHtml(opt);
                return stripHtml(opt.content || opt.text || String(opt));
            }),
            answer: q._isLocalQuiz ? (q.correctAnswerLetter || normAnswer(q.correctAnswer)) : normAnswer(q.correctAnswer),
            analysis: q.solution || '',
            knowledge: Array.isArray(q.keypoints) ? q.keypoints.join('、') : (q.knowledge || ''),
            firstWrongTime: now,
            lastReviewTime: null,
            reviewCount: 0,
            nextReviewTime: now, // 首次入队立即可复习
            lastReviewCorrect: null,
            stage: 0 // 0=未复习, 1-6=已复习阶段, 7=已掌握
        };
        added++;
    });

    if (added > 0) saveReviewState(userId, state);
    return added;
}

// ══════════════════════════════════════
//  获取今日待复习题目（nextReviewTime <= now）
// ══════════════════════════════════════
function getTodayReview(userId) {
    const state = getReviewState(userId);
    const now = Date.now();
    const items = [];

    Object.values(state.items || {}).forEach(item => {
        if (item.stage >= INTERVALS_DAYS.length) return; // 已掌握
        if (item.nextReviewTime && item.nextReviewTime <= now) {
            items.push(item);
        }
    });

    // 按到期时间排序（最该复习的在前）
    items.sort((a, b) => (a.nextReviewTime || 0) - (b.nextReviewTime || 0));
    return items;
}

// ══════════════════════════════════════
//  获取所有可复习题目（未掌握，不限到期时间）
//  用于「立即复习全部」模式
// ══════════════════════════════════════
function getAllReviewable(userId) {
    const state = getReviewState(userId);
    const items = [];

    Object.values(state.items || {}).forEach(item => {
        if (item.stage >= INTERVALS_DAYS.length) return; // 已掌握
        items.push(item);
    });

    // 按阶段排序（低阶段优先）+ 到期时间优先
    items.sort((a, b) => {
        if (a.stage !== b.stage) return a.stage - b.stage;
        return (a.nextReviewTime || 0) - (b.nextReviewTime || 0);
    });
    return items;
}

// ══════════════════════════════════════
//  获取复习统计概览
// ══════════════════════════════════════
function getReviewStats(userId) {
    const state = getReviewState(userId);
    const now = Date.now();
    const stats = {
        total: 0,           // 队列中总题数（不含已掌握）
        dueToday: 0,        // 今日待复习
        mastered: 0,        // 已掌握
        upcoming: 0,        // 未来待复习（未到期）
        stageDist: [0, 0, 0, 0, 0, 0]  // 各阶段人数分布
    };

    Object.values(state.items || {}).forEach(item => {
        if (item.stage >= INTERVALS_DAYS.length) {
            stats.mastered++;
            return;
        }
        stats.total++;
        // stage 0-5 对应 6 个复习阶段（1d/2d/4d/7d/15d/30d）
        if (item.stage >= 0 && item.stage < INTERVALS_DAYS.length) {
            stats.stageDist[item.stage]++;
        }
        if (item.nextReviewTime && item.nextReviewTime <= now) {
            stats.dueToday++;
        } else {
            stats.upcoming++;
        }
    });

    return stats;
}

// ══════════════════════════════════════
//  更新复习结果
//  correct: true=答对进入下一阶段, false=答错重置到阶段0
// ══════════════════════════════════════
function updateReviewResult(userId, questionId, correct) {
    if (!userId || !questionId) return null;
    const state = getReviewState(userId);
    const qid = String(questionId);
    const item = state.items[qid];
    if (!item) return null;

    const now = Date.now();
    item.lastReviewTime = now;
    item.lastReviewCorrect = !!correct;

    if (correct) {
        item.stage = (item.stage || 0) + 1;
        if (item.stage >= INTERVALS_DAYS.length) {
            // 完成全部 6 次复习，标记为已掌握
            item.nextReviewTime = null;
        } else {
            // 下次复习时间 = 当前时间 + 下一阶段间隔
            item.nextReviewTime = now + INTERVALS_DAYS[item.stage] * DAY_MS;
        }
        item.reviewCount = (item.reviewCount || 0) + 1;
    } else {
        // 答错：重置到阶段 0，1 天后复习
        item.stage = 0;
        item.nextReviewTime = now + INTERVALS_DAYS[0] * DAY_MS;
        item.reviewCount = (item.reviewCount || 0) + 1;
    }

    saveReviewState(userId, state);
    return item;
}

// ══════════════════════════════════════
//  批量更新复习结果（提交复习题集后调用）
//  results: [{ questionId, correct }]
// ══════════════════════════════════════
function updateReviewResults(userId, results) {
    if (!userId || !Array.isArray(results)) return 0;
    let updated = 0;
    results.forEach(r => {
        if (updateReviewResult(userId, r.questionId, r.correct)) updated++;
    });
    return updated;
}

// ══════════════════════════════════════
//  扫描当天错题缓存，同步新错题到复习队列
//  会在用户访问错题本页面 / 复习规划页面时调用
//  设计原则：只同步"当天产生"的错题，避免历史错题本
//  （wrong_q_* 粉笔错题本 / 本地题库）一次性涌入队列
//  历史错题本的错题不自动入队，复习队列只随每日练习增量累积
// ══════════════════════════════════════
function syncFromWrongCache(userId) {
    if (!userId) return { added: 0, scanned: 0 };

    const state = getReviewState(userId);
    const today = formatDate(new Date());
    let scanned = 0, added = 0;
    const newQuestions = [];

    // 只扫描 exercise_wrong_* 缓存（练习记录当天错题）
    // 不扫描 wrong_q_* （粉笔错题本 / 本地题库历史累积，避免队列过大）
    try {
        const files = fs.readdirSync(CACHE_DIR);
        const exWrongPrefix = 'exercise_wrong_';
        const userSuffix = '_' + userId + '.json';

        files.forEach(f => {
            if (!f.startsWith(exWrongPrefix)) return;
            if (!f.endsWith(userSuffix)) return;
            if (f.endsWith('.bak')) return;

            const fp = path.join(CACHE_DIR, f);
            try {
                const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
                if (!data || !Array.isArray(data.wrongQuestions)) return;
                // 严格只同步当天产生的错题：finishedDate 必须等于今天
                // 缺失 finishedDate 视为非当天，跳过（避免历史遗留缓存误入队）
                if (data.finishedDate !== today) return;

                data.wrongQuestions.forEach(q => {
                    if (!q || !q.questionId) return;
                    // 二次校验：单题 finishedDate 也必须是当天
                    if (q.finishedDate && q.finishedDate !== today) return;
                    scanned++;
                    if (state.items[String(q.questionId)]) return;
                    newQuestions.push(q);
                });
            } catch (e) {
                // 单文件读取失败不影响整体
            }
        });
    } catch (e) {
        console.error('[REVIEW] 扫描练习错题失败:', e.message);
    }

    // 批量入队
    if (newQuestions.length > 0) {
        added = enqueueQuestions(userId, newQuestions);
    }

    if (added > 0) {
        console.log('[REVIEW] 同步当天错题到复习队列: 扫描 ' + scanned + ' 题, 新增 ' + added + ' 题');
    }

    return { added, scanned };
}

// ══════════════════════════════════════
//  从复习队列移除（用户主动从错题本删除时调用）
// ══════════════════════════════════════
function removeFromReview(userId, questionId) {
    if (!userId || !questionId) return false;
    const state = getReviewState(userId);
    const qid = String(questionId);
    if (!state.items[qid]) return false;
    delete state.items[qid];
    saveReviewState(userId, state);
    return true;
}

// ══════════════════════════════════════
//  日期工具：把 Date 格式化为 YYYY-MM-DD（本地时区）
// ══════════════════════════════════════
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

// 把 YYYY-MM-DD 字符串解析为本地时区当天 00:00 的 Date
function parseDate(s) {
    const parts = String(s).split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

// ══════════════════════════════════════
//  模拟复习计划
//  给定起点日期 D，按艾宾浩斯间隔重排所有未掌握题目
//  返回 30 天曲线数据 + 6 个阶段日详情
//  算法：stage 0 → D+1, stage 1 → D+2, stage 2 → D+4,
//        stage 3 → D+7, stage 4 → D+15, stage 5 → D+30
//  注意：stage 保留不重置，只重排 nextReviewTime
// ══════════════════════════════════════
// ══════════════════════════════════════
//  动态查询：扫描 exercise_wrong_* 缓存，收集 finishedDate >= startDate 的错题
//  用于 simulatePlan 动态规划，不依赖持久化复习队列
// ══════════════════════════════════════
function collectWrongQuestionsFromDate(userId, startDateStr) {
    if (!userId || !startDateStr) return { questions: [], earliest: null };

    const result = [];
    let earliestDate = null;

    try {
        const files = fs.readdirSync(CACHE_DIR);
        const exWrongPrefix = 'exercise_wrong_';
        const userSuffix = '_' + userId + '.json';

        files.forEach(f => {
            if (!f.startsWith(exWrongPrefix)) return;
            if (!f.endsWith(userSuffix)) return;
            if (f.endsWith('.bak')) return;

            const fp = path.join(CACHE_DIR, f);
            try {
                const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
                if (!data || !Array.isArray(data.wrongQuestions)) return;

                data.wrongQuestions.forEach(q => {
                    if (!q || !q.questionId) return;
                    // 只收集 finishedDate >= startDate 的错题
                    if (!q.finishedDate) return;
                    if (q.finishedDate < startDateStr) return;

                    if (!earliestDate || q.finishedDate < earliestDate) {
                        earliestDate = q.finishedDate;
                    }

                    result.push({
                        questionId: q.questionId,
                        content: q.content || '',
                        source: q.source || '',
                        keypoints: q.keypoints || [],
                        solution: q.solution || '',
                        finishedDate: q.finishedDate,
                        exerciseName: q.exerciseName || ''
                    });
                });
            } catch (e) {
                // 单文件读取失败不影响整体
            }
        });
    } catch (e) {
        console.error('[REVIEW] 动态查询错题失败:', e.message);
    }

    // 按 questionId 去重（同一题可能在不同练习中出现）
    const seen = new Set();
    const unique = result.filter(q => {
        const qid = String(q.questionId);
        if (seen.has(qid)) return false;
        seen.add(qid);
        return true;
    });

    return { questions: unique, earliest: earliestDate };
}

// ══════════════════════════════════════
//  模拟复习计划（动态查询版）
//  给定起点日期 D，动态扫描 finishedDate >= D 的错题
//  所有新入队错题按 stage 0 处理（D+1 天首次复习）
//  已在持久化队列中且有复习进度的题，保留其 stage
//  返回 6 个阶段日详情 + 30 天曲线数据
// ══════════════════════════════════════
function simulatePlan(userId, startDateStr) {
    const state = getReviewState(userId);
    const startDate = parseDate(startDateStr);
    if (!startDate) return { error: 'invalid startDate' };

    // 动态查询 finishedDate >= startDate 的所有错题
    const { questions: dynamicQuestions, earliest } = collectWrongQuestionsFromDate(userId, startDateStr);

    // 合并：动态查询的错题 + 持久化队列中已有的复习进度
    // 对于持久化队列里的题，保留其 stage（复习进度）
    // 对于动态查到但不在持久化队列的题，stage = 0（新题）
    const pending = [];
    const stateItemsMap = {}; // questionId -> item
    Object.values(state.items || {}).forEach(item => {
        if (item.stage >= INTERVALS_DAYS.length) return; // 已掌握，跳过
        stateItemsMap[String(item.questionId)] = item;
    });

    dynamicQuestions.forEach(q => {
        const qid = String(q.questionId);
        const existingItem = stateItemsMap[qid];
        const stage = existingItem ? (existingItem.stage || 0) : 0;
        pending.push({
            questionId: q.questionId,
            stem: q.content || (existingItem ? existingItem.stem : ''),
            source: q.source || (existingItem ? existingItem.source : ''),
            knowledge: Array.isArray(q.keypoints) ? q.keypoints.join('、') : (existingItem ? existingItem.knowledge : ''),
            stage: stage,
            finishedDate: q.finishedDate
        });
    });

    if (pending.length === 0) {
        // 空结果也返回 6 个阶段格子 + 30 天曲线，让前端面板有内容可渲染
        const emptyDays = [];
        const emptyChartData = [];
        for (let i = 0; i <= 30; i++) {
            const d = new Date(startDate.getTime() + i * DAY_MS);
            emptyChartData.push({ date: formatDate(d), count: 0 });
        }
        INTERVALS_DAYS.forEach(offset => {
            const targetDate = new Date(startDate.getTime() + offset * DAY_MS);
            emptyDays.push({
                date: formatDate(targetDate),
                dayOffset: offset,
                count: 0,
                questions: []
            });
        });
        return {
            startDate: startDateStr,
            totalQuestions: 0,
            days: emptyDays,
            chartData: emptyChartData,
            dateRange: {
                earliest: earliest || startDateStr,
                latest: formatDate(new Date(startDate.getTime() + 30 * DAY_MS))
            }
        };
    }

    // 计算每题的目标日期：D + INTERVALS_DAYS[stage]
    const dayBuckets = {}; // dayOffset -> [items]
    pending.forEach(item => {
        const stage = item.stage || 0;
        const offset = INTERVALS_DAYS[stage];
        if (!dayBuckets[offset]) dayBuckets[offset] = [];
        dayBuckets[offset].push({
            questionId: item.questionId,
            stem: item.stem,
            source: item.source,
            knowledge: item.knowledge,
            stage: stage,
            finishedDate: item.finishedDate
        });
    });

    // 生成 6 个阶段日详情
    const days = [];
    INTERVALS_DAYS.forEach(offset => {
        const targetDate = new Date(startDate.getTime() + offset * DAY_MS);
        days.push({
            date: formatDate(targetDate),
            dayOffset: offset,
            count: (dayBuckets[offset] || []).length,
            questions: dayBuckets[offset] || []
        });
    });

    // 生成 30 天 chartData（含非阶段日为 0）
    const chartData = [];
    for (let i = 0; i <= 30; i++) {
        const d = new Date(startDate.getTime() + i * DAY_MS);
        const dateStr = formatDate(d);
        const count = (dayBuckets[i] || []).length;
        chartData.push({ date: dateStr, count: count });
    }

    const latestDate = new Date(startDate.getTime() + 30 * DAY_MS);

    return {
        startDate: startDateStr,
        totalQuestions: pending.length,
        days: days,
        chartData: chartData,
        dateRange: {
            earliest: earliest || startDateStr,
            latest: formatDate(latestDate)
        }
    };
}

// ══════════════════════════════════════
//  应用复习计划
//  1. 动态查询 finishedDate >= startDate 的错题，新题入持久化队列
//  2. 每道未掌握题的 nextReviewTime = startDate + stage对应间隔
//  3. 保留 stage 不变（不重置进度，只重排时间）
// ══════════════════════════════════════
function applyPlan(userId, startDateStr) {
    const startDate = parseDate(startDateStr);
    if (!startDate) return { applied: 0, error: 'invalid startDate' };

    // 动态查询并入队新错题
    const { questions: dynamicQuestions } = collectWrongQuestionsFromDate(userId, startDateStr);
    let newlyEnqueued = 0;
    if (dynamicQuestions.length > 0) {
        newlyEnqueued = enqueueQuestions(userId, dynamicQuestions.map(q => ({
            questionId: q.questionId,
            content: q.content,
            source: q.source,
            keypoints: q.keypoints,
            solution: q.solution,
            _isLocalQuiz: false
        })));
    }

    // 重排所有未掌握题的下次复习时间
    const state = getReviewState(userId);
    const startTs = startDate.getTime();
    let applied = 0;

    Object.values(state.items || {}).forEach(item => {
        if (item.stage >= INTERVALS_DAYS.length) return; // 已掌握，跳过
        const stage = item.stage || 0;
        const offset = INTERVALS_DAYS[stage];
        item.nextReviewTime = startTs + offset * DAY_MS;
        applied++;
    });

    if (applied > 0 || newlyEnqueued > 0) saveReviewState(userId, state);
    return { applied: applied, newlyEnqueued: newlyEnqueued, startDate: startDateStr };
}

module.exports = {
    INTERVALS_DAYS,
    getReviewState,
    saveReviewState,
    enqueueQuestions,
    getTodayReview,
    getAllReviewable,
    getReviewStats,
    updateReviewResult,
    updateReviewResults,
    syncFromWrongCache,
    removeFromReview,
    simulatePlan,
    applyPlan,
    normAnswer,
    stripHtml
};
