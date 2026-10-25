# 銘傳大學桃園校區智慧導航系統

這是一個結合 **校園平面圖、全景環景、最短路徑、校外 Google 地圖導航** 的校園導航專案。  
目前前端已改為 **Vite + ES Module** 架構，並提供：

- 首頁身分分流（訪客／學生、管理員）
- 校內地圖導覽與環景切換
- 目的地搜尋與最短路徑
- 路徑中途停靠（可設停留秒數或按鈕繼續）
- 分享連結含 `via`／`viaStay`／`go=1` 可自動開始導航
- 訪客頁背景預載路徑環景（銜接導航頁）
- 自動播放路徑、HUD、小地圖
- 管理員登入後可編輯節點、連線與導航設定

## 入口頁面

| 頁面 | 用途 |
|------|------|
| `index.html` | 首頁，選擇「訪客／學生」或「管理員」 |
| `visitor.html` | 訪客導航：選起點、搜尋目的地後開始導航 |
| `navigation.html` | 校園導覽主畫面 |
| `admin/login.html` | 管理員登入 |
| `admin/index.html` | 管理後台入口 |
| `admin/links.html` | 連結／QR（訪客入口、路徑分享、據點環景） |
| `settings.html` | 設定頁（需登入；分頁：環景外觀、播放與距離、校園大樓、訪客起點、資料檢查） |

## 目前功能

### 一般導覽

- 訪客頁可選預設起點（校門口、S 棟、P 棟），或按「其他」搜尋節點當起點，並從建議清單點選目的地（含棟別／樓層）
- 訪客頁可選「地圖上定位」，在校園平面圖點選附近位置對到最近節點
- 校內可用 GPS 大致定位到校園平面圖最近節點（各樓層不適用；錨點可在 maps 設定調整）
- 校園總圖可切換「自製平面圖／衛星圖」
- 訪客模式會精簡側欄，路徑就緒後提示按「自動播放路徑」
- 校園地圖與各棟樓層切換
- 點擊節點開啟環景
- 目的地搜尋
- 最短路徑計算
- 路徑節點可點擊跳轉
- 自動播放路徑
- 播放中可用 `+` / `-`、`↑` / `↓` 即時調速
- 播放中可按空白鍵暫停／繼續
- 小地圖顯示目前位置與路徑
- 路徑分享連結（含中途停靠）可複製

### 路徑分享 URL 參數（範例）

| 參數 | 說明 |
|------|------|
| `from` | 起點（可用英文代碼如 `gate`，或節點名如 `1020`） |
| `to` | 目的地 |
| `via` | 中途停靠，逗號分隔（如 `S202-1,圖書館`） |
| `viaStay` | 各停靠停留秒數，逗號分隔（如 `5,0`；`0` 表示按鈕繼續） |
| `go=1` | 開啟後自動開始導航 |
| `mode=visitor` | 訪客模式（精簡側欄） |
| `pano=1` | 據點環景：開啟後直接進指定節點環景，並設為路徑起點 |
| `scope` | 搭配 `pano=1`：樓層檔名（如 `s_1`） |
| `node` | 搭配 `pano=1`：節點 id |
| `yaw` / `pitch` | 選填：開啟環景時的初始面向（由導覽頁「儲存據點面向」寫入） |

據點範例：`navigation.html?mode=visitor&pano=1&scope=s_1&node=1781157012296&yaw=120`

管理後台「連結／QR」可產生訪客入口、路徑分享、已存據點環景的連結與 QR（網址用當下瀏覽器網域）。據點請在管理員導覽環景中按「儲存據點面向」新增。

### 校外導航

- 訪客入口已不再提供「目前位置」起點；請改選校內起點，或用「地圖上定位／GPS 大致定位」
- 舊書籤若仍帶「目前位置」會提示改選起點（校外 Google 地圖導航流程已關閉）
- **進入校內起點**（舊 outdoor 接續用）可在設定頁調整

