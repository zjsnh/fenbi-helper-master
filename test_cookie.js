// 用用户在浏览器登录后的cookie测试API
// 从server端直接用真实cookie调用
const httpUtil = require('./src/util/httpUtil');

const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "zh-CN,zh-TW;q=0.9,zh;q=0.8",
    "cache-control": "max-age=0",
};

async function testWithCookie(cookie) {
    console.log('=== 用cookie测试 category-exercises API ===\n');
    
    for (let catId of [1, 3]) {
        for (let cursor of [0, 30, 60, 90, 120]) {
            try {
                let result = await httpUtil.httpRequest({
                    url: `https://tiku.fenbi.com/api/xingce/category-exercises?categoryId=${catId}&cursor=${cursor}&count=30`,
                    method: 'GET',
                    json: true,
                    headers: { ...headers, cookie }
                });
                if (result && result.datas) {
                    console.log(`categoryId=${catId}, cursor=${cursor}: ${result.datas.length}条`);
                    if (result.datas.length > 0) {
                        let dates = result.datas.map(d => new Date(d.updatedTime).toLocaleDateString());
                        console.log(`  时间范围: ${dates[dates.length-1]} ~ ${dates[0]}`);
                    }
                    if (result.datas.length < 30) {
                        console.log('  (已到最后一页)');
                        break;
                    }
                } else {
                    console.log(`categoryId=${catId}, cursor=${cursor}: 返回异常`, typeof result, result ? Object.keys(result) : 'null');
                    break;
                }
            } catch(e) {
                console.log(`categoryId=${catId}, cursor=${cursor}: 失败 - ${e.message}`);
                break;
            }
        }
        console.log('');
    }
}

// 从命令行获取cookie
let cookie = process.argv[2];
if (!cookie) {
    console.log('用法: node test_cookie.js "cookie_string"');
    console.log('');
    console.log('请在浏览器中打开 http://localhost:3000 , 登录后从开发者工具复制cookie');
    process.exit(1);
}

testWithCookie(cookie).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
