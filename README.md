# StudentOS 班级管理系统

> **版本** v0.44 · **作者** github@qibaoseven · bilibili@七宝-Seven

一个面向班级管理的 Web 系统，支持班级量化管理、学分记录、抽奖、惩罚、金币与作业提交等功能。采用**纯前端 SPA + Netlify Functions 服务端 + Netlify Blobs 存储**架构，无需自建数据库。

### 🌐 官方部署网址

| 环境 | 站点 | API 基址 |
|------|------|----------|
| **master（正式）** | [os-stu.netlify.app](https://os-stu.netlify.app) | `https://os-stu.netlify.app/api` |
| **beta（测试）** | [beta-studentos.netlify.app](https://beta-studentos.netlify.app) | `https://beta-studentos.netlify.app/api` |

---

---

## ✨ 功能总览

| 模块 | 说明 |
|------|------|
| 🏠 **系统控制台** | 我的学分 / 金币 / 学生总数 / 今日汇报状态仪表盘 |
| 👥 **班级管理** | 创建 / 导入（JsonBin）/ 选择班级，每班独立数据与密码 |
| 👤 **账号与登录** | 多角色（`user` / `admin` / `root`），密码 SHA-256 哈希存储，支持旧密码自动迁移 |
| 📊 **分数管理** | 单个 / 批量加减分、按原因加分、设置分数、学生列表，可自定义积分规则 |
| 📊 **我的分数** | 学生本人查看自己的学分、金币、排名 |
| 👥 **分组管理** | 分组、组长设置、组内成员管理 |
| 🏆 **排名管理** | 学分排行、金币排行、综合排名 |
| 📋 **每日汇报** | 每日汇报提交与状态跟踪 |
| 🎰 **学分抽奖** | 按稀有度（SSR/SR/R/N，含隐藏奖励）抽奖，限周五下午 |
| 🎯 **惩罚管理** | 抽取惩罚任务（SP/SSR/SR/R/N 稀有度），含任务期限与加分奖励 |
| 💰 **金币系统** | 学分 ↔ 金币兑换，可配置汇率 |
| 👔 **职位系统** | 班干部职位、月薪发放、任职人员 |
| ⚡ **自动事件** | 每日 / 每周 / 每月 定时自动加减分 |
| 📋 **操作日志** | 全量操作记录，含搜索 |
| 💾 **数据备份** | 导出 / 导入 / JsonBin 备份 |
| 📚 **作业提交** | 布置作业、提交登记、提交率图表、近 30 天积极度排行榜 |

---

## 🏗️ 技术架构

```
┌────────────────────┐        ┌─────────────────────┐
│   前端 (纯静态)      │  HTTPS │  后端 Functions      │
│  index.html + js/   │  ────► │  netlify/functions  │
│  单页应用 SPA        │        │  api.js (主API)      │
└────────────────────┘        │  homework.js(作业)   │
                              │  blobs.js(存储)      │
                              └────────┬─────────────┘
                                       │ Netlify Blobs
                              ┌────────▼─────────────┐
                              │  studentos-main       │
                              │  class-{id} 每个班独立  │
                              └───────────────────────┘
```

- **前端**：原生 HTML/CSS/JS，无框架，无构建工具（Node.js 仅用于 Netlify Functions）
- **存储**：[Netlify Blobs](https://github.com/netlify/blobs)，主存储桶 + 每班独立存储桶
- **部署**：Netlify，`netlify.toml` 配置 /api 重定向与 SPA 回退

---

## 🚀 快速开始

### 本地开发预览
```bash
# 克隆仓库
git clone git@github.com:qibaoseven/qibaoseven.github.io.git
cd qibaoseven.github.io

# 无需构建，直接打开 index.html 或用任意静态服务器
# 若需调 API（本地无 Functions），需部署到 Netlify 或使用线上地址
```

### 部署到 Netlify
1. 在 [Netlify](https://app.netlify.com) 导入本仓库
2. Netlify 会自动识别 `netlify.toml`（publish 目录为根目录，functions 为 `netlify/functions`）
3. 创建私有数据的令牌（`tokens.json`），用于创建班级
4. 部署完成即可访问

> 💡 官方已部署站点：正式版 [`os-stu.netlify.app`](https://os-stu.netlify.app)，测试版 [`beta-studentos.netlify.app`](https://beta-studentos.netlify.app)。本地想直接体验 API 可用这两个站点的 `/api` 基址。

---

## 📚 核心概念

### 数据模型
每个班级的数据以 JSON 对象存储，顶层结构：

```jsonc
{
  "users": {},                 // 用户表（角色、显示名、学号、头像、密码哈希）
  "scores": {},                // 学分表  学号 -> [姓名, 分数]
  "groups": {},                // 分组表  组名 -> [学号...]
  "rules": {},                 // 积分规则
  "logs": [],                  // 操作日志
  "rewards": {"rewards":{}, "hidden_rewards":[]},   // 抽奖奖励池
  "punishments": {"punishments":{}},                // 惩罚任务池
  "userPunishments": {"active":{}, "completed":{}}, // 学生惩罚状态
  "gold": {},                  // 金币表
  "exchangeRate": {...},       // 学分/金币汇率
  "emoji": {...},              // 可用表情
  "dailyReport": {},           // 每日汇报
  "autoEvents": [],            // 自动事件
  "positions": {"list":{}, "defaultSalary":5, "lastPayDate":null}  // 职位
}
```

### 角色与权限
| 角色 | 说明 | 特性权限 |
|------|------|---------|
| `root` | 超级管理员 | 全部，含自动事件 |
| `admin` | 管理员 | 分数/分组/日志/备份等管理 |
| `user` | 普通学生 | 我的分数、排名、抽奖、惩罚、金币、职位 |

### 作业系统（v0.44 新增）
- 作业数据采用 **位压缩 + AES-256-GCM 加密** 存储，每个学生每天每学科占 1 bit
- 学生维度含 **0 号机器人哨兵**（索引 0），真实学生从学号 1 开始
- 支持周 / 月 / 年提交率折线图（日/周/月粒度），近 30 天积极度排行权重 `1/(k+0.5)^√3`
- 详见 [API 文档](API.md)

---

## 🔐 安全说明

- **班级数据**：请求头传 `X-Password`（明文密码）与 `X-Password-Hash`（SHA-256），服务端 AES-256-GCM 加密存储，解密需正确密码
- **作业数据**：与班级同密码，AES-256-GCM + `HWSF` 魔数校验
- **用户密码**：`hashed:SHA256` 格式存储，支持旧格式自动迁移
- **创建班级**：需要一次性 `token`（在 `tokens.json` 配置），使用后即作废

> ⚠️ `tokens.json` 与生产密钥请勿提交到公开仓库。

---

## 📁 目录结构

```
├── index.html              # 单页应用入口
├── style.css               # 全局样式
├── netlify.toml            # Netlify 部署配置
├── package.json            # 依赖(@netlify/blobs)
├── tokens.json             # 创建班级的一次性令牌
├── js/
│   ├── main.js             # 入口 / 云保存
│   ├── data.js             # 数据模型 / 自动事件引擎
│   ├── auth.js             # 登录 / 角色权限 / 侧边栏
│   ├── utils.js            # 工具库（哈希、分数、金币、抽奖、日志）
│   ├── components/modal.js # 模态框组件
│   └── pages/              # 各功能页面
│       ├── dashboard.js / my_score.js / score.js / group.js / rank.js
│       ├── daily_report.js / gacha.js / punishment.js / gold.js / logs.js
│       ├── backup.js / account.js / auto_events.js / positions.js
│       ├── class_select.js / homework.js
├── netlify/
│   └── functions/          # 服务端
│       ├── api.js          # 主 API（班级 + 作业）
│       ├── homework.js     # 作业子系统
│       └── blobs.js        # 存储封装
├── tools/fileutils.py      # 文件处理工具
└── data/                   # 数据收集指令文档
```

---

## 📖 文档

- **[API.md](API.md)** — 完整 API 使用文档（端点、参数、返回、示例）

---

## 🔖 版本历史

| 版本 | 说明 |
|------|------|
| v0.44 | 新增作业提交子系统（前后端），作业数据加密，全量版头更新 |
| v0.43 | 稳定版，登录/密码体系，多角色权限 |
| v0.42 | 引入 Netlify Functions API 与 Blobs 云存储 |

---

© 2026 StudentOS · qibaoseven
