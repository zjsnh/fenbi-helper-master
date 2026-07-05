const _ = require('lodash');
const moment = require('moment');
const qs = require('querystring');
const percentile = require('percentile');

const {httpRequest} = require('../util/httpUtil');
const idiomDict = require('../util/idiomDict');

let headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "accept-language": "zh-CN,zh-TW;q=0.9,zh;q=0.8",
    "cache-control": "max-age=0",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
};

async function getCategories(group, cookie) {
    let category = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/categories?&filter=keypoint&app=web&kav=12&version=3.0.0.0`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
    let rels = [];
    buildCat(category, rels, group);

    // 每日演练单独成组（不在知识点分类树中）
    let daily = group['每日演练'] || [];
    if (daily.length > 0) {
        rels.push({type: '每日演练', items: daily, childTypes: []});
    }

    let others = (group['others'] || []).filter(i => i.answerCount > 30);
    if (others.length > 0) {
        rels.push({type: '试卷', items: others, childTypes: []});
    }

    calcCount(rels);
    return rels;
}

function buildCat(cats, roots, group) {
    if (!cats || cats.length === 0) return;
    for (let cat of cats) {
        let name = (cat.name || '').split('-')[0] || '未分类';
        let obj = {
            type: name,
            childTypes: [],
            items: [],
        };
        buildCat(cat.children, obj.childTypes, group);
        if (!roots.map(i => i.type).includes(name)) {
            obj.items = group[name] || []
            roots.push(obj);
        }
    }
}

function sum (arr) {
    return arr.reduce((a, b) => a + b, 0)
}

function _buildCount(root) {
    if (!root) return 0;
    let count = sum(root.items.map(i => i.answerCount)) + sum(root.childTypes.map(t => _buildCount(t)));
    root.count = count;
    return count;
}

function calcCount(roots) {
    if (!roots || roots.length === 0) return;
    for (let root of roots) {
        _buildCount(root);
    }
}

let cleanTitle = function (title) {
    if (!title) return "无来源";
    return title.replace(/辽宁\/湖南\/湖北\/安徽\/四川\/福建\/云南\/黑龙江\/江西\/广西\/贵州\/海南\/内蒙古\/山西\/重庆\/宁夏\/西藏/g, '湖北')
        .replace(/山西\/辽宁\/黑龙江\/福建\/湖北\/ 湖南\/广西\/海南\/四川\/重庆\/ 云南\/ 西藏\/陕西\/青海\/宁夏\/ 新疆兵团/g, '湖北')
        .replace(/贵州\/四川\/福建\/黑龙江\/湖北\/山西\/重庆\/辽宁\/海南\/江西\/天津\/陕西\/云南\/广西\/山东\/湖南/g, '湖北')
        .replace(/（网友回忆版）/g, '')
        .replace(/网友回忆版/g, '')
        .replace(/第\d+题/g, '')
        .replace(/县级\+乡镇/g, '县级');
}

// 轻量 HTML 清理（用于 wordStatsList 携带的题干预览）
function stripHtmlLite(h) {
    if (!h) return '';
    return h.replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&ensp;/g, ' ').replace(/&emsp;/g, '  ')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ').trim();
}

async function getQuestionByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/questions?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questions.map(q => q.id), questions)
}

async function getQuestionMetaByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/question/meta?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questions.map(q => q.id), questions)
}

async function getQuestionKeyPointsByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/solution/keypoints?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questionIds, questions);
}

// 返回收藏了的题目的id数组
async function getCollectsByIds(questionIds, cookie) {
    return await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/collects?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

function getExerciseReport(exerciseId, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}/report/v2`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

function getExercise(exerciseId, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

async function getExerciseHistory(categoryId, cookie) {
    let allDatas = [];
    let cursor = 0;
    let maxPages = 20; // 安全上限，防止无限循环

    for (let page = 0; page < maxPages; page++) {
        let res = await httpRequest({
            url: `https://tiku.fenbi.com/api/xingce/category-exercises?categoryId=${categoryId}&cursor=${cursor}&count=30`,
            method: "GET",
            json: true,
            headers: {
                ...headers,
                cookie
            }
        });

        if (!res || !res.datas || res.datas.length === 0) {
            break;
        }

        // 第一页时打印API返回的完整字段结构，方便调试
        if (page === 0) {
            let otherKeys = Object.keys(res).filter(k => k !== 'datas');
            console.log(`练习记录[cat=${categoryId}] API返回字段: [${otherKeys.join(', ')}], 本页${res.datas.length}条`);
        }

        // 直接收集所有数据，不去重
        allDatas.push(...res.datas);

        // 不足一页，说明是最后一页
        if (res.datas.length < 30) {
            break;
        }

        // 寻找下一页游标：优先用API返回的分页字段
        let nextCursor = null;
        if (res.nextCursor !== undefined && res.nextCursor !== null) {
            nextCursor = res.nextCursor;
        } else if (res.cursor !== undefined && res.cursor !== null && res.cursor !== cursor) {
            nextCursor = res.cursor;
        } else if (res.paging && res.paging.next) {
            nextCursor = res.paging.next;
        } else if (res.hasMore === false) {
            break;
        } else {
            // 没有明确的分页字段，用最后一条记录的 updatedTime 作为游标
            let lastItem = res.datas[res.datas.length - 1];
            if (lastItem && lastItem.updatedTime) {
                nextCursor = lastItem.updatedTime;
            }
        }

        if (nextCursor === null || nextCursor === cursor) {
            // 游标没变化，避免死循环
            break;
        }

        cursor = nextCursor;
    }

    console.log(`练习记录[cat=${categoryId}] 共获取 ${allDatas.length} 条`);
    return allDatas;
}

async function getSolutionsByIds(questionIds, cookie) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/solutions?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
    return _.zipObject(questionIds, questions);
}
exports.getSolutionsByIds = getSolutionsByIds;

async function getEpisodesByIds(questionIds, cookie) {
    try {
        let result = await httpRequest({
            url: `https://ke.fenbi.com/api/gwy/v3/episodes/tiku_episodes_with_multi_type?tiku_ids=${questionIds.join(',')}&tiku_prefix=xingce&tiku_type=5`,
            method: "GET",
            json: true,
            headers: {
                ...headers,
                cookie
            }
        });
        return (result && result.data) || {};
    } catch (e) {
        console.error('getEpisodesByIds 失败:', e.message);
        return {};
    }
}

function parseWordListFromNote2(content) {
    let lines = content.split('\n');
    let wdList = lines.map(wl => {
        let reg = /.*\[!([^\]]*)\].*/g;
        if (wl.match(reg)) {
            return wl.replace(reg, '$1');
        }
    }).filter(a=>a);
    return wdList.filter(a => a.length <= 5);
}