### 管理功能

- 管理員登入保護
- 編輯模式新增／移動節點
- 設定節點之間的連線方向與距離
- 設定上下樓箭頭類型
- 新增目的地標記（平面圖綠色標記，綁定路徑節點環景；朝向可選）
- 調整地面箭頭、HUD、小地圖、自動播放停留時間
- 設定訪客起點按鈕（可個別開關顯示）、校園大樓熱點、起點 URL 英文代碼、**校外進入校內起點**

## 專案結構

### 前端

- `index.html`：首頁
- `visitor.html`：訪客導航入口
- `navigation.html`：導覽主頁
- `settings.html`：導航設定頁
- `admin/`：管理登入與後台頁面
- `style.css`：共用樣式
- `src/pages/`：各頁的 module entry
- `src/navigation/`：主導航邏輯與共用狀態
- `src/lib/`：Pannellum、Google Maps、導航設定等共用模組

### 資料

- `data/buildings.json`：大樓定義（名稱、樓層、平面圖路徑）
- `data/nav-settings.json`：導航 UI 設定；`campusBuildings` 僅存校園地圖熱點（位置、開關、按鈕名稱）
- `data/nodes/*.json`：節點、連線、目的地資料
- `images/`：全景圖與平面圖（不納入 Git，需另外取得）
- `config/maps.local.json`：Google Maps 本機設定（不提交）
- `config/admin.local.json`：管理員密碼 hash（不提交；可用明文過渡）

### 本機 API / 開發腳本

- `scripts/dev-server.cjs`：API、管理登入、節點寫入；亦可 `MCU_SERVE_DIST=1` 提供 `dist/`
- `scripts/dev-stack.cjs`：同時啟動 API 與 Vite
- `scripts/hash-admin-password.cjs`：產生 `passwordHash` 供 `admin.local.json`
- `scripts/validate-nodes.cjs`：檢查節點 JSON（懸空連線等）
- `scripts/validate-buildings.cjs`：檢查大樓定義、熱點與節點檔是否一致
- `scripts/setup-env.ps1`：一鍵建置環境的實際步驟
- `setup-env.bat`：Windows 一鍵建置環境（呼叫上面的腳本）
- `start-server.bat`：Windows 一鍵啟動腳本
- `vite.config.js`：Vite 設定與 `/api` proxy

## 啟動方式

### 第一次從 GitHub 拉下來（Windows）

直接雙擊：

```text
setup-env.bat
```

它會：

1. 若本機還沒有 Node.js，先用 `winget` 安裝 LTS；失敗則改下載官方安裝檔（過程中可能跳出權限視窗）
2. 執行 `npm install`
3. 若缺少本機設定，複製：
   - `config/admin.example.json` → `config/admin.local.json`
   - `config/maps.example.json` → `config/maps.local.json`

### 最簡單方式（Windows）

環境建置完成後，直接雙擊：

```text
start-server.bat
```

預設會開 **區網（--host）**，終端機會印出例如 `http://192.168.x.x:5173/`，手機同一 Wi‑Fi 可開該網址。本機仍可用 `http://localhost:5173/`。

**安全提醒**：區網模式下，同一 Wi‑Fi 的裝置可讀取 `/api/maps-config`（含 Google Maps 金鑰）。展場或公開展示若不需手機測試，請改用下方 `--localhost` 模式。

若只要本機、不要對外：

```text
start-server.bat --localhost
```

防火牆若擋連線請允許 Node。若 Google Maps 有金鑰 HTTP referrer 限制，區網測試需另加區網 IP／網址。

它會同時啟動：

1. Node API：`http://localhost:8080`
2. Vite 前端：`http://localhost:5173`

開啟後請用瀏覽器進入：

- 首頁：`http://localhost:5173/`
- 管理登入：`http://localhost:5173/admin/login.html`

### 手動啟動方式

先安裝依賴：

```bash
npm install
```

啟動 API：

```bash
node scripts/dev-server.cjs
```

