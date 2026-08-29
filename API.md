# StudentOS API 使用文档

> **版本** v0.44 · **作者** github@qibaoseven · bilibili@七宝-Seven
> 适用于部署在 Netlify 的站点。以下示例 URL 使用占位 `https://<你的域名>`，实际请替换。

---

## 1. 概览

StudentOS 后端提供两组接口：**班级管理**与**作业子系统**，均通过 Netlify Functions 暴露。

### 官方部署站点
| 环境 | 站点 | API 基址 |
|------|------|----------|
| **master（正式）** | `os-stu.netlify.app` | `https://os-stu.netlify.app/api` |
| **beta（测试）** | `beta-studentos.netlify.app` | `https://beta-studentos.netlify.app/api` |

下列示例中的 `https://<域名>` 可替换为上述任一官方基址。

| 基址 | 说明 |
|------|------|
| `https://<域名>/api/*` | 经 `netlify.toml` 重定向到函数（推荐） |
| `https://<域名>/.netlify/functions/api/api/*` | 函数直连地址 |

### 通用约定
- **请求头**：`Content-Type: application/json`（POST 时）
- **鉴权头**：
  - `X-Password`：班级明文密码
  - `X-Password-Hash`：班级密码的 SHA-256 十六进制（即 `sha256(密码)`）
- **CORS**：`Access-Control-Allow-Origin: *`，允许方法 `GET, POST, OPTIONS, DELETE`，允许头 `Content-Type, X-Password, X-Password-Hash`
- **统一返回**：JSON。错误时含 `error` 字段，部分含 `path`。

### 密码哈希示例
`X-Password-Hash` = `sha256(明文密码)` 的十六进制串。可用下面命令计算（以密码 `706` 为例，注意：示例班级的密码仅为演示，请勿在真实环境中使用同秘密码）：
```bash
printf '706' | sha256sum   # 输出 35254aa9a21444e50349cebb5465b9b42cb4a625ebcbffe24504b178c35bcb85
```
实际调用时建议服务端/脚本动态计算，不要在 URL 或日志中明文回显密码哈希。

---

## 2. 班级管理接口

### 2.1 获取班级列表
`GET /api/classes`

公开接口，无需密码。返回所有班级的 `id / name / created_at`。

**示例**
```bash
curl https://<域名>/api/classes
```
```json
[
  { "id": "class_1780399937423", "name": "706", "created_at": "2026-06-02T11:32:17.491Z" }
]
```

### 2.2 创建班级（需一次性 Token）
`POST /api/classes/create`

| 头 | 说明 |
|----|------|
| `Content-Type` | application/json |

**请求体**
```jsonc
{
  "class_name": "7年级6班",
  "class_password": "706",
  "token": "一次性令牌",
  "json_data": "{全部 students 数据的 JSON 字符串}"   // 注意：是字符串
}
```

| 状态码 | 含义 |
|--------|------|
| 201 | 创建成功，返回 `id / name / message` |
| 400 | 缺少必填字段 |
| 401 | Token 无效或已使用 |

> Token 从 `tokens.json` 读取，创建成功后即作废。

### 2.3 从 JsonBin 导入班级
`POST /api/classes/import`

| 头 | 说明 |
|----|------|
| `Content-Type` | application/json |

**请求体**
```jsonc
{
  "bin_id": "jsonbin 的 bin id",
  "master_key": "jsonbin 的 X-Master-Key",
  "class_name": "7年级6班",
  "class_password": "706"
}
```

| 状态码 | 含义 |
|--------|------|
| 201 | 导入成功 |
| 400 | 缺少必填字段 |
| 401 | JsonBin 验证失败 |

### 2.4 获取班级数据
`GET /api/class/{id}`

| 头 | 说明 |
|----|------|
| `X-Password` | 班级密码 |
| `X-Password-Hash` | sha256(密码) |

**返回**：班级完整数据 `{ data: { ...全部字段 } }`（已解密）。

