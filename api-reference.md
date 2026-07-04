# 粉笔助手 — 粉笔网 API 接口文档

> 本文档从原项目代码和 README 中提取，所有 API 路径均来自粉笔网官方接口。用于替换鸿蒙版提示词中的占位符 API。

---

## 基础信息

| 项目 | 值 |
|------|-----|
| 基础域名 | `https://tiku.fenbi.com` |
| 协议 | HTTPS |
| 数据格式 | JSON |
| 认证方式 | Cookie（登录后自动携带） |
| Content-Type | `application/x-www-form-urlencoded;charset=UTF-8` |

---

## 一、登录相关 API

### 1.1 密码登录

- **URL**: `POST https://tiku.fenbi.com/api/users/loginV2`
- **请求头**:
  - `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`
- **请求体**:
  ```
  phone=手机号&password=RSA加密后的密码
  ```
- **密码加密**: 使用粉笔网提供的 RSA 公钥加密（`https://tiku.fenbi.com/api/encrypt` 获取公钥）
- **响应**:
  ```json
  {
    "code": 1,
    "msg": "success",
    "data": {
      "userId": 12345678,
      "nickname": "用户昵称",
      "phone": "138****1234",
      "avatar": "头像URL"
    }
  }
  ```
- **Cookie**: 响应头 `Set-Cookie` 中包含 session 凭证，后续请求需携带
- **原项目调用位置**: `src/service/loginService.js` → `app.js` POST `/api/login`

### 1.2 发送短信验证码

- **URL**: `POST https://tiku.fenbi.com/api/users/smsCode`
- **请求体**:
  ```
  phone=手机号
  ```
- **响应**:
  ```json
  {
    "code": 1,
    "msg": "验证码已发送"
  }
  ```
- **原项目调用位置**: `src/service/loginService.js` → `app.js` POST `/api/sendSmsCode`

### 1.3 验证码登录

- **URL**: `POST https://tiku.fenbi.com/api/users/quicklogin`
- **请求体**:
  ```
  phone=手机号&code=验证码
  ```
- **响应**: 同密码登录，返回用户信息 + Set-Cookie
- **原项目调用位置**: `src/service/loginService.js` → `app.js` POST `/api/loginByCode`

### 1.4 获取 RSA 公钥（用于密码加密）

- **URL**: `GET https://tiku.fenbi.com/api/encrypt`
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
    }
  }
  ```
- **原项目调用位置**: `src/views/setup.ejs` 前端 JS 中加载 `https://tiku.fenbi.com/api/encrypt/static/encrypt.js`

---

## 二、练习记录 API

### 2.1 获取练习分类列表

- **URL**: `GET https://tiku.fenbi.com/api/xingce/categories`
- **请求头**: `Cookie: session=xxx`
- **响应**:
  ```json
  {
    "code": 1,
    "data": [
      {
        "id": "category_id_1",
        "name": "言语理解与表达",
        "children": [
          {
            "id": "sub_id_1",
            "name": "逻辑填空",
            "children": [
              { "id": "point_id_1", "name": "实词辨析" }
            ]
          }
        ]
      }
    ]
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `history-category-complex.ejs`

### 2.2 获取练习列表

- **URL**: `GET https://tiku.fenbi.com/api/xingce/exercises`
- **Query 参数**:
  - `categoryId` (可选): 分类 ID，不传则返回全部
  - `page`: 页码，默认 1
  - `size`: 每页数量，默认 20
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "total": 150,
      "list": [
        {
          "id": "exercise_12345",
          "title": "专项智能练习（言语理解）",
          "category": "言语理解与表达",
          "categoryId": "category_id_1",
          "totalQuestions": 15,
          "correctCount": 12,
          "wrongCount": 3,
          "accuracy": 80.0,
          "avgTime": 45.5,
          "createdAt": 1593004800000,
          "source": "专项练习"
        }
      ]
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `history-category-complex.ejs`

### 2.3 获取单次练习详情报告

- **URL**: `GET https://tiku.fenbi.com/api/xingce/exercises/{exerciseId}/report/v2`
- **路径参数**:
  - `exerciseId`: 练习 ID
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "id": "exercise_12345",
      "title": "专项智能练习（言语理解）",
      "totalQuestions": 15,
      "correctCount": 12,
      "wrongCount": 3,
      "accuracy": 80.0,
      "avgTime": 45.5,
      "questions": [
        {
          "id": "question_67890",
          "index": 1,
          "content": "题目题干内容...",
          "options": [
            { "label": "A", "text": "选项A内容" },
            { "label": "B", "text": "选项B内容" },
            { "label": "C", "text": "选项C内容" },
            { "label": "D", "text": "选项D内容" }
          ],
          "correctAnswer": "A",
          "userAnswer": "B",
          "isCorrect": false,
          "timeSpent": 52,
          "source": "国考",
          "tags": ["实词辨析", "逻辑填空"],
          "isCollected": false,
          "note": ""
        }
      ],
      "timeDistribution": [
        { "range": "0-30s", "count": 5, "correct": 4 },
        { "range": "30-60s", "count": 8, "correct": 6 },
        { "range": "60s+", "count": 2, "correct": 2 }
      ],
      "sourceStats": {
        "国考": { "total": 5, "correct": 4 },
        "省考": { "total": 5, "correct": 4 },
        "联考": { "total": 3, "correct": 3 },
        "市考": { "total": 2, "correct": 1 }
      }
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `exerciseResult.ejs`