另開一個終端機，啟動前端：

```bash
npm run dev
```

若要打包：

```bash
npm run build
```

## 初次設定

### 1. Google Maps API

複製：

```text
config/maps.example.json
→ config/maps.local.json
```

填入你的 Google Maps API 金鑰。`maps.example.json` 已含校園 GPS／衛星示意的錨點範例；若使用同一套平面圖與 `campus-satellite-ref.png`，通常不必重設錨點。

必要設定：

- 啟用 `Maps JavaScript API`
- 啟用 `Directions API`
- 啟用 Billing
- 金鑰 HTTP referrer 限制建議分開設定：
  - 本機：`http://localhost:5173/*`、`http://127.0.0.1:5173/*`
  - 區網測試：`http://192.168.x.x:5173/*`（依你電腦 IP）
  - 正式網域：`https://你的網域/*`（Cloudflare 橘色雲時用此網域）
- Maps JavaScript API 金鑰無法完全隱藏於瀏覽器，請依賴 referrer 限制與 API 配額監控

Google Maps 金鑰僅在仍需校外地圖相關功能時使用；僅瀏覽自製平面圖／衛星示意可不填（衛星示意圖檔仍須自行放置）。

### 2. 圖檔（images）

`images/` **不會**進 GitHub。請向維護者索取完整圖庫，至少需：

| 路徑 | 用途 |
|------|------|
| `images/campus/campus-map.jpg` | 自製校園平面圖 |
| `images/campus/campus-satellite-ref.png` | 衛星示意圖（選用） |
| `images/S/`、`images/P/`… | 各棟樓層平面圖與全景 |

詳見 `images/README.md`。

### 3. 管理員密碼

複製：

```text
config/admin.example.json
→ config/admin.local.json
```

建議用 hash（不要再用明文 `changeme`；伺服器**不會**讀 example 檔當真密碼）：

```bash
node scripts/hash-admin-password.cjs "你的強密碼"
```

把輸出的 JSON 寫進 `config/admin.local.json`。也可設環境變數 `ADMIN_PASSWORD`（明文，方便 VPS）。

未設定密碼時管理登入會回 503。舊版若仍有明文 `"password"` 欄位可暫時登入，啟動時會警告請改 hash。

管理頁登入後，才可以：

- 編輯節點（寫入需 CSRF cookie，前端會自動帶）
- 寫入 `data/nodes/*.json`、`data/buildings.json`、`data/nav-settings.json`
- 開啟 `settings.html`（Vite 5173 仍可能開到頁面 UI，但寫入 API 必須已登入）

Session：絕對約 12 小時；**閒置 60 分鐘**無管理操作會失效。重開 API 行程會清掉所有登入。

## VPS + Cloudflare（對外測試）

本機 `start-server.bat` 是 Vite（5173）+ API（8080）；**VPS 不要長開 Vite dev**。

### 建議架構

1. Cloudflare：網域 DNS A 記錄指 VPS，**橘色雲 Proxied**；SSL 模式用 **Full** 或 **Full (strict)**（避免 Flexible）
2. VPS：`npm ci && npm run build`，用 Node 同一埠提供 `dist/` + `/api`
3. （建議）nginx／Caddy：`443 → 127.0.0.1:8080`，防火牆只開 80／443

### 伺服器啟動範例

```bash
export ADMIN_PASSWORD='你的強密碼'   # 或放 config/admin.local.json 的 passwordHash
export PORT=8080
export MCU_DEV_HOST=0.0.0.0
export MCU_SERVE_DIST=1
export ADMIN_COOKIE_SECURE=1         # HTTPS／Cloudflare 後建議開啟
node scripts/dev-server.cjs --host
```

上機另需：`config/maps.local.json`、完整 `images/`（不進 Git，請另行上傳）。

### Google Maps referrer

金鑰限制請加上正式網域，例如：`https://你的網域/*`（可保留本機 `http://localhost:5173/*`）。