function parseWordListFromNote1(content) {
    let lines = content.split('\n');
    let s = lines.indexOf('[start积累]');
    let e = lines.indexOf('[end积累]');
    if (s !== -1 && e !== -1) {
        lines = lines.slice(s+1, e).filter(a => a);
        let wdList = lines.map(wl => {
            let w = wl.replace(/.*\* \[?([^\]]*)\]?\[?[^\[\]]*\]?[：|:].*/g, '$1')
            return w;
        });
        return wdList.filter(a => a.length <= 5);
    } else {
        return [];
    }
}

function parseWordListFromNote(content) {
    return parseWordListFromNote1(content).concat(parseWordListFromNote2(content));
}


function parseTagListFromNote(content) {
    let lines = content.split('\n').filter(a => a);
    let wdList = lines.map(wl => {
        if (wl.match(/^\{(.*)\}$/g)) {
            let w = wl.replace(/^\{(.*)\}$/g, '$1')
            return w;
        }
    }).filter(a => a);
    return wdList;
}

exports.zjWord = async function (word) {
    let result = await httpRequest({
        url: `https://zaojv.com/wordQueryDo.php`,
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: qs.stringify({
            nsid: 0,
            s: 45957424262910633321,
            wo: word,
            directGo: 1
        })
    });
    return "https://zaojv.com/" + result.replace(/\n/g, "").replace(/(.*)HREF="(.*)".*/g, '$2')
}

exports.saveNote = async function (questionId, content, cookie) {
    let result = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/notes`,
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/json;charset=UTF-8',
            cookie
        },
        body: JSON.stringify({
            content,
            questionId: Number.parseInt(questionId)
        })
    });
    if (!result) {
        throw new Error('save note error!')
    }
    return result;
}

let getNotesMapByIds = async function (questionIds, cookie) {
    let params = qs.stringify({
        questionIds: questionIds.join(',')
    })
    let result = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/notes?` + params,
        method: "GET",
        headers: {
            ...headers,
            'Content-Type': 'application/json;charset=UTF-8',
            cookie
        },
        json: true,
    });
    result = result.filter(a => a);

    return _.zipObject(result.map(r => r.questionId), result.map(r => r.content));
}

exports.getExerciseHistory = async function (cookie, forceRefresh) {
    let cacheKey = 'exercise_history';

    // 非强制刷新时，优先读本地缓存
    if (!forceRefresh) {
        let cached = cache.readCache(cacheKey);
        if (cached && cached.data) {
            console.log('练习记录: 使用本地缓存, 共 ' + cached.data.exerciseHistory.length + ' 条');
            cached.data.moment = moment;
            cached.data.cleanTitle = cleanTitle;
            cached.data._fromCache = true;
            cached.data._cachedAt = cached._cachedAt;
            return cached.data;
        }
    }

    console.log('练习记录: 从API获取数据...');
    // categoryId 含义：1=模考/真题，2=每日演练，3=专项智能练习
    let result = await Promise.allSettled([
        getExerciseHistory(1, cookie),
        getExerciseHistory(2, cookie),
        getExerciseHistory(3, cookie)
    ]);
    let historyLists = result.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    let exerciseHistory = _.orderBy(_.flatMap(historyLists, _.identity), ['updatedTime'], ['desc']);
    // 按id去重：同一练习可能同时归属多个分类，合并后会出现重复
    let _seenIds = new Set();
    exerciseHistory = exerciseHistory.filter(h => {
        if (_seenIds.has(h.id)) return false;
        _seenIds.add(h.id);
        return true;
    });

    // 使用 Promise.allSettled 容错：单个报告请求失败不影响整体
    let reportResults = await Promise.allSettled(exerciseHistory.map(item => getExerciseReport(item.id, cookie)));
    let exerciseReportMap = {};
    exerciseHistory.forEach((item, idx) => {
        if (reportResults[idx].status === 'fulfilled' && reportResults[idx].value) {
            exerciseReportMap[item.id] = reportResults[idx].value;
        }
    });

    exerciseHistory.forEach(history => {
        history.finishedTime = moment(history.updatedTime).format('YYYY-MM-DD HH:mm:ss')
        history.finishedDate = moment(history.updatedTime).format('YYYY-MM-DD')
        let report = exerciseReportMap[history.id];
        if (report) {
            history.elapsedTime = report.elapsedTime;
            history.answerCount = report.answerCount;
            // 防止除0错误
            if (report.answerCount > 0) {
                history.correctRate = (report.correctCount / report.answerCount * 100).toFixed(1);
            } else {
                history.correctRate = '0.0';
            }
        }
    });
    exerciseHistory = exerciseHistory.filter(h => h.status === 1 && h.answerCount > 0);
    let exerciseHistoryGroup = _.groupBy(exerciseHistory, h => {
        let name = (h.sheet && h.sheet.name) || '';
        if (name.startsWith('专项智能练习')) {
            h.cleanName = name.replace(/(专项智能练习)（(.*)）/, '$1');
            return name.replace(/专项智能练习（(.*)）/, '$1');
        } else if (name.startsWith('每日演练')) {
            // 每日演练单独分组，保留完整名称作为分组键
            h.cleanName = name;
            return '每日演练';
        } else {
            h.cleanName = cleanTitle(name);
            return 'others';
        }
    });

    let groupItems = [];
    try {
        groupItems = await getCategories(exerciseHistoryGroup, cookie);
    } catch (e) {
        console.error('练习记录: 获取分类失败:', e.message);
        // 分类失败时，用简单列表兜底
        Object.keys(exerciseHistoryGroup).forEach(key => {
            groupItems.push({
                type: key === 'others' ? '试卷' : key,
                items: exerciseHistoryGroup[key],
                childTypes: [],
                count: exerciseHistoryGroup[key].reduce((s, i) => s + (i.answerCount || 0), 0)
            });
        });
    }

    let exerciseHeatMapData = {};
    exerciseHistory.forEach(h => {
        let v = moment(h.finishedDate).toDate().getTime() / 1000;
        exerciseHeatMapData[v] = (exerciseHeatMapData[v] || 0) + h.answerCount;
    });

    let data = {
        groupItems,
        exerciseHeatMapData,
        exerciseHistoryGroup,
        exerciseHistory,
        cleanTitle,
        moment
    };

    // 保存到本地缓存（不含函数属性），使用30天长过期
    let dataToCache = {
        groupItems,
        exerciseHeatMapData,
        exerciseHistoryGroup,
        exerciseHistory,
    };
    cache.writeCache(cacheKey, { data: dataToCache }, 30 * 24 * 60 * 60 * 1000);
    console.log('练习记录: 数据已缓存, 共 ' + exerciseHistory.length + ' 条');

    data._fromCache = false;
    return data;
}