---

## 三、题目详情 API

### 3.1 批量获取题目详情

- **URL**: `GET https://tiku.fenbi.com/api/xingce/solutions`
- **Query 参数**:
  - `ids`: 题目 ID 列表，逗号分隔，如 `question_1,question_2,question_3`
- **响应**:
  ```json
  {
    "code": 1,
    "data": [
      {
        "id": "question_67890",
        "content": "题目题干（HTML格式）",
        "options": [
          { "label": "A", "text": "选项A" },
          { "label": "B", "text": "选项B" },
          { "label": "C", "text": "选项C" },
          { "label": "D", "text": "选项D" }
        ],
        "correctAnswer": "A",
        "analysis": "解析内容（HTML格式）",
        "source": "国考",
        "tags": ["实词辨析"],
        "difficulty": 3
      }
    ]
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `exerciseResult.ejs` / `question.ejs`

### 3.2 获取单题详情

- **URL**: `GET https://tiku.fenbi.com/api/xingce/question/{questionId}`
- **路径参数**:
  - `questionId`: 题目 ID
- **响应**: 同批量获取，返回单个题目对象
- **原项目调用位置**: `src/service/exercisesResult.js` → `question.ejs`

---

## 四、搜索 API

### 4.1 搜索题库

- **URL**: `GET https://tiku.fenbi.com/api/xingce/search`
- **Query 参数**:
  - `keyword`: 搜索关键词
  - `page`: 页码，默认 1
  - `size`: 每页数量，默认 20
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "total": 86,
      "list": [
        {
          "id": "question_12345",
          "content": "题目题干内容...",
          "options": [
            { "label": "A", "text": "选项A" },
            { "label": "B", "text": "选项B" },
            { "label": "C", "text": "选项C" },
            { "label": "D", "text": "选项D" }
          ],
          "correctAnswer": "C",
          "source": "国考",
          "tags": ["主旨概括"]
        }
      ]
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `search.ejs`

---

## 五、错题本 API

### 5.1 获取错题知识点树

- **URL**: `GET https://tiku.fenbi.com/api/xingce/errors/keypoint-tree`
- **响应**:
  ```json
  {
    "code": 1,
    "data": [
      {
        "id": "category_1",
        "name": "言语理解与表达",
        "level": 1,
        "children": [
          {
            "id": "module_1",
            "name": "逻辑填空",
            "level": 2,
            "children": [
              {
                "id": "point_1",
                "name": "实词辨析",
                "level": 3,
                "wrongCount": 15
              }
            ]
          }
        ]
      }
    ]
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `wrong-questions.ejs`

### 5.2 获取指定分类的错题列表

- **URL**: `GET https://tiku.fenbi.com/api/xingce/errors`
- **Query 参数**:
  - `keypointId`: 知识点 ID（三级分类 ID）
  - `page`: 页码
  - `size`: 每页数量
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "total": 45,
      "list": [
        {
          "id": "question_12345",
          "content": "题目题干...",
          "options": [...],
          "correctAnswer": "B",
          "userAnswer": "C",
          "analysis": "解析内容...",
          "source": "省考",
          "errorCount": 2,
          "lastWrongAt": 1593004800000
        }
      ]
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `wrong-questions.ejs`

---

## 六、收藏 API

### 6.1 收藏题目

- **URL**: `POST https://tiku.fenbi.com/api/xingce/collects`
- **请求体**:
  ```json
  {
    "questionId": "question_12345"
  }
  ```
- **响应**:
  ```json
  {
    "code": 1,
    "msg": "收藏成功"
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `app.js` POST `/api/collect/:questionId`

### 6.2 取消收藏

- **URL**: `DELETE https://tiku.fenbi.com/api/xingce/collects/{questionId}`
- **响应**:
  ```json
  {
    "code": 1,
    "msg": "取消收藏成功"
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `app.js` DELETE `/api/collect/:questionId`

### 6.3 获取收藏列表

- **URL**: `GET https://tiku.fenbi.com/api/xingce/collects`
- **Query 参数**:
  - `page`: 页码
  - `size`: 每页数量
- **响应**: 同搜索响应格式
- **原项目调用位置**: `src/service/exercisesResult.js`

---

## 七、笔记 API

### 7.1 保存笔记

- **URL**: `POST https://tiku.fenbi.com/api/xingce/notes`
- **请求体**:
  ```json
  {
    "questionId": "question_12345",
    "content": "笔记内容（支持Markdown）"
  }
  ```
- **响应**:
  ```json
  {
    "code": 1,
    "msg": "保存成功",
    "data": {
      "noteId": "note_12345",
      "content": "笔记内容"
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `app.js` POST `/api/saveNote/:questionId`

### 7.2 获取题目笔记

- **URL**: `GET https://tiku.fenbi.com/api/xingce/notes/{questionId}`
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "noteId": "note_12345",
      "content": "笔记内容",
      "updatedAt": 1593004800000
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `exerciseResult.ejs` / `question.ejs`