### 注意

- `/api/maps-config` 會把金鑰給瀏覽器；靠 referrer 限制與配額，無法完全隱藏
- 登入限流目前依直連 IP；若 Node 只聽 localhost 且經反代，之後可再加「信任代理」讀 `CF-Connecting-IP`（須驗證來源為 Cloudflare）

## 節點資料

節點資料都放在：

```text
data/nodes/*.json
```

例如：

| 畫面 | 檔案 |
|------|------|
| 校園地圖 | `data/nodes/campus.json` |
| S 棟 1F | `data/nodes/s_1.json` |
| S 棟 2F | `data/nodes/s_2.json` |
| P 棟 1F | `data/nodes/p_1.json` |

格式為 JSON 陣列。  
當管理員在編輯模式修改節點時，會透過本機 API 自動寫回這些檔案。

## 校園大樓（合作者協作）

> **合作者請先讀：** [`docs/合作者上手.md`](docs/合作者上手.md)（約 10 分鐘）  
> 補節點、跨棟連線、新增大樓都寫在那裡；**不必改程式**。程式問題再找維護者。

大樓結構與校園熱點分開存放，全部大樓地位相同（S、P、Q 等皆同一套 UI）：

| 檔案 | 內容 |
|------|------|
| `data/buildings.json` | 大樓 `id`、顯示名稱、`floors`（樓層 id、標籤、平面圖路徑） |
| `data/nav-settings.json` → `campusBuildings` | 僅熱點：`enabled`、`xPercent`、`yPercent`、`label`（空字串則沿用 buildings 名稱） |

| 操作 | 做法 | 寫入 |
|------|------|------|
| 新增大樓 | 導覽頁編輯模式 →「＋ 新增大樓」→ 填表 → 點地圖 | `buildings.json` + `campusBuildings` |
| 移動熱點 | 編輯模式拖曳藍色按鈕 | `campusBuildings` |
| 刪除大樓 | 右鍵地圖按鈕或設定頁 | 兩邊都刪；可再選是否一併刪 `data/nodes/` |
| 關閉入口 | 設定頁關閉熱點 | `campusBuildings.enabled` |
| 編輯名稱／樓層 | 設定頁大樓卡片 | `buildings.json` |
| 新增節點 | 進入大樓 → 編輯模式 | `data/nodes/{buildingId}_{floorId}.json` |

多樓層大樓可先手改 `buildings.json` 的 `floors` 陣列；完成後 commit 資料檔即可與合作者分享。

驗證節點資料（懸空連線等）。管理員也可在設定頁按「檢查大樓與節點資料」：

```bash
node scripts/validate-nodes.cjs
node scripts/validate-nodes.cjs --reverse   # 另列出缺回頭路
npm run validate:buildings                  # 大樓／熱點／節點檔一致性
node scripts/validate-buildings.cjs --strict  # 警告也視為失敗
```

## 圖檔說明

`images/` 不會上傳到 GitHub，請另外向專案維護者取得完整資料夾（含自製平面圖、全景，以及選用的 `campus/campus-satellite-ref.png`）。  
詳細結構請看：

- `images/README.md`

## 注意事項

- `config/maps.local.json`、`config/admin.local.json` 不要提交
- 衛星示意為測試用途：節點座標與自製圖相同，未對齊衛星建築
- 專案檢查報告等本機文件已加入 `.gitignore`
- 若只開 Vite、不開 API，首頁仍能顯示，但管理登入、節點寫入等功能不會完整
- 若直接用 Python 靜態伺服器開頁面，也無法使用管理登入與 JSON 寫入
- AA／EE 棟等大樓可在設定頁開關；關閉時校園地圖仍顯示熱點但變灰、不可進入
- 修改 `style.css` 後若樣式未更新，請 Ctrl+F5 強制重新整理
- `backend/` 與 `PHASE2_API.md` 為實驗性 MySQL 後端，**目前前端未使用**