exports.getQuestion = async function (questionId, cookie) {
    let solutionMap = await getSolutionsByIds([questionId], cookie);
    let notesMap = await getNotesMapByIds([questionId], cookie);
    let collectionIds = await getCollectsByIds([questionId], cookie);
    let q = solutionMap[questionId];
    if (notesMap[questionId]) {
        q.note = notesMap[questionId];
        q.wordList = parseWordListFromNote(q.note);
    }

    q.hasCollect = collectionIds.some(qid => qid === q.id);

    q.keypoints = q.keypoints ? q.keypoints.map(i => i.name) : [];

    q.mostWrongAnswer = q.questionMeta.mostWrongAnswer;

    q.correctRatio = q.questionMeta.correctRatio;

    q.totalCount = q.questionMeta.totalCount;

    q.options = q.accessories[0].options;

    if (q.material) {
        q.material = q.material.content;
    }
    return {
        q,
    }
};

exports.getResultObj = async function (exerciseId, costThreshold, cookie) {
    let [exercise, report] = await Promise.all([getExercise(exerciseId, cookie), getExerciseReport(exerciseId, cookie)]);
    if (!report || !report.answers || !exercise) return;
    let collectionIds = await getCollectsByIds(report.answers.map(answer => answer.questionId), cookie);

    let answerResultMap = {};

    report.answers.forEach(answer => {
        // 只筛选出你做了的
        // todo: 这里判断下，收藏的题的idx是否在你做了的题的idx的range里
        if (answer.status !== 10 || collectionIds.includes(answer.questionId)) {
            answerResultMap[answer.questionId] = answer.correct;
        }
    });

    let concernQuestions = Object.keys(answerResultMap).map(questionId => {
        let ua = Object.values(exercise.userAnswers).find(item => item.questionId == questionId);
        let correct = answerResultMap[questionId];
        return {
            idx: (ua && (ua.questionIndex + 1))  || report.answers.findIndex(item => item.questionId == questionId) + 1,
            questionId,
            correct,
            cost: ua && ua.time,
            myAnswer: (ua && ua.answer && ['A', 'B', 'C', 'D'][ua.answer.choice]) || '未选择'
        }
    }).filter(a => a);

    // let questionContentMap = await getQuestionByIds(concernQuestions.map(q => q.questionId));
    // let questionMetaMap = await getQuestionMetaByIds(concernQuestions.map(q => q.questionId));
    // let questionKeyPointsMap = await getQuestionKeyPointsByIds(concernQuestions.map(q => q.questionId));
    let solutionMap = await getSolutionsByIds(concernQuestions.map(q => q.questionId), cookie);

    // 按原始题目顺序排序，不把错题提前
    concernQuestions = _.orderBy(concernQuestions, ['idx'], ['asc']);

    let concernSource = ['国家', '联考', '省', '市'];
    let concernSourceCountMap = {};
    concernQuestions.forEach(q => {
        let solutionObj = solutionMap[q.questionId];
        // 题干
        q.content = solutionObj.content; // html
        // 选项
        q.options = solutionObj.accessories[0].options;
        // 难度
        q.difficulty = solutionObj.difficulty;
        // 正确答案
        q.correctAnswer = solutionObj.correctAnswer;
        // 规范化为字母字符串，便于前端高亮
        let _ca = solutionObj.correctAnswer;
        let _cav = (_ca && typeof _ca === 'object') ? _ca.choice : _ca;
        if (_cav === 0 || _cav === '0') _cav = 'A';
        else if (_cav === 1 || _cav === '1') _cav = 'B';
        else if (_cav === 2 || _cav === '2') _cav = 'C';
        else if (_cav === 3 || _cav === '3') _cav = 'D';
        q.correctAnswer = (_cav === 'A' || _cav === 'B' || _cav === 'C' || _cav === 'D') ? _cav : null;
        // 题目来源
        q.source = solutionObj.source;

        concernSource.some(item => {
            if (q.source && q.source.includes(item)) {
                concernSourceCountMap[item] = (concernSourceCountMap[item] || 0) + 1;
                return true;
            }
            return false;
        });

        q.hasCollect = collectionIds.some(qid => qid == q.questionId);

        q.keypoints = solutionObj.keypoints ? solutionObj.keypoints.map(i => i.name) : [];
        q.tags = (solutionObj.tags || []).map(i => i.name);

        // 答案解析
        q.solution = solutionObj.solution; // html

        q.mostWrongAnswer = solutionObj.questionMeta.mostWrongAnswer;

        q.correctRatio = solutionObj.questionMeta.correctRatio;

        q.totalCount = solutionObj.questionMeta.totalCount;

        if (solutionObj.material) {
            q.material = solutionObj.material.content;
        }
    });

    let costArr = concernQuestions.map(a => ({idx: a.idx, cost: a.cost, correctRatio: a.correctRatio, correct: a.correct})).filter(a => a.cost);

    // 逻辑填空选项词语统计（基于选项实际内容）
    let logicFillQuestions = concernQuestions.filter(q => {
        let allTags = (q.keypoints || []).concat(q.tags || []);
        return allTags.some(t => t.includes('逻辑填空') || t.includes('实词填空') || t.includes('成语填空'));
    });

    function normalizeAnswer(ans) {
        let val = (ans && typeof ans === 'object') ? ans.choice : ans;
        if (val === 'A' || val === 'B' || val === 'C' || val === 'D') return val;
        if (val === 0 || val === '0') return 'A';
        if (val === 1 || val === '1') return 'B';
        if (val === 2 || val === '2') return 'C';
        if (val === 3 || val === '3') return 'D';
        return null;
    }

    // 提取选项文本中的词语（按逗号/顿号/空格拆分）
    function extractWordsFromOption(optText) {
        if (!optText) return [];
        let clean = optText.replace(/<[^>]+>/g, '').trim();
        // 去掉 A. B. C. D. 前缀
        clean = clean.replace(/^[A-D][.、]\s*/, '');
        return clean.split(/[,，、\s]+/).map(w => w.trim()).filter(w => w.length >= 2);
    }

    // 统计每个词语：出现次数、被选次数、选对次数、选错次数
    let wordStats = {}; // { word: { total: N, chosen: N, correct: N, wrong: N, questions: [...] } }

    // 调试：查看 options 结构
    // if (logicFillQuestions.length > 0) {
    //     let sampleQ = logicFillQuestions[0];
    //     console.log('[OPTIONS-DEBUG] myAnswer:', sampleQ.myAnswer);
    //     console.log('[OPTIONS-DEBUG] correctAnswer:', sampleQ.correctAnswer);
    //     console.log('[OPTIONS-DEBUG] options type:', typeof sampleQ.options, Array.isArray(sampleQ.options) ? 'array' : 'not array');
    //     console.log('[OPTIONS-DEBUG] options:', JSON.stringify(sampleQ.options));
    // }

    logicFillQuestions.forEach(q => {
        let myAns = q.myAnswer; // 'A'/'B'/'C'/'D'
        let correctAns = normalizeAnswer(q.correctAnswer);
        if (!correctAns || !['A','B','C','D'].includes(myAns)) return;

        let options = q.options || [];
        let optTexts = {};

        if (Array.isArray(options)) {
            options.forEach((opt, i) => {
                // opt 可能是字符串 "A. xxx" 或对象 {content: '...'}
                let label, text;
                if (typeof opt === 'string') {
                    let match = opt.match(/^([A-D])[.、]\s*(.*)/);
                    if (match) {
                        label = match[1];
                        text = match[2];
                    } else {
                        label = ['A','B','C','D'][i];
                        text = opt;
                    }
                } else if (typeof opt === 'object') {
                    label = opt.label || ['A','B','C','D'][i];
                    text = opt.content || opt.text || '';
                }
                optTexts[label] = text;
            });
        }

        // console.log('[OPTIONS-DEBUG] optTexts:', JSON.stringify(optTexts));

        // 提取我选的选项中的词语
        let myWords = extractWordsFromOption(optTexts[myAns]);
        let correctWords = extractWordsFromOption(optTexts[correctAns]);
        let isCorrect = myAns === correctAns;

        myWords.forEach(word => {
            if (!wordStats[word]) wordStats[word] = { total: 0, chosen: 0, correct: 0, wrong: 0, questions: [] };
            wordStats[word].total++;
            wordStats[word].chosen++;
            if (isCorrect) wordStats[word].correct++;
            else wordStats[word].wrong++;
            wordStats[word].questions.push({ idx: q.idx, source: q.source, questionId: q.questionId });
        });
    });

    // wordStatsList 改为使用全错题本的词语统计数据（见下方 getWordFrequency 调用）

    // 交叉矩阵（保留，但改为基于词语内容）
    let logicFillCrossTab = {};
    ['A','B','C','D'].forEach(r => { logicFillCrossTab[r] = { A:0, B:0, C:0, D:0 }; });
    let logicFillCorrectDist = { A:0, B:0, C:0, D:0 };
    let logicFillMyDist = { A:0, B:0, C:0, D:0 };

    logicFillQuestions.forEach(q => {
        let myAns = q.myAnswer;
        let correctAns = normalizeAnswer(q.correctAnswer);
        if (['A','B','C','D'].includes(myAns) && correctAns) {
            logicFillCrossTab[myAns][correctAns]++;
            logicFillMyDist[myAns]++;
            logicFillCorrectDist[correctAns]++;
        }
    });

    // 逻辑填空词语统计：直接基于当前练习错题的选项实时统计
    // （不依赖全错题本，因为当前练习的错题可能尚未进入错题本）
    // wordStats 已按选项词语累积：total/chosen/correct/wrong/questions
    // 这里只保留被选错的词语（wrong > 0），错误次数 = wrong
    // 同时携带关联题目详细信息，供前端展开显示
    let wordStatsList = Object.keys(wordStats)
        .filter(word => wordStats[word].wrong > 0)            // 只保留有错题关联的词语
        .map(word => {
            let ws = wordStats[word];
            // 只取答错的那部分题
            let wrongQs = ws.questions
                .filter(qa => {
                    let q = concernQuestions.find(cq => cq.questionId == qa.questionId);
                    return q && !q.correct;
                });
            let seenIds = new Set();
            let questions = [];
            let questionIds = [];
            wrongQs.forEach(qa => {
                if (seenIds.has(qa.questionId)) return;
                seenIds.add(qa.questionId);
                questionIds.push(Number(qa.questionId));
                // 找回完整题目信息
                let q = concernQuestions.find(cq => cq.questionId == qa.questionId);
                if (q) {
                    questions.push({
                        questionId: qa.questionId,
                        idx: q.idx,
                        source: q.source || '未知来源',
                        content: stripHtmlLite(q.content || ''),
                        myAnswer: q.myAnswer,
                        correctAnswer: normalizeAnswer(q.correctAnswer)
                    });
                }
            });
            return {
                word,
                total: ws.wrong,                                  // 错误次数
                questionIds,                                      // 去重后的题ID数组
                questions                                         // 关联题目详细信息
            };
        })
        .filter(w => w.questionIds.length > 0)
        .sort((a, b) => b.total - a.total);

    // 注入成语词典释义/考频/组主题（CSV 数据，非成语无释义）
    wordStatsList = idiomDict.enrich(wordStatsList);

    // DEBUG: 临时日志
    console.log('[DEBUG-DEF] logicFillQuestions数:', logicFillQuestions.length);
    console.log('[DEBUG-DEF] wordStatsList前5条:');
    wordStatsList.slice(0, 5).forEach(w => {
        let isIdiom = /^[\u4e00-\u9fa5]{4}$/.test(w.word);
        console.log('  word="' + w.word + '" isIdiom=' + isIdiom +
                    ' def="' + (w.definition || '') + '"' +
                    ' theme="' + (w.theme || '') + '"' +
                    ' freq=' + (w.freq || 0) +
                    ' qCount=' + (w.questions || []).length);
    });
    let idiomCount = wordStatsList.filter(w => /^[\u4e00-\u9fa5]{4}$/.test(w.word)).length;
    let withDefCount = wordStatsList.filter(w => w.definition).length;
    console.log('[DEBUG-DEF] 总词数=' + wordStatsList.length +
                ' 四字成语数=' + idiomCount +
                ' 有释义数=' + withDefCount);

    return {
        moment,
        exercise,
        cleanTitle,
        costThreshold,
        concernSourceCount: Object.keys(concernSourceCountMap).map(key => ({key, count: concernSourceCountMap[key]})),
        concernQuestions,
        costArr: _.orderBy(costArr, ['idx'], ['asc']),
        percentile,
        avg: arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length,
        logicFillCrossTab,
        logicFillCorrectDist,
        logicFillMyDist,
        logicFillTotal: logicFillQuestions.length,
        wordStatsList,
    }
}