| 状态码 | 含义 |
|--------|------|
| 200 | 成功，返回数据 |
| 400 | 缺少密码 / 缺少哈希 |
| 401 | 密码错误 |
| 404 | 班级不存在 |

**示例**
```bash
curl -H "X-Password: 706" -H "X-Password-Hash: <hash>" \
     https://<域名>/api/class/class_1780399937423
```

### 2.5 保存班级数据
`POST /api/class/{id}`

| 头 | 说明 |
|----|------|
| `X-Password` | 班级密码 |
| `X-Password-Hash` | sha256(密码) |
| `Content-Type` | application/json |

**请求体**
```jsonc
{ "data": { "...全部班级字段..." } }
```
服务端将数据用 AES-256-GCM 加密后写入。返回 `{ message: "保存成功" }`。

### 2.6 获取数据收集指令模板
`GET /api/template`

返回一份 Markdown 指令文档（`.md`），用于指导 AI 收集班级初始数据。无鉴权。

---

## 3. 作业子系统接口

作业子系统基于**位压缩 + AES-256-GCM 加密**存储。每个班级一个独立的 `homework_data`。

### 数据模型（理解接口的前提）
- 数据为三维结构：`[天数][学生索引][学科]`
- **学生索引从 1 开始**，索引 0 是「机器人哨兵」；实际学生数 = `student_count`
- 每学科 1 bit：`0` = 未提交，`1` = 已提交
- 学科名通过 `subject_names` 字典（键从 `0` 开始）定义
- 日期范围：起始日 `start_date`，向后逐日递增

**通用路径前缀**：`/api/class/{id}/homework`

### 3.1 初始化作业系统
`POST /api/class/{id}/homework/init`

| 头 | 说明 |
|----|------|
| `X-Password` / `X-Password-Hash` | 班级密码 |
| `Content-Type` | application/json |

**请求体**
```jsonc
{
  "student_count": 51,                        // 学生数（真实学生）
  "subject_count": 2,                         // 学科数
  "subject_names": { "0": "语文", "1": "数学" }, // 学科名映射
  "start_date": "2026-08-28"                  // 可选，默认今天
}
```

| 状态码 | 含义 |
|--------|------|
| 200 | 初始化成功，返回 `success/message/meta` |
| 400 | 参数不合法 / 已初始化 / 学科名不完整 |

### 3.2 获取作业元数据
`GET /api/class/{id}/homework/meta`

返回 `studentCount / subjectCount / subjectNames / initializedAt / startDate`。

| 状态码 | 含义 |
|--------|------|
| 200 | 元数据 |
| 404 | 作业系统未初始化 |

### 3.3 检查是否已初始化
`GET /api/class/{id}/homework/status`

```json
{ "initialized": true, "message": "作业系统已初始化" }
```

### 3.4 获取全部作业数据
`GET /api/class/{id}/homework`

| 头 | 说明 |
|----|------|
| `X-Password` / `X-Password-Hash` | 班级密码 |

**返回**：
```jsonc
{
  "data": [ [ [0,1], [1,0], ... ], ... ],   // [天数][学生索引][学科] 位数组
  "dateFrom": "2026-08-28",
  "dateTo": "2026-08-29",
  "totalDays": 2
}
```

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 401 | 密码错误 |
| 404 | 作业数据不存在 |

### 3.5 获取原始二进制数据（Base64）
`GET /api/class/{id}/homework/raw`

返回 `{ data(加密后的base64), meta, encoding: "base64", size }`。无需密码。

### 3.6 获取单个学生作业
`GET /api/class/{id}/homework/student/{studentId}`

| 头 | 说明 |
|----|------|
| `X-Password` / `X-Password-Hash` | 班级密码 |

**带日期**（`?date=YYYY-MM-DD`）：
```json
{ "date": "2026-08-28", "studentId": 23, "homework": [1, 0] }
```

**不带日期**：返回该学生全部记录 `{ studentId, data: [{date, homework}, ...] }`。

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 无效学生ID |
| 401 | 密码错误 |
| 404 | 未找到数据 |

