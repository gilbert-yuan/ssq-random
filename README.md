# 双色球分析台

本项目是一个本地运行的双色球分析工具，支持一键获取开奖记录、号码分布分析、趋势建议、策略回测、社区推荐号提取、来源评分、收藏和 CSV 导出。

## 运行

需要 Node.js 24 或更高版本，并安装项目依赖。当前服务端使用 PostgreSQL 保存开奖记录、指标和选号记录。

先安装依赖并准备数据库连接：

```powershell
cd /d D:\myerp\ssq-random
npm install
$env:DATABASE_URL = "postgresql://postgres:password@127.0.0.1:5432/ssq_random"
```

也可以在项目根目录创建 `.env` 文件：

```text
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/ssq_random
```

PM2 启动时会读取 `.env`；如果当前终端里也设置了同名环境变量，终端里的值优先。

如需启用 SSL，可再设置：

```powershell
$env:DB_SSL = "1"
```

如果服务启动后立即退出，`pm2 logs ssq-random` 会明确提示是以下哪类问题：

- 未安装 `pg`
- 未设置 `DATABASE_URL`
- PostgreSQL 未启动 / 地址错误 / 凭据错误 / 数据库不存在

安装 PM2：

```bash
npm install -g pm2
```

启动服务：

```bash
npm run start
```

也可以使用启动脚本：

```bash
chmod +x ./start.sh
./start.sh
```

Windows 下也可以双击 `start.bat` 启动。

常用 PM2 命令：

```bash
npm run status
npm run logs
npm run restart
npm run stop
```

启动后打开：

```text
http://127.0.0.1:5173
```

如需临时绕过 PM2 在前台直接启动，可执行 `npm run start:node`。

运行自检：

```bash
node scripts/smoke-test.js
```

说明：烟雾测试也依赖 `DATABASE_URL`，并会真实连接 PostgreSQL。

## 功能

- 从中国福彩网公开接口获取双色球历史开奖。
- 官方接口不可用时，自动切换到 500 彩票网公开历史页。
- 统计红球、蓝球频次、近期热度、遗漏期数。
- 分析和值、跨度、AC 值、三区比例、奇偶比、大小比、质合比、12 路、重号、连号、蓝球奇偶。
- 将开奖记录、推荐记录和历史指标写入 PostgreSQL，并通过 SQL 读取。
- 对历史期数生成和值、冷热占比、奇偶、大小、三区、回归和值等指标，按期归类并绘制走势图。
- 支持自选部分红球、蓝球后自动补全剩余号码，并在红蓝分布和指标走势图中标注当前位置。
- 支持均衡趋势、热号追踪、冷号补位、社区共振、蓝球重点五种选号策略。
- 按滚动历史窗口做策略回测，展示平均红球、蓝球命中率、较好命中次数和最佳单期。
- 从公开社区页面提取红球 6 个加蓝球 1 个的号码组合。
- 对社区来源按解析量、唯一号码数、识别可信度做评分。
- 本地保存建议号、收藏号、社区推荐号，下一次更新开奖后自动核对命中。
- 对社区来源按历史命中情况生成战绩排行。
- 收藏建议号码，并导出建议号、收藏号、社区共振号和命中记录为 CSV。

## 社区来源配置

编辑 `data/community-sources.json`：

```json
[
  {
    "name": "来源名称",
    "url": "https://example.com/ssq-page"
  }
]
```

页面需要能公开访问。需要登录、强反爬、图片形式发布的号码，工具可能无法识别。

## 项目结构

```text
server.js                # 启动入口
src/server/              # 后端路由、PostgreSQL、开奖源、指标、推荐补全
public/app.js            # 前端入口
public/js/domain/        # 前端分析和选号领域逻辑
public/js/components/    # 可复用 UI 组件和图表
public/js/pages/         # 页面编排
data/                    # 本地样例数据、缓存、旧版记录迁移源
```

## 本地记录

历史开奖、指标、推荐和命中核对数据当前保存在 PostgreSQL。旧版 `data/records.json` 会在首次读取记录时迁移到数据库。

## 说明

彩票开奖结果具有随机性。本工具的建议只来自历史样本统计、滚动回测和公开网页文本提取，不能保证命中，也不应作为投入决策依据。

## 微信小程序版

项目里已经新增了一个更适合手机查看的微信小程序前端，目录在 [miniprogram](/D:/myerp/ssq-random/miniprogram)。

这个版本做了收敛，首版保留了：

- 最近开奖
- 简版趋势
- 推荐号码
- 自选补全
- 最近记录

使用说明见 [miniprogram/README.md](/D:/myerp/ssq-random/miniprogram/README.md)。
