# 微信小程序版

这个目录是现有项目的微信小程序前端，现在分成两个更像正式产品的页面：

- 首页：最新开奖、我的战绩、快速参考、推荐号码
- 我的选号：自选补全、已保存号码、置顶、删除、状态筛选、中奖状态、奖金金额、大奖轮播

复杂图表、社区来源和大段分析说明先没有搬进来，这样页面会更清爽。

## 本地联调

先安装依赖、配置数据库，再启动现有 Node 服务。

PowerShell:

```powershell
cd D:\myerp\ssq-random
$env:DATABASE_URL = "postgresql://postgres:password@127.0.0.1:5432/ssq_random"
$env:HOST = "0.0.0.0"
node server.js
```

如果服务没有起来，先看终端提示，当前会直接说明是缺依赖、缺 `DATABASE_URL`，还是 PostgreSQL 连接失败。

如果只在微信开发者工具模拟器里调试，可以继续用 `http://127.0.0.1:5173`。

如果要在手机真机预览，请把 [app.js](/D:/myerp/ssq-random/miniprogram/app.js) 里的 `apiBase` 改成你电脑的局域网 IP，例如：

```js
http://192.168.1.20:5173
```

## 打开方式

1. 打开微信开发者工具
2. 选择导入项目
3. 项目目录选 `D:\myerp\ssq-random\miniprogram`
4. AppID 可以先用测试号或 `touristappid`

## 请求说明

开发阶段建议在微信开发者工具里勾选：

- 不校验合法域名
- 不校验 TLS 版本

如果后面要正式发布，小程序请求地址需要换成已配置到微信后台的 HTTPS 合法域名。

## 依赖接口

- `GET /api/mobile/home`
- `GET /api/mobile/picks`
- `POST /api/complete-ticket`
- `POST /api/records`
- `PATCH /api/records`
- `DELETE /api/records?id=...`
