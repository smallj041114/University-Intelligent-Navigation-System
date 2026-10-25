# Phase 2: nodes + panoramas API skeleton

## 1) 建立資料庫

在 MySQL 執行：

```sql
SOURCE database/schema.sql;
```

或直接貼上 `database/schema.sql` 內容執行。

## 2) 啟動後端

```bash
cd backend
npm install
copy .env.example .env
```

修改 `.env` 的 DB 連線資訊後：

```bash
npm run dev
```

## 3) API 雛形

- `GET /health`：檢查 DB 連線
- `GET /api/nodes`：取得節點（可用 query: `node_type`, `building_code`, `floor_label`）
- `GET /api/nodes/:id/panoramas`：取得節點環景列表
- `GET /api/edges?from_node_id=1`：取得某節點鄰接邊
- `GET /api/routes/simple?from=gate_main&to=s_building_entrance`：簡單直連路線查詢

## 4) 前端下一步接法

- 進校園時，前端先呼叫 `/api/routes/simple` 取得 path
- 每到一個 node，呼叫 `/api/nodes/:id/panoramas` 顯示 360 圖
- 室內版再擴充 `nodes.floor_label` + `edges.move_type`
