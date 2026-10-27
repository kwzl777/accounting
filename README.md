# 个人经营账本（Web 手机版）

适配手机浏览器的个人经营记账 Web 应用，电脑端同样可用。数据全部保存在服务端 SQLite 数据库，不使用 localStorage / sessionStorage 存放账本数据。

## 技术栈

- 前端：Vue 3 + Vite + Pinia + Vue Router + Naive UI + TypeScript
- 后端：Node.js + Express + better-sqlite3 + TypeScript
- 金额计算：服务端唯一实现（整数分舍入；当前金额字段以元存储，已做两位小数处理）
- 导出：ExcelJS

## 目录结构

```
.
├── package.json          # 工作区根（npm workspaces）
├── server/               # 后端 API
│   ├── src/
│   │   ├── index.ts      # 入口（API + 静态托管 web/dist）
│   │   ├── db.ts         # SQLite 初始化 & 建表
│   │   ├── auth.ts       # JWT / 密码校验
│   │   ├── calc.ts       # 核心计算（唯一可信实现）
│   │   ├── services/     # 财务汇总、审计日志
│   │   └── routes/       # 各业务接口
│   └── .env.example
└── web/                  # 前端
    └── src/
        ├── views/        # 各页面
        ├── api/client.ts # API 封装
        ├── router/
        └── stores/
```

## 环境要求

- Node.js **20+**（建议全环境统一版本）
- 原生模块 `better-sqlite3` 必须与运行时的 Node ABI 匹配：
  - 若更换 Node 版本后启动报 `NODE_MODULE_VERSION` 不一致，执行 `npm rebuild better-sqlite3`
- 无需单独安装数据库（SQLite 单文件）

## 环境变量（server）

复制 `server/.env.example` 为 `server/.env`（或直接在运行环境注入）：

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 服务端口 | `3001` |
| `DATABASE_PATH` | SQLite 文件路径 | `./data/accounting.db` |
| `JWT_SECRET` | JWT 签名密钥（**生产必须修改**） | 开发默认值 |
| `ADMIN_PASSWORD` | 首次启动创建的管理员密码 | `admin123` |

首次启动且用户表为空时，会自动创建管理员：用户名 `admin`，密码取 `ADMIN_PASSWORD`（默认 `admin123`）。
**部署后请立即修改默认密码/密钥。**

## 安装与启动

```bash
npm install

# 开发模式（两个终端）
npm run dev:server   # 后端 http://localhost:3001
npm run dev:web      # 前端 http://localhost:5173（代理 /api 到 3001）

# 生产构建与启动
npm run build        # 构建 server/dist 与 web/dist
npm run start -w server
# 后端会同时托管 web/dist，直接访问 http://localhost:3001
```

## 数据库、备份与恢复

- 数据库文件：`data/accounting.db`（由 `DATABASE_PATH` 决定）
- 应用内「更多 / 数据」页面提供：
  - **导出 Excel**（批次汇总、预定/到货、出货收款、收款明细、费用、U 币兑换、分红明细）
  - **下载备份（JSON）**（不含密码或认证信息）
  - **恢复备份**（二次确认，覆盖业务数据，不修改登录密码）
- 恢复接口要求请求体包含 `confirm: true`，否则拒绝。
- 高风险操作前建议先下载备份。

## 测试与检查

```bash
npm run type-check   # 前后端 TypeScript 检查
npm run test -w server  # 单元测试（32 个）
npm run build        # 前后端构建
```

## 已实现功能

1. 登录与数据持久化（JWT、bcrypt、登录频率限制、受保护 API、路由守卫）
2. 批次管理（创建、编辑、状态流转、归档）
3. 预定产品清单（多产品/多口味、金额自动计算）
4. 实际到货核对（分批到货、缺货/多到、金额差异、确认到货）
5. 出货与收款（分次收款、免收、剩余欠款、客户欠款汇总、超额拦截）
6. 费用与 U 币兑换（默认费用类别 + 自定义类别、U 币亏损公式：`本金 ×（买进汇率 − 卖出汇率）÷ 买进汇率`）
7. 利润核算（实收/应收口径可切换，页面明确显示）
8. 分红与出资人（手动分红总额、按出资占比分配、最大余数法舍入、确认快照、分次兑付）
9. 经营首页（5 个核心指标 + 批次列表 + 待办事项）
10. 历史查询、Excel 导出、备份恢复、修改记录（审计日志）

## 待确认 / 后续版本

- 退货、退款、供应商补货、客户预付款的冲销规则（PRD 列为后续版本）
- 费用凭证目前保存图片链接（未做文件上传）
- PWA（添加到手机桌面）尚未接入
- 利润口径默认「实收」，可在利润页切换为「应收」

## 安全提醒

- 生产环境务必设置强 `JWT_SECRET` 并修改默认管理员密码
- 建议通过 HTTPS 反向代理（Nginx 等）对外提供服务
- 备份文件不包含密码哈希与认证信息，可安全导出
