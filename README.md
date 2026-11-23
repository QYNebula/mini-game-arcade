# 指尖游戏厅

手机和平板可用的静态网页大厅，提供统一的游戏入口和浏览器本地存档。游戏上线后会出现在游戏库中。

## 预览

用浏览器打开 `index.html` 可以浏览大厅。测试多个游戏页面之间的存档读写时，从仓库目录启动静态服务器。

```sh
python3 -m http.server 8080
```

打开 `http://localhost:8080`。存档以浏览器和站点为单位，同一次测试保持访问地址一致。

## 加入新游戏

1. 在 `js/catalog.js` 增加一条记录，给游戏指定固定的 `id`、名称、分类和玩法说明。把封面放到 `assets/<id>.webp`。
2. 把游戏页面放到 `games/<id>/index.html`，并在目录记录里填 `entry: "games/<id>/index.html"`。大厅会将卡片标记为可玩，并显示对应的游戏操作。
3. 游戏页加载 `../../js/save-store.js`。`mode=new` 从头开始，`mode=resume` 或省略 `mode` 时从 `arcadeSaves.read(id)` 读取的 `state` 继续。新游戏第一次保存成功后，用 `history.replaceState` 移除 `mode=new`，让刷新恢复最近的存档。
4. 在通关或关内检查点调用 `arcadeSaves.write(id, { version, summary, state })`。`summary` 是显示给玩家的进度，例如「第 3 关」。`state` 是该游戏需要保存的 JSON 数据。写入成功返回 `true`，浏览器拒绝时返回 `false`，游戏可据此提示玩家。

每款游戏有独立的存档。确认重开后，旧存档保留到这款游戏首次成功保存新进度。游戏更新时可用 `version` 识别并迁移旧进度。

## 五子棋联机

大厅与单人对弈由静态网页提供。联机房间运行在 Cloudflare Workers 和 SQLite Durable Objects 上，房间规则与本地对弈共享。

从仓库根目录启动网页和本地房间服务。用两个浏览器窗口或独立浏览器会话测试房间码和重连。

```sh
python3 -m http.server 8080
```

```sh
cd workers/rooms
npm ci
npm run dev -- --var ROOM_ORIGINS:http://localhost:8080,http://127.0.0.1:8080
```

首次发布在目标 Cloudflare 账号授权后，于 `workers/rooms` 运行 `npm run deploy`。将 Worker 的公开地址填入 `games/gomoku/online-config.js`。如变更前端托管地址，同步修改 `wrangler.jsonc` 中的 `ROOM_ORIGINS`。