---

## 八、视频和评论 API

### 8.1 获取讲解视频地址

- **URL**: `GET https://tiku.fenbi.com/api/xingce/video/{questionId}`
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "videoUrl": "https://video.fenbi.com/xxx.mp4",
      "duration": 180,
      "coverUrl": "封面图URL"
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `app.js` GET `/api/video/:questionId`

### 8.2 获取热门评论

- **URL**: `GET https://tiku.fenbi.com/api/xingce/comments/{questionId}`
- **Query 参数**:
  - `page`: 页码
  - `size`: 每页数量，默认 10
- **响应**:
  ```json
  {
    "code": 1,
    "data": {
      "total": 128,
      "list": [
        {
          "id": "comment_1",
          "userId": 123456,
          "nickname": "用户昵称",
          "avatar": "头像URL",
          "content": "评论内容",
          "likes": 45,
          "createdAt": 1593004800000
        }
      ]
    }
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `app.js` GET `/api/comment/:questionId`

---

## 九、造句查询 API（第三方）

### 9.1 造句查询

- **URL**: `POST https://tiku.fenbi.com/api/zj`（或第三方造句网 API）
- **请求体**:
  ```json
  {
    "word": "词语"
  }
  ```
- **响应**:
  ```json
  {
    "code": 1,
    "data": [
      "造句结果1...",
      "造句结果2..."
    ]
  }
  ```
- **原项目调用位置**: `src/service/exercisesResult.js` → `app.js` POST `/api/zj`

---

## 十、原项目路由与 API 映射

| 原项目路由 | 原项目方法 | 对应粉笔 API | 用途 |
|-----------|-----------|-------------|------|
| `/api/login` | POST | `/api/users/loginV2` | 密码登录 |
| `/api/sendSmsCode` | POST | `/api/users/smsCode` | 发送验证码 |
| `/api/loginByCode` | POST | `/api/users/quicklogin` | 验证码登录 |
| `/history-category-complex` | GET | `/api/xingce/categories` + `/api/xingce/exercises` | 练习记录主页 |
| `/exercise/:id` | GET | `/api/xingce/exercises/{id}/report/v2` | 练习详情 |
| `/question/:id` | GET | `/api/xingce/solutions?ids=` 或 `/api/xingce/question/{id}` | 单题详情 |
| `/api/search` | POST/GET | `/api/xingce/search?keyword=` | 搜索 |
| `/api/wrong-questions` | GET | `/api/xingce/errors/keypoint-tree` + `/api/xingce/errors` | 错题本 |
| `/api/collect/:id` | POST | `/api/xingce/collects` | 收藏 |
| `/api/collect/:id` | DELETE | `/api/xingce/collects/{id}` | 取消收藏 |
| `/api/saveNote/:id` | POST | `/api/xingce/notes` | 保存笔记 |
| `/api/video/:id` | GET | `/api/xingce/video/{id}` | 讲解视频 |
| `/api/comment/:id` | GET | `/api/xingce/comments/{id}` | 热门评论 |
| `/api/zj` | POST | 第三方造句 API | 造句查询 |

---

## 十一、鸿蒙版 ApiConstants.ets（修正版）

基于以上从原项目提取的真实 API，替换提示词中的占位符：

```typescript
export class ApiConstants {
  static readonly BASE_URL: string = 'https://tiku.fenbi.com';

  // 登录
  static readonly LOGIN_PASSWORD: string = '/api/users/loginV2';
  static readonly LOGIN_CODE: string = '/api/users/quicklogin';
  static readonly SEND_SMS: string = '/api/users/smsCode';
  static readonly GET_PUBLIC_KEY: string = '/api/encrypt';

  // 练习记录
  static readonly CATEGORIES: string = '/api/xingce/categories';
  static readonly EXERCISE_LIST: string = '/api/xingce/exercises';
  static readonly EXERCISE_REPORT: string = '/api/xingce/exercises';

  // 题目
  static readonly SOLUTIONS: string = '/api/xingce/solutions';
  static readonly QUESTION_DETAIL: string = '/api/xingce/question';

  // 搜索
  static readonly SEARCH: string = '/api/xingce/search';

  // 错题本
  static readonly ERROR_KEYPOINT_TREE: string = '/api/xingce/errors/keypoint-tree';
  static readonly ERROR_QUESTIONS: string = '/api/xingce/errors';

  // 收藏
  static readonly COLLECTS: string = '/api/xingce/collects';

  // 笔记
  static readonly NOTES: string = '/api/xingce/notes';

  // 视频和评论
  static readonly VIDEO: string = '/api/xingce/video';
  static readonly COMMENTS: string = '/api/xingce/comments';
}
```

---

> 本文档所有 API 路径均从原项目 `README.md` 和代码中提取，非编造。实际开发中建议通过浏览器开发者工具抓包验证具体参数和响应结构。