exports.addCollect = async function (questionId, cookie) {
    return await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/collects/${questionId}`,
        method: "POST",
        headers: {
            ...headers,
            cookie
        },
        body: null
    });
}

// 按日期统计当日错题：错题列表 + 关联词语统计
exports.getDailyWrongStats = async function (date, cookie) {
    // 读取练习记录缓存
    let cached = cache.readCache('exercise_history');
    if (!cached || !cached.data || !cached.data.exerciseHistory) {
        return { date, questions: [], wordStatsList: [] };
    }
    let exerciseHistory = cached.data.exerciseHistory;
    // 筛选当天完成的练习（按 finishedDate 字符串比对，避免时区问题）
    let dayItems = exerciseHistory.filter(h => h.finishedDate === date);
    if (dayItems.length === 0) {
        return { date, questions: [], wordStatsList: [] };
    }

    // 收集当天所有练习中答错的题（去重：同 questionId 只保留一次）
    let seenIds = new Set();
    let wrongQuestions = [];
    let wrongQuestionIds = [];
    for (let item of dayItems) {
        try {
            // 本地题库记录：从 quiz_records 缓存读取，不调用在线 API
            if (item._isLocalQuiz) {
                const quizRecord = require('../util/quizRecord');
                const rec = quizRecord.getRecord(item.id);
                if (!rec || !rec.questions) continue;
                rec.questions.forEach(q => {
                    if (q.correct === false) {
                        const qid = 'local_' + (q.uid || q.qNo);
                        if (seenIds.has(qid)) return;
                        seenIds.add(qid);
                        wrongQuestions.push({
                            questionId: qid,
                            content: q.stem,
                            options: q.options,
                            correctAnswer: { choice: q.answer, type: 201 },
                            difficulty: 3,
                            source: rec.setName + ' 第' + q.qNo + '题',
                            tags: [],
                            keypoints: [rec.source, q.knowledge].filter(Boolean),
                            solution: q.analysis,
                            myAnswer: q.myAnswer,
                            cost: null
                        });
                    }
                });
                continue;
            }
            let obj = await exports.getResultObj(item.id, 70, cookie);
            if (!obj || !obj.concernQuestions) continue;
            obj.concernQuestions.forEach(q => {
                if (!q.correct && !seenIds.has(q.questionId)) {
                    seenIds.add(q.questionId);
                    // 统一转为数字，与 word_frequency 缓存中的 questionId 类型对齐
                    wrongQuestionIds.push(Number(q.questionId));
                    wrongQuestions.push({
                        questionId: q.questionId,
                        content: q.content,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        difficulty: q.difficulty,
                        source: q.source,
                        tags: q.tags,
                        keypoints: q.keypoints,
                        solution: q.solution,
                        myAnswer: q.myAnswer,
                        cost: q.cost
                    });
                }
            });
        } catch (e) {
            console.error('当日错题: 练习 ' + item.id + ' 获取失败:', e.message);
        }
    }

    // 逻辑填空词语统计：从全错题本词语频次中，筛选出与当日错题关联的词语
    let wordStatsList = [];
    try {
        let freqData = await exports.getWordFrequency(cookie);
        let allWords = [].concat(freqData.words || [], freqData.idioms || []);
        let wrongIdSet = new Set(wrongQuestionIds);
        wordStatsList = allWords
            .map(w => ({
                word: w.word,
                total: w.count,
                questionIds: (w.questionIds || []).filter(qid => wrongIdSet.has(qid))
            }))
            .filter(w => w.questionIds.length > 0);  // 只保留与当日错题关联的词语
    } catch (e) {
        console.error('当日错题: 获取词语统计失败:', e.message);
    }

    return {
        date,
        questions: wrongQuestions,
        wordStatsList
    };
}

exports.delCollect = async function (questionId, cookie) {
    await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/collects/${questionId}`,
        method: "DELETE",
        headers: {
            ...headers,
            cookie
        }
    });
}

