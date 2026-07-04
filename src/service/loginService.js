const request = require('request');
const setCookie = require('set-cookie-parser');


function queryString(n) {
    var t = "";
    for (let e in n)
        t += e + "=" + encodeURIComponent(n[e]) + "&";
    return t.slice(0, -1)
}

/**
 * 返回的是 Cookie
 */
exports.login = async function (phone, password) {
    let loginBody = { phone, password, persistent: true, app: 'web' };

    return await new Promise(function (resolve, reject) {
        request({
            url: 'https://tiku.fenbi.com/api/users/loginV2?kav=12&app=web',
            method: 'POST',
            json: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Origin': 'https://www.fenbi.com',
                'Referer': 'https://www.fenbi.com/'
            },
            body: queryString(loginBody),
        }, function (err, httpResponse, body) {
            if (err) reject(err);
            resolve({
                cookies: setCookie.parse(httpResponse.headers['set-cookie'] || []),
                body: body
            });
        });
    });
}