### 3.7 提交登记（标记某学生某学科已交）
`POST /api/class/{id}/homework/update`

| 头 | 说明 |
|----|------|
| `X-Password` / `X-Password-Hash` | 班级密码 |
| `Content-Type` | application/json |

**请求体**
```jsonc
{
  "student_id": 23,
  "target_date": "2026-08-28",
  "subject_id": 0      // 0=语文（按 subject_names 索引）
}
```
将该学生该学科置为 `1`（已提交）。返回 `{ message: "更新成功", ... }`。

### 3.8 布置某天作业（覆盖整日）
`POST /api/class/{id}/homework/day`

| 头 | 说明 |
|----|------|
| `X-Password` / `X-Password-Hash` | 班级密码 |
| `Content-Type` | application/json |

**请求体**：`day_data` 为当天的完整数据（索引数 = 学生数+1，每个元素是学科长度的位数组）。
```jsonc
{
  "target_date": "2026-08-29",
  "day_data": [
    [0,0],   // 机器人索引0：未提交
    [1,1],   // 学生1：语文数学都交了
    [0,0],   // 学生2：未交
    ...      // 共 student_count+1 个元素
  ]
}
```
会将指定日期替换为传入的整日数据。若目标日期超出已有范围会自动扩展补零。

### 3.9 删除作业数据
`DELETE /api/class/{id}/homework`

| 头 | 说明 |
|----|------|
| `X-Password` / `X-Password-Hash` | 班级密码 |

删除该班级的作业数据与元数据。返回 `{ message: "作业数据已删除" }`。

---

## 4. 作业相关示例流程

### 4.1 完整流程：初始化 → 布置 → 提交 → 验证

```bash
# 变量
DOMAIN=<你的域名>
CID=class_1780399937423
PASS=706
HASH=$(printf '%s' "$PASS" | sha256sum | cut -d' ' -f1)

# 1) 初始化作业（51 学生 + 语文/数学）
curl -X POST -H "Content-Type: application/json" \
  -H "X-Password: $PASS" -H "X-Password-Hash: $HASH" \
  -d '{"student_count":51,"subject_count":2,"subject_names":{"0":"语文","1":"数学"}}' \
  $DOMAIN/api/class/$CID/homework/init

# 2) 布置 8/29 全校语文作业（全未提交，52 索引 = 51学生+1机器人）
python3 - <<PY
import json,subprocess
day=[[0,0] for _ in range(52)]
body={"target_date":"2026-08-29","day_data":day}
subprocess.run(["curl","-X","POST","-H","Content-Type: application/json",
  f"-H","X-Password: ${PASS}","-H",f"X-Password-Hash: {HASH}",
  "-d",json.dumps(body),f"$DOMAIN/api/class/$CID/homework/day"])
PY

# 3) 学生 23 提交语文
curl -X POST -H "Content-Type: application/json" \
  -H "X-Password: $PASS" -H "X-Password-Hash: $HASH" \
  -d '{"student_id":23,"target_date":"2026-08-29","subject_id":0}' \
  $DOMAIN/api/class/$CID/homework/update

# 4) 验证
curl -H "X-Password: $PASS" -H "X-Password-Hash: $HASH" \
  "$DOMAIN/api/class/$CID/homework?ts=$(date +%s)"
```

### 4.2 前端「近 30 天积极度」权重
积极度排行得分 = 每个学生近 30 天 `Σ(当日提交率 × 1/(k+0.5)^√3)`，其中 `k` 为距今天数，`k∈[0,29]`。

---

## 5. 错误码速查

| 状态码 | 通用含义 |
|--------|---------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | OPTIONS 预检成功 |
| 400 | 参数缺失 / 非法 |
| 401 | 密码错误 / Token 无效 / 需鉴权 |
| 404 | 班级 / 作业数据不存在 |
| 500 | 服务器内部错误（含 `error` 详情） |

---

© 2026 StudentOS · qibaoseven