exports.getVideoUrl = async function (questionId, cookie) {
    try {
        let episodeMap = await getEpisodesByIds([questionId], cookie);
        if (!episodeMap || !episodeMap[questionId]) return null;
        let videoResult = await httpRequest({
            url: `https://ke.fenbi.com/api/gwy/v3/episodes/${episodeMap[questionId][0].id}/mediafile/meta`,
            method: "GET",
            headers: {
                ...headers,
                cookie
            },
            json: true
        });
        if (videoResult && videoResult.datas && videoResult.datas.length > 0) {
            return _.orderBy(videoResult.datas, ['realSize'], ['desc'])[0].url;
        }
        return null;
    } catch (e) {
        console.error('getVideoUrl 失败:', e.message);
        return null;
    }
}

exports.getComments = async function (questionId, cookie) {
    try {
        let episodeMap = await getEpisodesByIds([questionId]);
        let cursorArr = [0, 30];
        let commentResultArr = await Promise.all(cursorArr.map(cursor => {
            return httpRequest({
                url: `https://ke.fenbi.com/ipad/gwy/v3/comments/episodes/${episodeMap[questionId][0].id}?system=12.4.7&inhouse=0&app=gwy&ua=iPad&av=44&version=6.11.3&kav=22&kav=1&len=30&start=${cursor}`,
                method: "GET",
                json: true,
                headers: {
                    ...headers,
                    cookie
                }
            });
        }));
        let datas = _.flatMap(commentResultArr.filter(a => a), r => r.datas);
        return _.orderBy(datas.filter(i => {
            return i.likeCount > 1 && !['?', '？'].some(t => i.comment.includes(t)) && i.comment.length > 8
        }), ['likeCount'], ['desc']).slice(0, 10);
    } catch (e) {
        return [];
    }
}

function convertTree(root) {
    let str = '';
    for (let child of root.children) {
        if (child.name === 'em') {
            str += '<span class="searchKeyword">' + convertTree(child) + '</span>';
        } else if (child.name === 'txt') {
            str += child.value;
        } else if (child.name === 'p') {
            str += convertTree(child);
        } else {
        }
    }
    return str;
}

const cache = require('../util/cacheUtil');

// 将keypointTree扁平化为带层级的列表
function flattenTree(nodes, parentPath, result) {
    if (!nodes) return;
    for (let node of nodes) {
        let currentPath = parentPath ? (parentPath + ' > ' + node.name) : node.name;
        let count = node.questionIds ? node.questionIds.length : 0;
        result.push({
            id: node.id,
            name: node.name,
            fullPath: currentPath,
            count: count,
            hasChildren: !!(node.children && node.children.length > 0)
        });
        if (node.children && node.children.length > 0) {
            flattenTree(node.children, currentPath, result);
        }
    }
}

// 构建前端用的树结构（只含分类信息，不含题目详情）
function buildCategoryTree(nodes, parentPath) {
    if (!nodes) return [];
    return nodes.map(node => {
        let currentPath = parentPath ? (parentPath + ' > ' + node.name) : node.name;
        // 每个节点的questionIds已包含所有子节点的题目，直接用长度即可
        let count = node.questionIds ? node.questionIds.length : 0;
        let result = {
            id: node.id,
            name: node.name,
            fullPath: currentPath,
            count: count,
        };
        if (node.children && node.children.length > 0) {
            result.children = buildCategoryTree(node.children, currentPath);
        }
        return result;
    });
}

// 获取keypointTree（带缓存）
async function getKeypointTree(cookie) {
    let cacheKey = 'wrong_keypoint_tree';
    let cached = cache.readCache(cacheKey);
    if (cached) {
        return cached.tree;
    }
    let tree = await httpRequest({
        url: 'https://tiku.fenbi.com/api/xingce/errors/keypoint-tree?app=web&kav=12',
        method: 'GET',
        json: true,
        headers: { ...headers, cookie }
    });
    if (tree && tree.length > 0) {
        cache.writeCache(cacheKey, { tree });
    }
    return tree;
}

// 获取指定知识点下的题目详情（带缓存，按keypointId缓存）
async function fetchAndCacheWrongQuestions(keypointId, questionIds, cookie) {
    let cacheKey = 'wrong_q_' + keypointId;
    let cached = cache.readCache(cacheKey);
    if (cached && cached.questions) {
        console.log('PDF: 使用缓存 questions=' + cached.questions.length + ' for keypointId=' + keypointId);
        return cached.questions;
    }
    console.log('PDF: 缓存未命中，从API获取 keypointId=' + keypointId + ' totalIds=' + questionIds.length);
    let solutionMap = {};
    for (let i = 0; i < questionIds.length; i += 20) {
        let batchIds = questionIds.slice(i, i + 20);
        try {
            let batchSolutions = await getSolutionsByIds(batchIds, cookie);
            Object.assign(solutionMap, batchSolutions);
            console.log('PDF: 批次 ' + (i/20+1) + ' 获取到 ' + Object.keys(batchSolutions||{}).length + ' 条解答');
        } catch (e) { console.log('PDF: 批次 ' + (i/20+1) + ' 失败: ' + e.message); }
    }
    let questions = [];
    let seenIds = new Set();
    questionIds.forEach(qid => {
        if (seenIds.has(qid)) return;
        seenIds.add(qid);
        let sol = solutionMap[qid];
        if (!sol) return;
        questions.push({
            questionId: qid,
            content: sol.content,
            options: sol.accessories && sol.accessories[0] ? sol.accessories[0].options : [],
            correctAnswer: sol.correctAnswer,
            difficulty: sol.difficulty,
            source: sol.source,
            tags: (sol.tags || []).map(t => t.name),
            keypoints: (sol.keypoints || []).map(k => k.name),
            correctRatio: sol.questionMeta ? sol.questionMeta.correctRatio : null,
            mostWrongAnswer: sol.questionMeta ? sol.questionMeta.mostWrongAnswer : null,
            solution: sol.solution
        });
    });
    console.log('PDF: 最终构建 ' + questions.length + ' 道题目 for keypointId=' + keypointId);
    cache.writeCache(cacheKey, { questions });
    return questions;
}

exports.getWrongQuestions = async function (cookie) {
    let keypointTree = await getKeypointTree(cookie);
    if (!keypointTree || keypointTree.length === 0) {
        return { categories: [], total: 0, cachedAt: null };
    }

    // 构建分类树（不含题目详情，前端按需加载）
    let categories = buildCategoryTree(keypointTree, '');

    // 统计总错题数
    let total = categories.reduce((sum, c) => sum + c.count, 0);

    let cachedAt = cache.getCacheTime('wrong_keypoint_tree');

    // 生成侧边栏HTML
    let sidebarHtml = buildSidebarHtml(categories);

    return { categories, total, cachedAt, sidebarHtml };
}

function buildSidebarHtml(nodes, depth) {
    depth = depth || 0;
    let html = '';
    for (let node of nodes) {
        let indent = depth * 16;
        html += `<div class="sidebar-item" data-id="${node.id}" data-name="${node.name}" onclick="selectCategory(this, ${node.id})" style="padding-left:${16 + indent}px;">`;
        html += '<span class="name">' + node.name + '</span>';
        html += '<span class="badge">' + node.count + '</span>';
        html += '</div>';
        if (node.children && node.children.length > 0) {
            html += buildSidebarHtml(node.children, depth + 1);
        }
    }
    return html;
}

// 获取指定知识点的错题详情（按需加载）
exports.getWrongQuestionDetails = async function (keypointId, cookie) {
    // 先从keypointTree中找到该节点的questionIds
    let keypointTree = await getKeypointTree(cookie);
    let targetNode = null;

    function findNode(nodes, id) {
        if (!nodes) return null;
        for (let node of nodes) {
            if (node.id === Number(id)) return node;
            if (node.children) {
                let found = findNode(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    targetNode = findNode(keypointTree, keypointId);
    if (!targetNode) return { questions: [], count: 0 };

    // 收集该节点及所有子节点的questionIds
    let allIds = [];
    function collectIds(node) {
        if (node.questionIds) allIds.push(...node.questionIds);
        if (node.children) node.children.forEach(c => collectIds(c));
    }
    collectIds(targetNode);

    // 去重
    let uniqueIds = [...new Set(allIds)];

    let questions = await fetchAndCacheWrongQuestions(keypointId, uniqueIds, cookie);
    return { questions, count: uniqueIds.length, name: targetNode.name };
}

exports.search = async function (text, cookie, moduleFilter) {
    let cursorArr = [0, 15];
    let commentResultArr = await Promise.all(cursorArr.map(cursor => {
        return httpRequest({
            url: `https://60.205.108.139/ipad/search/v2?system=12.4.7&inhouse=0&app=gwy&ua=iPad&av=44&version=6.11.3&kav=22&coursePrefix=xingce&format=json&len=15&q=${encodeURIComponent(text)}&start=${cursor}`,
            method: "GET",
            json: true,
            headers: {
                ...headers,
                'User-Agent': 'XC/6.11.3 (iPad; iOS 12.4.7; Scale/2.00)',
                'Accept': '*/*',
                'Host': 'tiku.fenbi.com',
                cookie
            }
        });
    }));
    let datas = _.flatMap(commentResultArr.filter(a => a), r => _.get(r, 'data.items', []));

    // console.log('[SEARCH-DEBUG] raw items:', datas.length, 'text:', text, 'module:', moduleFilter);

    datas.forEach(item => {
        let sourceList = item.source.split(',');
        item.sourceList = sourceList.filter(s => {
            let blockSourceList = ['礼包', '模考'];
            return !blockSourceList.some(b => s.includes(b));
        })
    });
    datas = datas.filter(item => item.sourceList.length !== 0);

    // console.log('[SEARCH-DEBUG] after filter, items:', datas.length);
    // if (datas.length > 0) {
    //     console.log('[SEARCH-DEBUG] sample sourceList:', datas[0].sourceList);
    // }

    // 按模块过滤
    if (moduleFilter && moduleFilter !== '全部') {
        datas = datas.filter(item =>
            item.sourceList.some(s => s.includes(moduleFilter))
        );
        // console.log('[SEARCH-DEBUG] after module filter, items:', datas.length);
    }

    datas.forEach(item => {
        item.stemSnippet_ = convertTree(JSON.parse(item.stemSnippet));
    });
    return datas;
}

// 从错题本逻辑填空题中收集选项词语频次统计
// cacheExpireMs: 15 天；forceRefresh=true 时强制重新拉取
exports.getWordFrequency = async function (cookie, forceRefresh) {
    let cacheKey = 'word_frequency';
    const WORD_FREQ_EXPIRE_MS = 15 * 24 * 60 * 60 * 1000; // 15天
    if (!forceRefresh) {
        let cached = cache.readCache(cacheKey, WORD_FREQ_EXPIRE_MS);
        if (cached && (cached.words || cached.idioms)) {
            return cached;
        }
    }
    console.log('[WORD-FREQ] 缓存未命中或强制刷新，从API获取数据...');

    // 1. 获取错题本分类树
    let keypointTree = await getKeypointTree(cookie);
    if (!keypointTree || keypointTree.length === 0) {
        return { words: [], total: 0, cachedAt: Date.now() };
    }

    // 2. 收集所有错题ID
    let allIds = [];
    function collectIds(nodes) {
        if (!nodes) return;
        for (let node of nodes) {
            if (node.questionIds && node.questionIds.length > 0) {
                allIds = allIds.concat(node.questionIds);
            }
            if (node.children) collectIds(node.children);
        }
    }
    collectIds(keypointTree);
    allIds = [...new Set(allIds)];
    // console.log('[WORD-FREQ] 错题总数:', allIds.length);
    // console.log('[WORD-FREQ] 前5个ID:', allIds.slice(0, 5));

    if (allIds.length === 0) {
        return { words: [], total: 0, cachedAt: Date.now() };
    }

    // 3. 批量获取题目详情（含选项）
    let wordCountMap = {};
    let wordSourceMap = {};
    let logicFillCount = 0;

    for (let i = 0; i < allIds.length; i += 20) {
        let batchIds = allIds.slice(i, i + 20);
        try {
            let solutions = await getSolutionsByIds(batchIds, cookie);
            let solKeys = Object.keys(solutions || {});
            // console.log('[WORD-FREQ] 批次', Math.floor(i/20)+1, '获取到', solKeys.length, '条解答');
            // if (i === 0 && solKeys.length > 0) {
            //     let firstSol = solutions[solKeys[0]];
            //     console.log('[WORD-FREQ] 第一题结构:', JSON.stringify({
            //         hasAccessories: !!firstSol.accessories,
            //         accessoriesLen: firstSol.accessories ? firstSol.accessories.length : 0,
            //         hasOptions: firstSol.accessories && firstSol.accessories[0] ? !!(firstSol.accessories[0].options) : false,
            //         optionsSample: firstSol.accessories && firstSol.accessories[0] && firstSol.accessories[0].options ? firstSol.accessories[0].options.slice(0,2) : null,
            //         tags: (firstSol.tags||[]).map(t=>t.name),
            //         keypoints: (firstSol.keypoints||[]).map(k=>k.name)
            //     }));
            // }
            Object.keys(solutions || {}).forEach(qid => {
                let sol = solutions[qid];
                if (!sol) return;
                // 检查是否为逻辑填空类题目
                let allTags = (sol.tags || []).map(t => t.name).concat((sol.keypoints || []).map(k => k.name));
                let isLogicFill = allTags.some(t =>
                    t.includes('逻辑填空') || t.includes('实词填空') || t.includes('成语填空')
                );
                if (!isLogicFill) return;
                logicFillCount++;

                // 提取选项中的词语
                let options = sol.accessories && sol.accessories[0] ? sol.accessories[0].options : [];
                options.forEach(opt => {
                    // 去除HTML标签
                    let cleanOpt = opt.replace(/<[^>]+>/g, '').trim();
                    // 按顿号、逗号、空格分割
                    let words = cleanOpt.split(/[,，、\s]+/).filter(w => w.length >= 2);
                    words.forEach(w => {
                        // 去除标点
                        w = w.replace(/[。！？；：""''（）()]/g, '').trim();
                        if (w.length < 2) return;
                        wordCountMap[w] = (wordCountMap[w] || 0) + 1;
                        if (!wordSourceMap[w]) wordSourceMap[w] = [];
                        if (!wordSourceMap[w].includes(Number(qid))) {
                            wordSourceMap[w].push(Number(qid));
                        }
                    });
                });
            });
        } catch (e) {
            // console.log('[WORD-FREQ] 批次失败:', e.message);
        }
    }

    // console.log('[WORD-FREQ] 逻辑填空题目数:', logicFillCount);
    // console.log('[WORD-FREQ] 收集到词语种类:', Object.keys(wordCountMap).length);

    // 4. 全部词语保留（不再按 count>3 过滤），仅剔除单字噪声
    let isIdiom = w => /^[\u4e00-\u9fa5]{4}$/.test(w);
    let allWords = Object.keys(wordCountMap).map(w => ({
        word: w,
        count: wordCountMap[w],
        questionIds: wordSourceMap[w] || []
    }));

    let idioms = allWords.filter(w => isIdiom(w.word)).sort((a, b) => b.count - a.count);
    let words = allWords.filter(w => !isIdiom(w.word)).sort((a, b) => b.count - a.count);

    // 注入成语词典释义/考频/组主题（CSV 数据）
    idioms = idiomDict.enrich(idioms);

    // console.log('[WORD-FREQ] 四字成语数:', idioms.length, '高频词语数:', words.length);

    let data = { words, idioms, total: words.length + idioms.length, cachedAt: Date.now() };
    cache.writeCache(cacheKey, data, WORD_FREQ_EXPIRE_MS);
    return data;
}

// 获取搜索模块列表（从分类API获取）
exports.getSearchModules = async function (cookie) {
    let cacheKey = 'search_modules';
    let cached = cache.readCache(cacheKey);
    if (cached) return cached.modules;

    let category = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/categories?&filter=keypoint&app=web&kav=12&version=3.0.0.0`,
        method: "GET",
        json: true,
        headers: { ...headers, cookie }
    });

    let modules = ['全部'];
    if (category && category.length > 0) {
        category.forEach(cat => {
            let name = cat.name.split('-')[0];
            if (!modules.includes(name)) modules.push(name);
        });
    }
    // 确保常见模块存在
    let defaultModules = ['言语理解', '判断推理', '数量关系', '资料分析', '常识判断'];
    defaultModules.forEach(m => {
        if (!modules.includes(m)) modules.push(m);
    });

    cache.writeCache(cacheKey, { modules });
    return modules;
}

// 按练习ID批量获取错题或未写题目
// type: 'wrong' = 答错题, 'unanswered' = 未写题(status===10)
exports.getQuestionsByExerciseIds = async function (exerciseIds, type, cookie) {
    let allQuestions = [];
    let seenIds = new Set();

    // 对练习ID去重，避免同一练习被处理多次
    let uniqueExerciseIds = [...new Set(exerciseIds)];
    console.log('导出: 去重后练习数=' + uniqueExerciseIds.length + ' (原始' + exerciseIds.length + '个), type=' + type);

    for (let exerciseId of uniqueExerciseIds) {
        try {
            let report = await getExerciseReport(exerciseId, cookie);
            if (!report || !report.answers) {
                console.log('导出: 练习 ' + exerciseId + ' 无报告数据，跳过');
                continue;
            }

            // 根据类型筛选题目ID
            let targetIds = [];
            report.answers.forEach(answer => {
                if (type === 'wrong') {
                    // 答了但答错（correct 为 falsy 值都算错，与原 getResultObj 逻辑一致）
                    if (answer.status !== 10 && !answer.correct) {
                        targetIds.push(answer.questionId);
                    }
                } else if (type === 'unanswered') {
                    // 未写（status===10 表示跳过/未答）
                    if (answer.status === 10) {
                        targetIds.push(answer.questionId);
                    }
                }
            });

            console.log('导出: 练习 ' + exerciseId + ' 筛选到 ' + targetIds.length + ' 道目标题目');

            // 题目去重
            targetIds = targetIds.filter(qid => !seenIds.has(qid));
            targetIds.forEach(qid => seenIds.add(qid));
            if (targetIds.length === 0) continue;

            console.log('导出: 练习 ' + exerciseId + ' 去重后新增 ' + targetIds.length + ' 道');

            // 批量获取题目详情
            for (let i = 0; i < targetIds.length; i += 20) {
                let batchIds = targetIds.slice(i, i + 20);
                try {
                    let solutionMap = await getSolutionsByIds(batchIds, cookie);
                    batchIds.forEach(qid => {
                        let sol = solutionMap[qid];
                        if (!sol) return;
                        allQuestions.push({
                            questionId: qid,
                            content: sol.content,
                            options: sol.accessories && sol.accessories[0] ? sol.accessories[0].options : [],
                            correctAnswer: sol.correctAnswer,
                            difficulty: sol.difficulty,
                            source: sol.source,
                            tags: (sol.tags || []).map(t => t.name),
                            keypoints: (sol.keypoints || []).map(k => k.name),
                            solution: sol.solution
                        });
                    });
                } catch (e) {
                    console.error('导出: 批量获取题目失败:', e.message);
                }
            }
        } catch (e) {
            console.error('导出: 练习 ' + exerciseId + ' 获取失败:', e.message);
        }
    }

    console.log('导出: 共获取 ' + allQuestions.length + ' 道题目');
    return allQuestions;
}