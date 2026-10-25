# 專案改版筆記

> 給開發者與 AI 參考用。本專案每次修改程式後，在此新增一筆（含日期時間），不必寫太細。
>
> 人臉／車牌打碼工具改版紀錄見獨立 repo：`../campus-privacy-blur/CHANGELOG.md`
>
> **不要**把網域、伺服器 IP、密碼、Cloudflare／VPS 操作進度寫進本檔；那些只寫本機 `跨對話進度同步.md`。

---

## 2026-10-14 00:22：校園圖快取參數改跟版號

### 改動摘要
- 校園圖 `?v=` 改綁 `APP_VERSION`／`package.json`，換圖時升版即可破 CF 快取；HTML 用 `__APP_VERSION__`（勿用 `%…%`，Vite 會 URI 解碼失敗）

### 主要檔案
- `src/navigation/state.js`
- `navigation.html`
- `vite.config.js`

## 2026-10-14 00:12：校園圖 Cloudflare 快取破壞

### 改動摘要
- 正式站 `/images` 被 CF 快取舊 `campus-map.jpg`；路徑加 `?v=20261014` 強制拉新圖

### 主要檔案
- `src/navigation/state.js`

## 2026-10-12 20:10：訪客公告補上 M 棟教室完成

### 改動摘要
- 歡迎公告新增「設計大樓(M)教室／地點已設定完成」；公告 version 升至 4

### 主要檔案
- `data/nav-settings.json`

## 2026-10-12 20:11：訪客公告補 M 棟教室與中庭

### 改動摘要
- 歡迎公告加上設計大樓(M)教室／地點與 EE／P 中庭完成；公告 version 升至 5

### 主要檔案
- `data/nav-settings.json`

## 2026-10-12 20:04：v0.2.0 訪客更新公告上線（CPE 規則暫停）

### 改動摘要
- 版號 `0.2.0`；預設歡迎公告改為本輪更新說明；CPE 網址規則改 `enabled: false`（保留不刪）

### 主要檔案
- `package.json`、`package-lock.json`、`src/lib/app-version.js`、`data/nav-settings.json`

## 2026-10-12 19:45：近 30 日訪客改為每頁五行

### 改動摘要
- 監控頁「近 30 日每日訪客數」一次只顯示 5 列，可用上一頁／下一頁切換

### 主要檔案
- `src/pages/admin-audit.js`、`admin/audit.html`、`style.css`

## 2026-10-12 19:02：維護頁預估時間加上日期

### 改動摘要
- 預設 ETA 改為「2026年10月12日 20:00（台灣時間）」；仍可用 `MCU_MAINTENANCE_ETA` 覆寫

### 主要檔案
- `scripts/dev-server.cjs`

## 2026-10-12 18:58：部署用維護中頁面開關

### 改動摘要
- 新增 `maintenance.html`；伺服器設 `MCU_MAINTENANCE=1` 時全站回維護頁（預設文案預計含日期時間，可用 `MCU_MAINTENANCE_ETA` 覆寫）

### 主要檔案
- `maintenance.html`、`scripts/dev-server.cjs`、`vite.config.js`

## 2026-10-12 18:53：大樓與校園入口改中文顯示名

### 改動摘要
- 各棟顯示名稱改為中文＋代號（如資訊大樓(S)）；校園圖入口目的地同步改中文，方便訪客搜尋

### 主要檔案
- `data/buildings.json`、`data/nodes/campus.json`、`data/nav-settings.json`

## 2026-10-12 18:12：頂欄拿掉跨棟「前往 XX 棟」

### 改動摘要
- 大樓頂欄只留「回校園」；P↔EE 等跨棟改走平面圖出口按鈕，避免重複

### 主要檔案
- `src/navigation/app.js`

## 2026-10-12 17:58：平面圖出口按鈕點擊無效

### 改動摘要
- 捏合縮放未排除 `.map-portal-btn`，pointer capture 吃掉真實點擊；已加入排除清單

### 主要檔案
- `src/lib/map-pinch-zoom.js`、`src/navigation/app.js`

## 2026-10-12 17:42：go=1 延後刪除＋平面圖出口快捷

### 改動摘要
- `go=1` 改為首次成功自動播放後才從網址移除，就緒未播時重整仍可再開播
- 大樓平面圖依跨棟／回校園連線顯示「往校園／往P棟…」出口按鈕；編輯模式可拖動，座標存 `floorPlanPortals`

### 主要檔案
- `src/navigation/app.js`、`navigation.html`、`style.css`、`src/navigation/state.js`
- `src/lib/nav-arrow-settings.js`

## 2026-10-12 03:50：舊「目前位置」書籤錯誤訊息不被覆寫

### 改動摘要
- 訪客網址帶入路徑失敗時，若已有明確錯誤（如「目前位置已移除」）不再改寫成通用「找不到可用路徑」

### 主要檔案
- `src/navigation/app.js`

## 2026-10-12 03:43：徹底拿掉「目前位置」起點

### 改動摘要
- 訪客頁、設定預設起點、導覽側欄按鈕與計算路徑校外分支一併移除；舊書籤若仍帶「目前位置」僅提示改選
- 校內「地圖定位／GPS 大致定位」保留

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/visitor.js`、`src/pages/settings.js`
- `src/navigation/app.js`、`navigation.html`、`README.md`

## 2026-10-12 03:21：訪客體驗 Phase1＋監控 session／每日人數

### 改動摘要
- 自動播放側欄文案、訪客頁電梯選項（`floor`）、關閉 compass、校外目前位置停用／校內定位偏離顯示無法查詢
- 訪客 sessionId 辨識、presence 限流 prune、access.log 輪替、後台近 30 日每日訪客（audit）

### 主要檔案
- `src/navigation/app.js`、`visitor.html`、`src/pages/visitor.js`、`src/lib/panorama.js`、`src/lib/visitor-starts.js`
- `src/lib/visitor-presence.js`、`scripts/visitor-presence-store.cjs`、`scripts/dev-server.cjs`、`scripts/access-log.cjs`
- `admin/audit.html`、`src/pages/admin-audit.js`

## 2026-10-12 03:03：待辦排程調整與每日訪客數

### 改動摘要
- 刪除清單 32（長路線速度）；排程改為 30→29→28→19→18→23→24→34
- 新增 34：後台一個月內每日訪客數量

### 主要檔案
- `本地待修改清單.md`（本機）、`PANORAMA-改版筆記.md`、體驗報告對照表

## 2026-10-12 02:27：待辦：訪客導覽體驗（校門口→S302）

### 改動摘要
- 體驗報告改本機獨立檔（gitignore）；可改點列入本機待修改清單；「之後可考慮」同步摘要

### 主要檔案
- `.gitignore`、`體驗報告*.md`（本機）、`本地待修改清單.md`（本機）

## 2026-10-06 16:24：待辦：訪客頁可選是否搭電梯

### 改動摘要
- 「之後可考慮」與本機待修改清單列入：訪客頁加入走樓梯／樓梯+電梯選項並帶入導覽

### 主要檔案
- `PANORAMA-改版筆記.md`、`本地待修改清單.md`（gitignore）

## 2026-10-04 18:10：上線前待改清單與部署

### 改動摘要
- 「之後可考慮」補上訪客監控／公告關鍵字／HUD 觸控／log 維護等項；細節在本機 `本地待修改清單.md`（23–27）

### 主要檔案
- `PANORAMA-改版筆記.md`、`本地待修改清單.md`（gitignore）

## 2026-10-04 18:08：上線前修復公告／結束回饋

### 改動摘要
- 公告關閉後才自動播放；最後一站補觸發結束回饋；結束回饋避免重複綁定關閉事件
- 啟用預設歡迎／結束回饋與 CPE 網址規則（`nav-settings`）

### 主要檔案
- `src/navigation/app.js`、`data/nav-settings.json`

## 2026-10-04 17:55：修復結束回饋未彈出

### 改動摘要
- 自動播放抵達最後一站時改為同樣呼叫結束回饋與自由瀏覽（先前只停播，漏觸發）

### 主要檔案
- `src/navigation/app.js`

## 2026-10-04 17:32：公告關閉後才自動播放

### 改動摘要
- 網址／定位觸發的路徑自動播放，改為等首次公告倒數結束或使用者關閉後再開始

### 主要檔案
- `src/navigation/app.js`

## 2026-10-04 17:07：播放速度面板可拖移縮放與重設

### 改動摘要
- 自動播放 HUD 訪客可拖移、拉角縮放，版面存本機；有覆寫時顯示「重設」回後台預設
- 小螢幕隱藏鍵盤提示列，減少佔位

### 主要檔案
- `src/lib/nav-arrow-settings.js`、`src/navigation/app.js`、`navigation.html`、`style.css`

## 2026-10-04 16:52：自動播放略過周圍預載

### 改動摘要
- 自動播放進行中只預載路徑前方站點，不預載周圍連線；暫停或結束後對目前站補周圍預載，供自由導覽

### 主要檔案
- `src/navigation/app.js`

## 2026-10-04 16:02：訪客監控與修改紀錄強化

### 改動摘要
- 後台「監控／修改紀錄」顯示線上訪客（心跳＋TTL）與今日進站；稽核支援帳號／角色／關鍵字／結果篩選與自動刷新
- 訪客頁／導覽頁每 30 秒 heartbeat；伺服器記憶體統計，不寫入 audit

### 主要檔案
- `scripts/visitor-presence-store.cjs`、`scripts/dev-server.cjs`、`scripts/audit-log.cjs`
- `src/lib/visitor-presence.js`、`admin/audit.html`、`src/pages/admin-audit.js`、`admin/index.html`、`style.css`

## 2026-10-04 15:46：後台頁尾導覽精簡

### 改動摘要
- 各管理頁底部改為精簡文字連結（導覽／同層頁／登出／管理後台），去掉重複的「返回首頁／導覽前台」與整排同款大按鈕

### 主要檔案
- `admin/links.html`、`admin/notices.html`、`admin/index.html`、`admin/audit.html`、`admin/login.html`
- `src/pages/admin-links.js`、`src/pages/admin-notices.js`、`style.css`

## 2026-10-04 15:29：公告後台合併為單頁

### 改動摘要
- 「導航公告／網址公告」合併為 `admin/notices.html`；完整管理員看預設＋規則，二級只看規則；舊 `url-notices.html` 自動導向

### 主要檔案
- `admin/notices.html`、`src/pages/admin-notices.js`、`admin/url-notices.html`、`admin/index.html`、`admin/links.html`
- `scripts/dev-server.cjs`、`src/pages/admin-login.js`、`admin-links.js`、`admin-audit.js`、`settings.js`、`src/navigation/app.js`
- 刪除 `src/pages/admin-url-notices.js`

## 2026-10-04 15:15：導航公告／網址公告職責拆清

### 改動摘要
- 「導航公告」專責預設（首次＋結束）；「網址公告」只留依網址規則，完整管理員也不再看到重複的預設表單

### 主要檔案
- `admin/notices.html`、`src/pages/admin-notices.js`
- `admin/url-notices.html`、`src/pages/admin-url-notices.js`、`admin/index.html`

## 2026-10-04 15:06：二級公告僅能改依網址規則

### 改動摘要
- `qr_notice` 在網址公告頁隱藏「預設」區塊；儲存只送 rules；伺服器合併時強制保留既有預設文案

### 主要檔案
- `admin/url-notices.html`、`src/pages/admin-url-notices.js`、`scripts/dev-server.cjs`

## 2026-10-03 21:53：二級角色拆分（QR／據點 vs QR／公告）

### 改動摘要
- 新增 `qr_notice`：可進連結／QR 與網址公告，可寫 `welcomeNotice`／`endFeedback`；不可存據點面向
- 原 `qr` 維持連結／QR＋據點；不再能改公告（伺服器依角色合併欄位）
- 本機新增帳號 `notice`（role=`qr_notice`）

### 主要檔案
- `scripts/dev-server.cjs`、`config/admin.example.json`、`scripts/hash-admin-password.cjs`
- `src/pages/admin-login.js`、`admin-links.js`、`admin-url-notices.js`、`admin-notices.js`、`admin-audit.js`、`settings.js`
- `src/navigation/app.js`、`admin/links.html`

## 2026-10-03 21:25：依網址首次／結束公告（二級可編）

### 改動摘要
- 首次進入與路徑抵達終點可依 path＋query 關鍵字顯示不同訊息；結束訊息可附表單連結（新分頁）。新功能預設關閉，舊 welcome 資料相容。
- 二級管理員可維護 welcome／endFeedback 規則（伺服器合併寫入，不覆寫其他導航設定）；新後台頁「網址公告」。

### 主要檔案
- `src/lib/nav-arrow-settings.js`：rules／endFeedback、pick、seen
- `src/navigation/app.js`、`navigation.html`：首次 pick、終點彈窗
- `admin/url-notices.html`、`src/pages/admin-url-notices.js`、`admin/notices.html`、`admin/index.html`、`admin/links.html`
- `scripts/dev-server.cjs`：二級合併欄位與靜態頁權限
- `style.css`

### 部署前建議
- 備份 `data/nav-settings.json` → 拉碼重啟 → 確認預設首次公告行為不變、無結束規則時播完路徑不彈窗

## 2026-10-01 01:35：後台「修改紀錄」稽核

### 改動摘要
- 會影響伺服器的操作寫入 `logs/audit.jsonl`；完整管理員可在後台查看最近紀錄（二級不可）

### 主要檔案
- `scripts/audit-log.cjs`、`scripts/dev-server.cjs`、`admin/audit.html`、`src/pages/admin-audit.js`、`admin/index.html`、`vite.config.js`、`.gitignore`

## 2026-10-01 01:15：二級管理員 links 頁補登出／導覽入口

### 改動摘要
- 連結／QR 頁新增「開啟導覽／環景」「登出」；二級隱藏會造成迴圈的「返回管理後台」；頁尾操作鈕樣式與後台登出一致

### 主要檔案
- `admin/links.html`、`src/pages/admin-links.js`、`style.css`、`src/navigation/app.js`

## 2026-10-01 01:05：二級管理員寫入消毒與 session 強化

### 改動摘要
- 二級／完整寫入據點時伺服器正規化 `panoSpotPresets`（上限、欄位消毒）；無 role 的舊 session 一律失效

### 主要檔案
- `scripts/dev-server.cjs`

## 2026-10-01 00:53：二級管理員（QR＋據點面向）

### 改動摘要
- 管理登入改為帳號＋密碼；`admin` 完整權限、`qr` 僅連結／QR 與儲存據點面向（伺服器只合併 `panoSpotPresets`）
- 登入頁移除設定檔路徑提示；二級造訪設定／後台首頁會導回 links

### 主要檔案
- `scripts/dev-server.cjs`、`config/admin.example.json`、`admin/login.html`、`src/pages/admin-login.js`
- `src/navigation/app.js`、`navigation.html`、`src/pages/admin-home.js`／`admin-links.js`／`admin-notices.js`／`settings.js`

## 2026-09-30 23:00：跨對話進度同步（本機）

### 改動摘要
- 新增本機進度同步檔與 alwaysApply 規則，供多對話框同步對外部署進度（細節不上改版筆記）

### 主要檔案
- `跨對話進度同步.md`（gitignore）、`.cursor/rules/cross-chat-sync.mdc`、`.gitignore`

---

## 2026-09-29 23:18：待辦：評估環景右下指南針

### 改動摘要
- 「之後可考慮」與本機待修改清單列入：Pannellum 指南針用途說明與是否隱藏／改版

### 主要檔案
- `PANORAMA-改版筆記.md`、`本地待修改清單.md`（gitignore）

---

## 2026-09-29 23:06：路徑就緒後可「取消播放」

### 改動摘要
- 自動播放開始前顯示「取消播放」，可清掉就緒路徑並回到自由瀏覽；播放中仍用「停止導覽」

### 主要檔案
- `navigation.html`、`src/navigation/state.js`、`src/navigation/app.js`

---

## 2026-09-29 23:01：平面圖頂欄也不被右側選單蓋住

### 改動摘要
- 選單改自頂欄下方展開；平面圖 `.toolbar` 提高 z-index，避免標記／樓層等按鈕被擋

### 主要檔案
- `style.css`

---

## 2026-09-29 22:57：環景選單改從頂欄下方展開，避免擋按鈕

### 改動摘要
- 先前靠 padding 讓位，自由瀏覽時選單常已開啟、體感不明顯；改為環景時 panel 自頂欄下方開始，頂欄按鈕（含自由瀏覽）不再被蓋住

### 主要檔案
- `style.css`、`src/navigation/app.js`

---

## 2026-09-29 22:49：環景頂欄開選單時讓出右側空間

### 改動摘要
- 選單開啟時加上 `is-side-panel-open`；環景模式下頂欄增加右側 padding，避免操作按鈕被導覽選單蓋住

### 主要檔案
- `src/navigation/app.js`、`style.css`

---

## 2026-09-29 22:41：暫時關閉「目前位置」起點入口

### 改動摘要
- 以 `CURRENT_LOCATION_ENABLED = false` 隱藏訪客頁／側欄／設定預設起點的「目前位置」；舊連結若仍帶此起點會提示改選校內起點

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/visitor.js`、`src/pages/settings.js`、`src/navigation/app.js`、`visitor.html`、`settings.html`

---

## 2026-09-29 22:35：停止自動導覽後恢復訪客自由瀏覽選單

### 改動摘要
- 訪客按「停止導覽」或播完路徑後進入自由瀏覽：右側可再搜尋目的地、計算路徑、用目前位置／設環景為起點（`is-visitor-free`）

### 主要檔案
- `style.css`、`src/navigation/app.js`

---

## 2026-09-29 22:32：待辦：移除「目前位置」起點及相關流程

### 改動摘要
- 「之後可考慮的改版」與本機 `本地待修改清單.md` 列入：整段移除訪客「目前位置」起點及 outdoor／相關頁面（尚未實作）

### 主要檔案
- `PANORAMA-改版筆記.md`、`本地待修改清單.md`（gitignore）

---

## 2026-09-29 22:15：校外進校內起點改為校門口

### 改動摘要
- 「目前位置」校外抵達後，室內路徑改從校門口（0001）接續，不再預設 s1020

### 主要檔案
- `data/nav-settings.json`、`src/lib/visitor-starts.js`、`src/navigation/app.js`、`config/maps.example.json`、`config/maps.local.json`

---

## 2026-09-29 18:08：環景載入遮罩改不透明，避免白菱格閃爍

### 改動摘要
- 載入遮罩改為實心深藍、重建 viewer 時也顯示；等兩幀再關遮罩，並保留進度／速度文字，避免 Pannellum 預設灰白菱格透出

### 主要檔案
- `style.css`、`src/lib/panorama.js`

---

## 2026-09-29 17:14：正式打包補上連結／公告管理頁

### 改動摘要
- Vite build 補上 `admin/links.html`、`admin/notices.html`，避免 Hetzner／`MCU_SERVE_DIST` 只出 dist 時缺頁

### 主要檔案
- `vite.config.js`

---

## 2026-09-29 17:08：訪客起點可排序並指定預設

### 改動摘要
- 設定頁訪客起點可上移／下移調整訪客頁按鈕順序；新增「訪客頁預設起點」下拉（地圖定位／目前位置／自訂起點）

### 主要檔案
- `src/lib/visitor-starts.js`、`src/lib/nav-arrow-settings.js`、`settings.html`、`src/pages/settings.js`、`src/pages/visitor.js`、`style.css`、`data/nav-settings.json`

---

## 2026-09-29 17:01：校園圖入口目的地與 M 棟訪客起點

### 改動摘要
- 校園平面圖補上各棟／餐飲等入口目的地標記；訪客起點新增 M 棟，並微調 S 棟熱點位置

### 主要檔案
- `data/nodes/campus.json`、`data/nav-settings.json`

---

## 2026-09-28 22:38：訪客頁顯示系統版本號

### 改動摘要
- 訪客選單卡片右下角顯示系統版號（來自 `package.json` 的 `version`，例如 `v0.1.0`）

### 主要檔案
- `src/lib/app-version.js`、`vite.config.js`、`visitor.html`、`src/pages/visitor.js`、`style.css`

---

## 2026-09-28 22:33：公告還原版本顯示並可強制每次跳出

### 改動摘要
- 公告管理頁再顯示目前版本；新增「強制每次進入都跳出」選項（忽略已看過）

### 主要檔案
- `admin/notices.html`、`src/pages/admin-notices.js`、`src/lib/nav-arrow-settings.js`、`src/navigation/app.js`

---

## 2026-09-28 22:23：公告預覽標題、據點面向 QR 改存清單

### 改動摘要
- 公告預覽彈窗標題改深色字（修正深色後台頁繼承淺色導致看不見）；拿掉「目前版本」顯示
- 「各據點環景」改為選擇已存據點（含朝向）；管理員在導覽環景按「儲存據點面向」新增，管理頁可刪除

### 主要檔案
- `admin/notices.html`、`src/pages/admin-notices.js`、`style.css`
- `admin/links.html`、`src/pages/admin-links.js`、`src/lib/share-links.js`、`src/lib/nav-arrow-settings.js`
- `navigation.html`、`src/navigation/app.js`、`src/navigation/state.js`、`README.md`

---

## 2026-09-28 22:02：環景載入速度顯示與預載策略

### 改動摘要
- 環景遮罩顯示下載進度／傳輸速度（無進度則顯示已耗時）
- 自由環景預載全部周圍連線，前方熱點優先；自動播放維持路徑前方預載（不做 tile）

### 主要檔案
- `src/lib/panorama.js`、`src/navigation/app.js`、`style.css`

---

## 2026-09-28 22:01：導航首次公告彈窗

### 改動摘要
- 管理後台新增「導航公告」頁；首次進入導航頁可顯示浮層（點擊或倒數關閉；改文案升版後再顯示）

### 主要檔案
- `admin/notices.html`、`src/pages/admin-notices.js`、`admin/index.html`、`src/lib/nav-arrow-settings.js`、`navigation.html`、`src/navigation/app.js`、`style.css`

---

## 2026-09-28 21:48：訪客搜尋預設隱藏路徑節點

### 改動摘要
- 設定新增開關（預設開啟）：訪客頁起點／目的地搜尋只出現目的地與常用起點，不含純走廊節點名

### 主要檔案
- `src/lib/nav-arrow-settings.js`、`src/lib/visitor-starts.js`、`src/pages/visitor.js`、`src/pages/settings.js`、`settings.html`

---

## 2026-09-28 21:21：修正連結／QR 據點選單空白

### 改動摘要
- admin「各據點環景」改以站台根路徑 `/data/nodes/` 載入，避免在 `/admin/` 下相對路徑抓不到檔

### 主要檔案
- `src/pages/admin-links.js`

---

## 2026-09-24 20:06：樓梯+電梯改為優先搭電梯

### 改動摘要
- 「樓梯+電梯」模式拉高樓梯邊權重，路徑會優先走電梯虛擬邊（仍可在必要時走樓梯）

### 主要檔案
- `src/lib/elevator-routes.js`、`navigation.html`

---

## 2026-09-24 20:03：上下樓動畫可設定；樓層移動改兩選項

### 改動摘要
- 設定頁可調樓梯抬頭／低頭動畫秒數（預設 0.8）
- 路徑「樓層移動」改為「走樓梯」（預設）／「樓梯+電梯」兩種

### 主要檔案
- `src/lib/nav-arrow-settings.js`、`settings.html`、`src/pages/settings.js`、`src/lib/elevator-routes.js`、`navigation.html`、`src/navigation/app.js`

---

## 2026-09-24 19:55：側欄起點下可設目前環景為起點

### 改動摘要
- 導航選單「起點」下方新增「設目前環景為起點」，與環景 topbar 同一邏輯

### 主要檔案
- `navigation.html`、`src/navigation/app.js`、`style.css`

---

## 2026-09-24 19:32：據點 QR 深連結、連結／QR 後台、環景設起點

### 改動摘要
- 支援 `pano`／`scope`／`node` 深連結：開環景並設路徑起點；admin「連結／QR」可產訪客入口／路徑分享／據點 QR（用當下 origin）
- 環景 topbar「設為起點」（含訪客）；登入失敗 access log 文案改為「管理員登入失敗」

### 主要檔案
- `src/lib/share-links.js`、`src/lib/qr-code.js`、`admin/links.html`、`src/pages/admin-links.js`、`src/navigation/app.js`、`scripts/access-log.cjs`、`README.md`

---

## 2026-09-24 17:30：電梯進出先面向電梯再轉路徑

### 改動摘要
- 進電梯前先轉向本站電梯目的地，再顯示 overlay 切樓
- 出電梯先進場面向電梯口，再轉向下一路徑／道路方向（不依賴轉彎輔助開關）

### 主要檔案
- `src/navigation/app.js`

---

## 2026-09-24 17:23：電梯井名稱忽略樓層字樣

### 改動摘要
- 同棟電梯比對時去掉 `1F`／`2樓` 等樓層字，故「S棟1F電梯」「S棟2F電梯」會連成同一井，不必改成完全同名

### 主要檔案
- `src/lib/elevator-routes.js`、`src/navigation/app.js`

---

## 2026-09-24 16:59：電梯改為目的地自動跨樓連通

### 改動摘要
- 目的地勾選「電梯」後，同棟同名自動產生跨樓虛擬邊；拿掉連線上的手動電梯勾選與 `link.transport` 路徑依賴
- 路徑／自動播放經電梯仍顯示 overlay；進站優先面向同名電梯目的地；環景綠框與平面圖標示電梯徽章

### 主要檔案
- `src/lib/elevator-routes.js`、`src/navigation/app.js`、`src/lib/navigation-graph.js`、`src/lib/panorama.js`、`style.css`

---

## 2026-09-24 02:40：修正訪客換頁誤報離開與 ::1 IP

### 改動摘要
- 進入任一頁會取消該 IP 所有待寫的「離開」，避免導覽→訪客看起來像剛進就登出
- `::1` 正規成 `127.0.0.1`

### 主要檔案
- `scripts/access-log.cjs`、`vite.config.js`

---

## 2026-09-24 02:38：修正訪客進出 log 先離開再進入、重複離開

### 改動摘要
- 前端只綁 `pagehide` 且離開只送一次
- 後端對同頁 leave→enter（重整）延遲取消離開，避免洗版

### 主要檔案
- `src/lib/visitor-presence.js`、`scripts/access-log.cjs`、`scripts/dev-server.cjs`

---

## 2026-09-24 02:36：Vite 代理轉傳真實客戶端 IP

### 改動摘要
- `/api` proxy 加上 `X-Forwarded-For`／`X-Real-IP`，區網經 5173 連線時後端 log 不再一律是 127.0.0.1

### 主要檔案
- `vite.config.js`

---

## 2026-09-24 02:27：訪客進入／離開會寫入存取日誌

### 改動摘要
- 開啟／關閉訪客頁、導覽頁時通報後端，terminal／access.log 顯示「訪客進入／離開」
- 訪客無帳號登入；此為進出頁面訊號（Vite 開發時 HTML 不經 Node 也能記到）

### 主要檔案
- `src/lib/visitor-presence.js`、`src/pages/visitor.js`、`src/pages/navigation.js`、`scripts/dev-server.cjs`、`scripts/access-log.cjs`

---

## 2026-09-24 02:25：存取日誌略過公開讀取 API 雜訊

### 改動摘要
- 預設不再把 `GET /api/buildings` 等記成「其他請求」；僅 VERBOSE=1 才記讀取

### 主要檔案
- `scripts/access-log.cjs`

---

## 2026-09-24 02:21：後端存取日誌（管理員重要操作）

### 改動摘要
- terminal／`logs/access.log` 記錄 IP、管理員／訪客、繁中操作與狀態碼（登入、存節點、刪檔、存設定等）
- 環境變數：`MCU_ACCESS_LOG`、`MCU_ACCESS_LOG_VERBOSE`、`MCU_ACCESS_LOG_FILE`（預設寫入 `logs/access.log`；`=0` 關寫檔）

### 主要檔案
- `scripts/access-log.cjs`、`scripts/dev-server.cjs`、`logs/README.md`

---

## 2026-09-23 02:14：右邊算路後終點應自動面向目的地

### 改動摘要
- 手動點箭頭走到路徑終點也會帶入／解析終點目的地並轉向
- 目的地改穩定 id；算路終點可用名稱，或終點節點僅一個有朝向的目的地

### 主要檔案
- `src/navigation/app.js`

---

## 2026-09-23 01:34：修復抵達目的地不轉向

### 改動摘要
- 結束自動播放不再清掉終點轉向 timer；轉向中鎖定視角避免切景重設進場角
- 等淡入結束再開始轉向；目的地 yaw 支援數字字串

### 主要檔案
- `src/navigation/app.js`、`src/lib/panorama.js`

---

## 2026-09-23 01:12：連線編輯列加電梯後改兩行排版

### 改動摘要
- 側邊連線編輯改為兩行（目標＋移除／上樓下樓電梯＋距離），避免勾選擠爆 320px 面板

### 主要檔案
- `style.css`

---

## 2026-09-23 00:59：手動電梯連線與進電梯樓層顯示

### 改動摘要
- 拿掉依節點名自動灌電梯井；改為連線勾選 `transport: elevator`（與上樓／下樓互斥）
- 自動播放或點電梯箭頭時顯示「xF → yF」overlay，約 1 秒後切景

### 主要檔案
- `src/lib/elevator-routes.js`、`src/lib/navigation-graph.js`、`src/navigation/app.js`、`src/lib/panorama.js`、`navigation.html`、`style.css`

---

## 2026-09-22 21:55：修正導航結束未轉向目的地

### 改動摘要
- 終點面向改用獨立 timer，避免自動播放結束清掉轉彎
- 最後一站面向完成後直接結束，不再 schedule 下一步
- `lookAt` 加 failsafe，並以實際 yaw 判斷是否轉向

### 主要檔案
- `src/lib/panorama.js`、`src/navigation/app.js`

---

## 2026-09-22 21:50：修正樓梯抬頭被切掉、進站往下頓

### 改動摘要
- `lookAt` 改為 yaw／pitch 都播完才 callback（已面向樓梯時不再秒切景）
- 進站不再先帶仰角再回水平，避免 1004→2035 只看到往下頓

### 主要檔案
- `src/lib/panorama.js`、`src/navigation/app.js`

---

## 2026-09-22 17:50：電梯路徑選擇與出電梯進環景

### 改動摘要
- 路徑面板新增「樓層移動」：自動／走樓梯／搭電梯
- 依電梯目的地表識灌入同井跨樓虛擬邊；自動播放搭電梯時提示後直接進對樓環景

### 主要檔案
- `src/lib/elevator-routes.js`、`src/lib/navigation-graph.js`、`src/navigation/app.js`、`navigation.html`

---

## 2026-09-22 17:25：平面圖捏合縮放（標記維持螢幕大小）

### 改動摘要
- 校園／樓層平面圖支援滾輪與雙指捏合縮放、放大後拖曳平移
- 紅點／綠標／大樓鈕以 `--map-zoom` 反縮放，點選大小不隨圖放大
- 換樓／回校園重設縮放；手勢後略過誤觸的新增點擊

### 主要檔案
- `src/lib/map-pinch-zoom.js`、`src/navigation/app.js`、`style.css`

---

## 2026-09-22 17:20：大樓內快捷切換（回校園／跨棟）

### 改動摘要
- 樓層工具列新增「回校園」與依目前樓層跨棟連線推導的「前往 XX 棟 nF」快捷鈕

### 主要檔案
- `navigation.html`、`style.css`、`src/navigation/app.js`

---

## 2026-09-22 17:18：上下樓梯時略抬頭／低頭

### 改動摘要
- 經 `floorChange` 連線離開時略抬頭（上樓）／低頭（下樓），進站後再回水平
- `lookAt` 支援 `allowPitch`；自動播放與手動點箭頭皆套用

### 主要檔案
- `src/lib/panorama.js`、`src/navigation/app.js`

---

## 2026-09-22 16:45：切景不壓暗、清死碼、進頁平面圖不閃縮放

### 改動摘要
- 拿掉 `is-switching` 模糊／變暗，切環景時維持當前畫面亮度，過渡交給 Pannellum fade
- 刪除未再使用的 `snapOrientation`／`withSceneFadeDuration`
- 訪客進自由導覽：資料載入前先同步平面圖尺寸，`map-stage` 未算好前不顯示，避免校園圖縮放閃一下

### 主要檔案
- `src/lib/panorama.js`、`style.css`、`src/navigation/app.js`

---

## 2026-09-21 15:45：設定頁可調自動播放預設停留秒數

### 改動摘要
- 新增 `playDelayDefaultSec`（預設 1 秒），設定頁「播放」可調；導覽頁載入時套用為每站停留初始值

### 主要檔案
- `src/lib/nav-arrow-settings.js`、`src/pages/settings.js`、`settings.html`
- `src/navigation/app.js`、`navigation.html`、`data/nav-settings.json`

---

## 2026-09-21 15:35：手機綠標再縮小（Safari）

### 改動摘要
- ≤640px 綠標再縮字級／內距，並加 text-size-adjust 與 scale，改善 iPhone Safari 仍偏大

### 主要檔案
- `style.css`

---

## 2026-09-21 15:05：平面圖目的地開關與手機綠標縮小

### 改動摘要
- 工具列標記三態切換：都顯示 → 不顯示目的地 → 都不顯示（訪客可用、預設都顯示、不持久化；樓層／校園／衛星）
- 編輯按「＋ 目的地」時若非都顯示會自動切回都顯示
- 手機 ≤640px 縮小目的地名稱膠囊字級與內距

### 主要檔案
- `navigation.html`、`src/navigation/state.js`、`src/navigation/app.js`、`style.css`

---

## 2026-09-21 14:50：本機待修改清單不納入 Git

### 改動摘要
- `.gitignore` 忽略 `本地待修改清單.md`，供本機追蹤建議／bug，不上傳

### 主要檔案
- `.gitignore`

---

## 2026-09-18 16:40：導覽 UX 多項 bug 修復

### 改動摘要
- 換樓平面圖：載入中保留 stage 尺寸，避免先放大再縮小
- 訪客起點搜尋：納入節點上的教室／目的地名稱（如 S 棟教室）
- 「目前位置」未按我已抵達就離開再回來：不再自動開 Google 地圖；處理完後去掉網址 go=1
- 環景自動播放時「載入中」遮罩卡住：loadingGeneration 只讓最新 mount 控制
- 抵達終點目的地：先進場面向，再依轉彎輔助時間慢慢轉過去（不要瞬切）

### 主要檔案
- `src/navigation/app.js`、`src/pages/visitor.js`、`src/lib/panorama.js`

---

## 2026-09-15 22:14：設定頁「重設為預設」加二次確認

### 改動摘要
- 避免誤按一次就覆寫 nav-settings；確認對話框說明會還原哪些設定、不會刪節點

### 主要檔案
- `src/pages/settings.js`

---

## 2026-09-15 21:35：管理員驗證強化與 VPS／Cloudflare 準備

### 改動摘要
- 禁止用 `admin.example.json` 當真密碼；支援 scrypt `passwordHash`（明文過渡＋啟動警告）
- 登入 `next` 僅允許站內相對路徑；CSRF double-submit；session 閒置 60 分鐘
- 生產可 `MCU_SERVE_DIST=1` 由同一 API 提供 `dist/`；`ADMIN_COOKIE_SECURE` 供 HTTPS
- 文件補 Cloudflare／VPS 與 Maps referrer 說明

### 主要檔案
- `scripts/dev-server.cjs`、`scripts/hash-admin-password.cjs`、`config/admin.example.json`
- `src/lib/admin-fetch.js` 與各寫入／登出呼叫點
- `README.md`、`docs/合作者上手.md`

---

## 2026-09-15 01:02：刪節點時改寫回載入中的樓層

### 改動摘要
- `removeLinksToNode` 改以 `loadedScopeKey` 判斷是否覆寫目前畫面節點，避免跟換樓層同一類寫錯層

### 主要檔案
- `src/navigation/app.js`

---

## 2026-09-15 00:44：資料檢查每次重載驗證腳本，摘要分開列出警告

### 改動摘要
- 設定頁「資料檢查」走已啟動的伺服器，`require` 會沿用舊的 validate-nodes；現在每次檢查重新載入腳本，不必為了新警告重開 start-server
- 摘要改為「大樓警告／節點警告」分開顯示，避免只看到大樓那 4 筆（M／CC 缺圖與節點檔）以為全部

### 主要檔案
- `scripts/dev-server.cjs`、`src/pages/settings.js`

---

## 2026-09-15 00:38：驗證警告目的地缺少平面圖座標

### 改動摘要
- `validate-nodes` 對沒有 `xPercent`／`yPercent` 的目的地列警告（檔案不完整；畫面上仍會暫放紅點旁）

### 主要檔案
- `scripts/validate-nodes.cjs`、`docs/合作者上手.md`

---

## 2026-09-15 00:08：換樓層誤覆蓋節點檔，已還原

### 改動摘要
- 結束編輯／換樓層時會把「目前記憶體裡的節點」存進 `getStorageKey()`；但 viewState 已先改成新樓層，於是 S 棟 2F 的點被寫進 1F／3F／4F，看起來像整層節點跑掉
- 已從 git 還原 `data/nodes/s_1.json`、`s_3.json`、`s_4.json`；存檔改為寫回節點實際載入的那一層
- 目的地拖曳寫回仍保留，但只在編輯模式、且只存到載入中的 scope

### 主要檔案
- `src/navigation/app.js`：`loadedScopeKey`、`savePanoramaPoints`、`loadNodesForCurrentView`
- `data/nodes/s_1.json`、`data/nodes/s_3.json`、`data/nodes/s_4.json`：還原

---

## 2026-09-15 00:05：修平面圖目的地拖完結束編輯跳回原位

### 改動摘要
- 真正原因：每次重畫平面圖後，搜尋／路徑建議會 normalize 節點並換成新的目的地物件；綠色標記拖曳卻還在改舊物件，所以畫面上移了、存檔仍是原位，一按「結束編輯」重畫就跳回去
- 讀取其他用途（搜尋、小地圖）改為先複製再 normalize；拖曳改寫目前資料裡的目的地；結束編輯前以畫面上的座標寫回並存檔
- 環景箭頭／寫檔 debounce／未同步警告仍保留

### 主要檔案
- `src/navigation/app.js`：`readPointsByScope` 複製、`normalizeDestination` 原地更新、拖曳查 live dest、DOM 座標寫回
- `src/lib/panorama.js`、`style.css`

---

## 2026-09-14 23:30：平面圖目的地改為可拖曳的綠色標記

### 改動摘要
- 目的地在平面圖上有獨立座標，仍綁定路徑節點環景；朝向可選
- 綠色標記直接顯示目的地名稱（圓角標籤），不再用紅點那種圓點樣式
- 編輯模式「＋ 目的地」點圖新增；既有 destinations 缺座標時會先出現在所屬紅點旁
- 無朝向時不畫環景綠框、不自動轉向；搜尋／路徑仍走到綁定紅點

### 主要檔案
- `src/navigation/app.js`、`src/navigation/state.js`、`src/lib/panorama.js`
- `navigation.html`、`style.css`
- `scripts/validate-nodes.cjs`、`docs/合作者上手.md`、`README.md`

---

## 2026-09-14 18:07：設定頁改成分頁、管理後台按鈕更直白

### 改動摘要
- 設定頁由一長條改為「環景外觀／播放與距離／校園大樓／訪客起點／資料檢查」分頁；僅外觀頁顯示環景預覽，其餘全寬方便維護大樓卡片
- 管理後台兩個入口改為標題＋用途說明，按鈕改為藍底白字／淺底深字以免與深色卡片混在一起；設定頁標題不再寫合作者該用哪些分頁
- 切回「環景外觀」時會重算預覽尺寸，避免上次停在其他分頁時環景空白

### 主要檔案
- `settings.html`、`src/pages/settings.js`、`style.css`、`admin/index.html`
- `docs/合作者上手.md`、`README.md`

---

## 2026-09-14 17:55：缺圖路徑提示與設定頁一鍵驗證

### 改動摘要
- 平面圖／環景載入失敗會顯示實際檔案路徑，方便補圖
- 設定頁「資料檢查」呼叫 `GET /api/validate`，列出大樓與節點錯誤／警告（含缺圖、缺節點檔）

### 主要檔案
- `src/navigation/app.js`、`src/lib/panorama.js`、`src/pages/settings.js`、`settings.html`、`style.css`
- `scripts/dev-server.cjs`、`scripts/validate-buildings.cjs`、`scripts/validate-nodes.cjs`
- `docs/合作者上手.md`

---

## 2026-09-08 22:05：刪大樓／樓層可選一併清除節點檔

### 改動摘要
- 刪大樓或樓層時第二次確認可選擇是否刪除 `data/nodes/` 對應檔；預設取消＝保留節點
- 新增 `DELETE /api/node-scopes/:scope`（不可刪 campus）與共用 `node-scope-api.js`

### 主要檔案
- `scripts/dev-server.cjs`、`src/lib/node-scope-api.js`
- `src/navigation/app.js`、`src/pages/settings.js`
- `docs/合作者上手.md`、`README.md`

---

## 2026-09-08 21:51：新增合作者上手文件

### 改動摘要
- 新增 `docs/合作者上手.md`：分工、新增大樓／補節點／跨棟連線、驗證與 commit 範圍
- README 校園大樓章節改為導向該文件

### 主要檔案
- `docs/合作者上手.md`、`README.md`

---

## 2026-09-02 02:35：修正搜尋無法找到 EE 棟等新大樓節點

### 改動摘要
- 節點搜尋清單改由 `buildings.json` 動態產生，不再硬編碼 `NODE_FILES`（含 EE/M/CC 等）
- 導覽頁「搜尋目的地」改為同時搜尋節點名稱與目的地標記；訪客頁與路徑圖同步載入全部樓層節點檔

### 主要檔案
- `src/lib/visitor-starts.js`、`src/lib/navigation-graph.js`、`src/navigation/app.js`

---

## 2026-09-01 19:25：大樓協作強化（驗證、設定頁樓層編輯）

### 改動摘要
- 新增 `validate-buildings.cjs` 檢查 buildings／熱點／節點檔一致性；`BuildingsStore` 改以 `data/buildings.json` 為唯一種子
- 熱點新增 `defaultXPercent/defaultYPercent`，新建大樓重設位置回到首次放置座標
- 設定頁可編輯大樓名稱、樓層與平面圖路徑；新增樓層時可建立空節點檔

### 主要檔案
- `scripts/validate-buildings.cjs`、`src/lib/buildings-store.js`、`src/lib/visitor-starts.js`
- `src/pages/settings.js`、`settings.html`、`style.css`
- `data/nav-settings.json`、`README.md`、`package.json`

---

## 2026-09-01 17:50：修正編輯模式下大樓右鍵刪除無效

### 改動摘要
- 開啟／關閉編輯模式時一併重繪校園大樓熱點，右鍵刪除監聽器才會正確綁定
- 關閉入口的大樓在編輯模式下改用 aria-disabled，避免 disabled 阻擋右鍵；平面節點未開編輯模式時右鍵會提示

### 主要檔案
- `src/navigation/app.js`、`style.css`

---

## 2026-09-01 15:05：統一大樓資料架構（buildings.json）

### 改動摘要
- 大樓定義遷至 `data/buildings.json`；`nav-settings.json` 的 `campusBuildings` 僅保留校園熱點
- 移除內建／自訂分級：S、AA、EE、P 與新建大樓同一套新增、拖曳、刪除、設定頁管理
- 新增 `GET/POST /api/buildings` 與 `BuildingsStore`；`state.js` 不再硬編碼 `BUILDINGS`

### 主要檔案
- `data/buildings.json`、`scripts/dev-server.cjs`
- `src/lib/buildings-store.js`、`src/lib/campus-buildings.js`、`src/lib/visitor-starts.js`
- `src/navigation/app.js`、`src/pages/settings.js`、`src/pages/navigation.js`
- `data/nav-settings.json`、`README.md`、`navigation.html`

---

## 2026-08-31 21:50：大樓設定統一為 campusBuildings

### 改動摘要
- 移除 `customCampusBuildings` 分開存放；新建大樓與 S/AA/EE/P 一律存在 `campusBuildings`，設定頁同一區塊管理
- 編輯模式：拖曳移動熱點；新建大樓可右鍵刪除（內建四棟僅能移動／重設）

### 主要檔案
- `src/lib/campus-buildings.js`（取代 custom-campus-buildings.js）
- `src/lib/nav-arrow-settings.js`、`src/navigation/app.js`、`src/pages/settings.js`
- `data/nav-settings.json`、`navigation.html`

---

## 2026-08-31 21:40：新增大樓與現有大樓一致

### 改動摘要
- 移除自訂大樓的綠色按鈕、側欄獨立清單等區別；新建大樓外觀與行為與 S／P 等相同
- 新增大樓代碼與 S 棟相同的平面圖／環景路徑規則；設定頁一併管理所有大樓

### 主要檔案
- `src/lib/custom-campus-buildings.js`、`src/navigation/app.js`、`navigation.html`
- `src/pages/settings.js`、`settings.html`、`style.css`

---

## 2026-08-31 21:30：編輯模式新增自訂大樓

### 改動摘要
- 校園平面圖編輯模式改為「＋ 新增大樓」：填名稱與首層平面圖後點地圖放置，不再從 S/AA/EE/P 選棟放置
- 自訂大樓存入 `customCampusBuildings`，可進入首層編輯節點；內建四棟仍可拖曳調整位置

### 主要檔案
- `src/lib/custom-campus-buildings.js`、`src/lib/nav-arrow-settings.js`
- `src/navigation/app.js`、`src/navigation/state.js`、`navigation.html`、`style.css`、`data/nav-settings.json`

---

## 2026-08-31 21:20：大樓熱點預設位置還原與自訂名稱

### 改動摘要
- `campusBuildings` 寫入與 `state.js` 一致的預設座標，並新增 `label` 欄位；設定頁與導航編輯側欄可改按鈕顯示名稱
- 新增「重設為預設位置」按鈕，修正先前誤存座標導致熱點跑位

### 主要檔案
- `src/lib/visitor-starts.js`、`src/navigation/app.js`、`src/pages/settings.js`
- `navigation.html`、`settings.html`、`style.css`、`data/nav-settings.json`

---

## 2026-08-31 21:10：編輯模式放置校園大樓熱點

### 改動摘要
- 校園平面圖編輯模式新增「放置大樓熱點」：選棟別後點地圖放置，或直接拖曳藍色按鈕；位置存入 `campusBuildings` 的 `xPercent`／`yPercent`
- 設定頁棟別開關改為保留座標的物件格式；衛星圖熱點位置同步讀取設定

### 主要檔案
- `src/lib/visitor-starts.js`、`src/navigation/app.js`、`navigation.html`、`src/pages/settings.js`、`style.css`

---

### 改動摘要
- 設定頁新增 S/AA/EE/P 棟別熱點開關，存入 `campusBuildings`；關閉後校園／衛星圖按鈕變灰且不可進入
- 移除 `state.js` 硬編碼 `open: false`，改由設定頁統一管理

### 主要檔案
- `src/lib/visitor-starts.js`、`src/lib/nav-arrow-settings.js`、`src/pages/settings.js`、`settings.html`
- `src/navigation/app.js`、`src/navigation/state.js`、`style.css`

---

## 2026-08-31 20:35：訪客起點開關與文案調整

### 改動摘要
- 訪客起點設定頁新增「顯示於訪客頁」開關，關閉後訪客頁按鈕變灰且無法選取
- 進校入口說明移除「預設 1020」字樣

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/settings.js`、`src/pages/visitor.js`、`style.css`

---

## 2026-08-31 20:20：檢查報告建議 1～9 項

### 改動摘要
- 設定頁「訪客起點與進校入口」可調校外 Google 抵達後的室內起點；校園棟別熱點改設定開關
- 環景錯誤改 textContent；dev-server 拒絕敏感靜態路徑；新增 validate-nodes 腳本
- README 補停靠／分享 URL／安全說明；CSS 去掉手動 ?v=；start-server 加區網警告

### 主要檔案
- `src/lib/visitor-starts.js`、`src/lib/nav-arrow-settings.js`、`src/pages/settings.js`、`settings.html`
- `src/navigation/app.js`、`src/navigation/state.js`、`src/lib/panorama.js`
- `scripts/dev-server.cjs`、`scripts/validate-nodes.cjs`、`scripts/dev-stack.cjs`
- `config/maps.example.json`、`README.md`、`start-server.bat`、各 HTML、`style.css`

---

## 2026-08-31 14:27：打碼工具改版筆記分離

### 改動摘要
- 移除本檔內所有打碼工具條目；打碼開發歷程改寫入 `campus-privacy-blur/CHANGELOG.md`

### 主要檔案
- `PANORAMA-改版筆記.md`

---

## 2026-08-30 01:37：起點不填英文代碼則用節點名

### 改動摘要
- 網址代碼選填：有填用英文（如 gate）；不填則直接傳設定的環景節點實際名稱（如 1001）
- 設定頁說明與提示改清楚，避免誤以為一定要填英文

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/settings.js`、`settings.html`

---

## 2026-08-30 01:34：設定頁可自訂起點網址英文代碼

### 改動摘要
- 訪客起點新增「網址代碼（英文）」欄位（如校門口 → `gate`），分享／開始導航的 `from=` 會優先使用
- 代碼限英數與 `-` `_`，不可與其他起點重複；未填則仍用節點名稱

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/settings.js`、`settings.html`

---

## 2026-08-30 01:30：修復設定頁起點無法導航

### 改動摘要
- 設定頁自訂起點的 id（如 `start_時間戳`）不再寫進 `from=`；改傳實際節點名稱，避免導航頁解不出起點
- 僅 `gate`／`s`／`p` 等穩定代碼可用英文；解碼時一併讀取設定檔起點清單

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/visitor.js`、`src/navigation/app.js`

---

## 2026-08-30 01:25：搜尋範例拿掉廁所

### 改動摘要
- 訪客／導航／新增目的地的 placeholder 改為教室編號等現有範例，不再提廁所

### 主要檔案
- `visitor.html`、`navigation.html`

---

## 2026-08-30 01:20：分享網址起點改英文代碼

### 改動摘要
- 常用中文起點（如校門口）分享／導航 URL 改寫成英文代碼（`from=gate`），避免出現 `%E6%A0%A1…`
- 開啟時會自動還原成實際名稱；原本中文或節點編號連結仍可用

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/visitor.js`、`src/navigation/app.js`

---

## 2026-08-30 01:14：停靠橘色加強、分享連結自動開始

### 改動摘要
- 小地圖停靠點改為更亮的黃色外框＋脈衝動畫；路徑結果停靠標示也加底色提高對比
- 分享連結改帶 `go=1`，開啟後會自動開始導航

### 主要檔案
- `style.css`、`src/navigation/app.js`、`src/pages/visitor.js`、`navigation.html`、`visitor.html`

---

## 2026-08-30 01:02：停靠體驗：進度、標示、摘要與分享

### 改動摘要
- 抵達停靠時顯示「停靠 2／3：名稱」進度
- 路徑結果將停靠站標成琥珀色並註明停留方式
- 環景小地圖以橘色點標示停靠節點
- 訪客頁顯示行程摘要，並可複製含 `via`／`viaStay` 的分享連結（導航頁亦有）

### 主要檔案
- `src/navigation/app.js`、`src/pages/visitor.js`、`navigation.html`、`visitor.html`、`style.css`

---

## 2026-08-30 00:46：停靠點顯示剩餘等待秒數

### 改動摘要
- 自動播放抵達「停留秒數」停靠時，環景下方顯示倒數「還剩 N 秒」，並可按「立即繼續」或空白鍵提前前往
- 「按按鈕繼續」模式維持原提示，不顯示倒數

### 主要檔案
- `src/navigation/app.js`、`navigation.html`、`style.css`

---

## 2026-08-29 17:30：衛星圖節點樣式對齊平面圖

### 改動摘要
- 衛星俯視節點補上 `marker-linked`／`marker-auto-face`，與自製平面圖相同（有連線為藍、轉彎輔助有橘光暈）

### 主要檔案
- `src/navigation/app.js`

---

## 2026-08-29 17:14：停靠串接避免倒退

### 改動摘要
- 多段路徑串接時，下一段起點改為上一段實際抵達的節點，不再重新解析同名停靠（避免走到另一個同名點後倒退）
- 路徑步驟索引改為依進度／上一站比對，重複經過同一節點時不會指回第一次出現的下一站

### 主要檔案
- `src/navigation/app.js`、`src/lib/navigation-graph.js`

---

## 2026-08-28 23:20：停靠點搜尋與停留方式

### 改動摘要
- 訪客頁中途停靠改為與目的地相同的建議搜尋，需從清單點選或輸入完整名稱
- 每個停靠可選「停留秒數」或「按按鈕繼續」；導航自動播放抵達停靠時會停留或顯示「繼續前往下一站」
- 訪客開始導航以 `viaStay` 帶入停留設定

### 主要檔案
- `src/pages/visitor.js`、`visitor.html`、`src/navigation/app.js`、`navigation.html`、`src/lib/navigation-graph.js`、`style.css`

---

## 2026-08-28 23:05：路徑中途停靠點（動態增刪）

### 改動摘要
- 最短路徑支援依序經過多個中途停靠，相鄰兩點各自算最短路後串接；僅最終終點套用目的地面向
- 導航側欄可動態新增／移除停靠（軟上限 20）；訪客頁亦可選填停靠並以 URL `via` 帶入導航頁
- 訪客背景預載改為依完整停靠序列計算前段環景

### 主要檔案
- `src/lib/navigation-graph.js`、`src/navigation/app.js`、`navigation.html`、`visitor.html`、`src/pages/visitor.js`、`style.css`

---

## 2026-08-28 22:45：環景未快取時顯示載入提示

### 改動摘要
- 切換／開啟環景且圖片尚未在快取時，顯示半透明遮罩與「環景載入中…」，避免慢網路時像壞掉
- 改版筆記預載章節與現況對齊（3 站、訪客 8 站）

### 主要檔案
- `src/lib/panorama.js`、`style.css`、`navigation.html`、`PANORAMA-改版筆記.md`

---

## 2026-08-28 21:45：加強訪客預載銜接與導航預載站數

### 改動摘要
- 訪客頁預載改為 2 路並行、最多 8 站；經 sessionStorage 交給導航頁用 PanoramaViewer 真正預處理環景
- 導航路徑預載由 2 站改為 3 站

### 主要檔案
- `src/lib/visitor-prefetch-session.js`、`src/lib/panorama-prefetch-queue.js`、`src/pages/visitor.js`、`src/navigation/app.js`

---

## 2026-08-28 21:25：訪客頁背景預載路徑環景（方案 A）

### 改動摘要
- 起點與目的地都選好後，訪客頁背景算出最短路徑並限速 prefetch 前 5 站環景，暖瀏覽器 HTTP 快取；地圖定位／GPS 起點則跳過

### 主要檔案
- `src/lib/navigation-graph.js`、`src/lib/panorama-prefetch-queue.js`、`src/pages/visitor.js`

---

## 2026-08-28 21:16：預載與平面圖小整理

### 改動摘要
- 算路成功處明確傳入路徑預載參數；切樓層時相同平面圖不再重設 src；改版筆記預載章節與現況對齊

### 主要檔案
- `src/navigation/app.js`、`PANORAMA-改版筆記.md`

---

## 2026-08-28 21:00：修正校園平面圖進頁瞬間放大閃爍

### 改動摘要
- 平面圖路徑修正後，HTML 會先載入真實大圖，在 JS 算出顯示尺寸前會以原始像素顯示；加上 CSS 上限與立即 sync，並避免重設相同 src

### 主要檔案
- `style.css`、`src/navigation/app.js`、`navigation.html`

---

## 2026-08-28 20:52：修復導航頁 JS 重複宣告導致全壞

### 改動摘要
- 預載優化時誤新增重複的 `findPathStepIndex`，造成 `app.js` 語法錯誤、導航整頁無法載入；已移除並改用既有函式

### 主要檔案
- `src/navigation/app.js`

---

## 2026-08-28 20:45：修正校園平面圖初始路徑

### 改動摘要
- `navigation.html` 校園圖 src 改為 `./images/campus/campus-map.jpg`，與 `state.js` 一致，避免載入前破圖

### 主要檔案
- `navigation.html`

---

## 2026-08-28 20:43：路徑環景改為只預載下一站

### 改動摘要
- 算路／自動播放不再一次預載整條路徑環景，改為每次只預載目前站起 2 站，降低上線與慢網路時的初始流量

### 主要檔案
- `src/navigation/app.js`

---

## 2026-08-28 20:20：訪客目的地搜尋納入各棟節點名稱

### 改動摘要
- 先前只搜節點上的 destinations，P 棟等多數節點無目的地名稱導致搜不到；改為同時索引節點編號與目的地名稱

### 主要檔案
- `src/lib/visitor-starts.js`、`src/pages/visitor.js`、`visitor.html`

---

## 2026-08-27 22:39：修正 start-server 區網預設未生效

### 改動摘要
- bat 括號內 `%errorlevel%` 被預先展開，導致一直走本機；改由 Node 預設開區網，`--localhost` 才關

### 主要檔案
- `start-server.bat`、`scripts/dev-stack.cjs`

---

## 2026-08-27 22:37：start-server 預設開區網（單一 bat）

### 改動摘要
- 雙擊 `start-server.bat` 即預設 `--host` 並印區網網址；刪除多餘的 host bat。只要本機可加 `--localhost`

### 主要檔案
- `start-server.bat`、`scripts/dev-stack.cjs`、`README.md`

---

## 2026-08-27 22:35：補 start-server-host 與未帶 --host 提示

### 改動摘要
- 新增可雙擊的 `start-server-host.bat`；一般啟動時提示需 `--host` 才會印區網網址

### 主要檔案
- `start-server-host.bat`、`scripts/dev-stack.cjs`、`README.md`

---

## 2026-08-27 22:32：start-server 支援 --host 區網測試

### 改動摘要
- `start-server.bat --host`／`dev-stack --host` 讓 Vite 與 API 對外網卡監聽，並印出區網網址方便手機測試

### 主要檔案
- `start-server.bat`、`scripts/dev-stack.cjs`、`scripts/dev-server.cjs`、`README.md`

---

## 2026-08-27 21:41：導航一律顯示返回訪客頁；樓層隱藏衛星切換

### 改動摘要
- 導航頂欄／側欄／環景皆固定顯示「返回訪客頁」
- 進入各樓層平面圖時隱藏衛星圖切換（含路徑切樓層漏藏的情況）

### 主要檔案
- `src/navigation/app.js`、`navigation.html`

---

## 2026-08-27 21:35：訪客起點保留預設並加「其他」搜尋

### 改動摘要
- 回退成原本預設起點按鈕；新增「其他」選項，點選後才顯示搜尋欄可選節點當起點
- 衛星圖角標／示意提醒仍維持移除

### 主要檔案
- `visitor.html`、`src/pages/visitor.js`、`style.css`

---

## 2026-08-27 21:28：訪客起點改搜尋選單、移除衛星提醒

### 改動摘要
- 訪客頁起點改為可搜尋節點下拉（同目的地互動），並保留「地圖上定位／目前位置」快捷；拿掉衛星圖角標與示意／測試提醒文案

### 主要檔案
- `visitor.html`、`src/pages/visitor.js`、`style.css`
- `navigation.html`、`src/navigation/app.js`

---

## 2026-08-27 21:18：訪客高優先體驗 1–4（錯誤狀態／路徑引導／衛星示意／文件）

### 改動摘要
- 訪客模式補齊找不到路、定位失敗、缺圖等錯誤訊息與下一步；路徑就緒時醒目提示按「自動播放」並精簡側欄
- 衛星俯視定案為「衛星示意／測試」標籤，避免誤導；README／images README 寫清協作者需自備圖與 maps.local

### 主要檔案
- `src/navigation/app.js`、`navigation.html`、`style.css`
- `src/pages/visitor.js`、`visitor.html`
- `README.md`、`images/README.md`

---

## 2026-08-27 16:43：衛星俯視節點改與自製圖同座標

### 改動摘要
- 衛星參考圖上的紅點／大樓熱點改直接使用自製平面圖的 x%/y%，相對位置與自製圖一致

### 主要檔案
- `src/navigation/app.js`、`navigation.html`

---

## 2026-08-27 16:39：衛星俯視改為使用者參考圖（含旋轉裁切）

### 改動摘要
- Google 一般衛星圖無法穩定旋轉；改直接顯示你提供的桃園校區衛星參考圖
- 紅點／點選假定位改依參考圖上的錨點對位；不需 API 也能看衛星俯視

### 主要檔案
- `images/campus/campus-satellite-ref.png`、`config/maps.local.json`
- `src/lib/campus-gps.js`、`src/navigation/app.js`、`navigation.html`、`style.css`

---

## 2026-08-27 16:31：衛星俯視鎖定參考圖視野

### 改動摘要
- 衛星圖改用固定 `satelliteView`（中心／縮放／朝向），對齊使用者提供的桃園校區裁切
- 取消易飄移的 fitBounds；可視範圍以 `satelliteBounds` 嚴格限制

### 主要檔案
- `src/lib/campus-satellite-map.js`、`config/maps.local.json`、`config/maps.example.json`

---

## 2026-08-27 16:24：衛星圖與自製環道平面圖對齊校準

### 改動摘要
- 依第二張衛星標註圖＋自製圖環道節點／大樓熱點，重設 12 個 mapGpsAnchors
- 對應關係：自製右上＝校門口、上方＝S/AA、左側＝EE/P、右側＝田徑場西側、下方＝球場／設計／宿舍

### 主要檔案
- `config/maps.example.json`、`config/maps.local.json`、`scripts/dev-server.cjs`
- `src/navigation/state.js`、`src/navigation/app.js`
- `docs/mcu-taoyuan-satellite-reference-2.png`

---

## 2026-08-27 16:15：依桃園校區衛星實景重校準定位

### 改動摘要
- 依銘傳桃園校區衛星圖（圖書館 Q、設計 M、CC／資管、田徑場、宿舍）重設 `satelliteBounds` 與 `mapGpsAnchors`
- 仿射改支援多錨點最小平方；衛星視野對準校區中心而非只鎖校門口

### 主要檔案
- `config/maps.example.json`、`config/maps.local.json`、`scripts/dev-server.cjs`
- `src/lib/campus-gps.js`、`src/lib/campus-satellite-map.js`
- `docs/mcu-taoyuan-satellite-reference.png`

---

## 2026-08-27 15:58：衛星俯視改為純衛星並鎖定校園範圍

### 改動摘要
- 校園「衛星俯視」改用純衛星圖（非 roadmap／導航路線圖），並限制在校園附近視野
- 切換衛星時會關掉校外導航面板，避免誤顯路線圖

### 主要檔案
- `src/lib/campus-satellite-map.js`、`src/navigation/app.js`、`navigation.html`、`style.css`

---

## 2026-08-27 15:52：校園圖可切換衛星俯視與點選假定位

### 改動摘要
- 頂欄可切換「自製平面圖／衛星俯視」；衛星圖顯示節點並可點選對到最近節點（假定位）
- 定位橫幅新增「改用衛星圖點選」；進入大樓時自動回到自製平面圖

### 主要檔案
- `src/lib/campus-satellite-map.js`、`src/lib/campus-gps.js`、`src/navigation/app.js`
- `navigation.html`、`style.css`、`visitor.html`、`README.md`

---

## 2026-08-25 16:50：校園平面圖 GPS 大致定位（不含樓層）

### 改動摘要
- 僅在校園總圖：GPS → 平面圖座標 → 最近節點；側欄／定位橫幅可按「GPS 定位」
- 「目前位置」若已在校園內改走此流程；錨點設於 `maps` 的 `mapGpsAnchors`

### 主要檔案
- `src/lib/campus-gps.js`、`src/navigation/app.js`、`navigation.html`
- `config/maps.example.json`、`scripts/dev-server.cjs`、`visitor.html`、`README.md`

---

## 2026-08-25 16:11：環景播放頂欄加入返回訪客頁

### 改動摘要
- 全景／播放頁頂欄在「關閉」旁新增「返回訪客頁」

### 主要檔案
- `navigation.html`、`style.css`

---

## 2026-08-25 15:55：導航頁常駐返回訪客頁按鈕

### 改動摘要
- 導航頁頂欄與側欄皆可返回訪客頁，不再僅限 `mode=visitor` 才顯示

### 主要檔案
- `navigation.html`、`src/navigation/app.js`、`style.css`

---

## 2026-08-25 15:47：校園地圖點選定位到最近節點

### 改動摘要
- 訪客可選「地圖上定位」，進入校園地圖點一下後對到最近節點當起點；導覽側欄也可用「地圖定位」

### 主要檔案
- `src/navigation/app.js`、`navigation.html`：定位模式與最近節點比對
- `src/pages/visitor.js`、`src/lib/visitor-starts.js`、`visitor.html`、`style.css`

---

## 2026-08-25 15:10：完善訪客導航體驗（建議、目前位置、訪客模式）

### 改動摘要
- 訪客頁目的地建議會顯示棟別／樓層，需點選後才能開始；新增「目前位置」起點
- 進入導覽頁時以訪客模式隱藏管理區塊、提供返回訪客頁，並改善找不到路／校外導航的提示

### 主要檔案
- `src/pages/visitor.js`、`visitor.html`、`src/lib/visitor-starts.js`
- `src/navigation/app.js`、`navigation.html`、`style.css`

---

## 2026-08-23 16:04：距離估算控件改固定於平面圖右下角

### 改動摘要
- 先前寫左下角但因 flex 置中實際出現在平面圖右側；改為明確固定右下角，並更正說明文字

### 主要檔案
- `style.css`、`navigation.html`、`settings.html`

---

## 2026-08-23 15:50：編輯模式平面圖可調距離估算基準

### 改動摘要
- 開啟編輯模式後，平面圖顯示「1% ≈ 幾公尺」輸入框，可直接調整並寫入導航設定

### 主要檔案
- `navigation.html`、`style.css`、`src/navigation/state.js`、`src/navigation/app.js`、`settings.html`

---

## 2026-08-23 15:46：連線距離估算基準可在設定頁調整

### 改動摘要
- 新增設定「平面圖 1% ≈ 幾公尺」，供同樓層自動帶入連線距離時換算；預設 1，可調 0.1–10

### 主要檔案
- `src/lib/nav-arrow-settings.js`、`settings.html`、`src/pages/settings.js`、`src/navigation/app.js`、`data/nav-settings.json`

---

## 2026-08-23 15:40：修正右鍵刪除節點需刪兩次

### 改動摘要
- 刪除時若先過濾節點再清連線，`removeLinksToNode` 會用舊 cache 把節點寫回；改為先清連線再移除節點

### 主要檔案
- `src/navigation/app.js`：調整 `confirmAndDeletePoint` 順序

---

## 2026-08-23 15:33：改善新增連線選目標與距離

### 改動摘要
- 連線目標改可搜尋清單，同樓層依距離排序並標示已連／缺反向／未連；同樓層距離自動估算；完成後可接續設定反向連線

### 主要檔案
- `navigation.html`、`style.css`、`src/navigation/state.js`、`src/navigation/app.js`

---

## 2026-08-23 15:12：平面圖連線可辨識雙向／單向

### 改動摘要
- 同 scope 節點連線改為：綠色實線＝雙向已連；橘色虛線＋箭頭＝僅單向，箭頭指向有連線的一端

### 主要檔案
- `src/navigation/app.js`：合併同對節點連線並判斷方向
- `style.css`、`navigation.html`：連線樣式與操作說明

---

## 2026-08-21 18:25：修正新增節點縮圖撐破版面

### 改動摘要
- 全景原圖過大把選圖區撐爆；縮圖改固定高度、格線項目加 min-width:0，modal 限制最大高度並可捲動

### 主要檔案
- `style.css`、`navigation.html`、`src/navigation/app.js`：縮圖尺寸與溢位限制

---

## 2026-08-21 18:18：新增節點可從樓層資料夾選縮圖

### 改動摘要
- 新增節點表單會列出目前樓層全部全景圖（含已用過），顯示縮圖與檔名；點選即可帶入，已用圖會標「已用」但仍可選

### 主要檔案
- `scripts/dev-server.cjs`：新增 `GET /api/panorama-images`
- `navigation.html`、`style.css`、`src/navigation/app.js`、`src/navigation/state.js`：縮圖挑選 UI

---

## 2026-08-21 17:23：新增節點改為表單＋預覽

### 改動摘要
- 編輯模式點地圖不再連跳兩個 prompt，改為一次填名稱與全景圖；可即時預覽，找不到圖就擋下不建立

### 主要檔案
- `navigation.html`、`style.css`：新增節點 modal 與預覽樣式
- `src/navigation/state.js`、`src/navigation/app.js`：表單邏輯、路徑提示、圖片驗證

---

## 2026-08-18 21:41：訪客頁起點改回純文字按鈕

### 改動摘要
- 訪客頁起點不再顯示縮圖，只保留文字按鈕與深色選取狀態；設定頁起點預覽圖縮小

### 主要檔案
- `src/pages/visitor.js`、`style.css`：訪客按鈕改回文字
- `style.css`：設定頁起點縮圖縮小

---

## 2026-08-18 21:32：修正訪客頁起點縮圖撐破版面

### 改動摘要
- 訪客起點按鈕改為固定高度縮圖，避免全景原圖把表單擠出畫面；頁面改為由上往下捲動

### 主要檔案
- `src/pages/visitor.js`：起點圖片包進縮圖容器
- `style.css`、`visitor.html`：限制縮圖尺寸並更新樣式快取

---

## 2026-08-18 21:28：訪客起點可在設定頁管理

### 改動摘要
- 訪客頁起點選取改為更深底色與「已選擇」標記；管理員可在設定頁新增起點，並指定按鈕對應哪張環景圖

### 主要檔案
- `src/lib/visitor-starts.js`：起點預設值與節點／圖片清單
- `src/pages/visitor.js`、`style.css`：起點按鈕選取樣式
- `settings.html`、`src/pages/settings.js`：起點管理介面
- `src/lib/nav-arrow-settings.js`：起點一併寫入 `nav-settings.json`

---

## 2026-08-18 21:16：新增訪客導航入口頁

### 改動摘要
- 首頁「訪客／學生」改進入獨立頁，可點選大樓門口當起點、搜尋目的地後開始導航，再帶入現有路徑計算與自動播放

### 主要檔案
- `visitor.html`、`src/pages/visitor.js`：訪客導航入口
- `src/navigation/app.js`：讀取 `from` / `to` 參數並自動規劃路徑
- `index.html`、`style.css`、`vite.config.js`、`README.md`：入口與樣式

---

## 2026-08-18 19:50：setup-env 可自動安裝 Node.js

### 改動摘要
- 一鍵建置改成沒有 Node.js 時先用 winget 裝 LTS，失敗再下載官方 MSI；已安裝則略過

### 主要檔案
- `scripts/setup-env.ps1`：新增 Node.js 自動安裝步驟
- `README.md`：更新第一次 clone 說明

---

## 2026-08-18 19:36：setup-env.ps1 改存 UTF-8 BOM

### 改動摘要
- Windows PowerShell 5 預設用系統編碼讀腳本，UTF-8 無 BOM 會讓中文字串斷掉並報未預期 `}`；改存 UTF-8 BOM

### 主要檔案
- `scripts/setup-env.ps1`：改為 UTF-8 BOM

---

## 2026-08-18 19:33：setup-env 改由 PowerShell 顯示中文

### 改動摘要
- cmd 讀 UTF-8 中文 .bat 會讓 `@echo off` 失效、並把「資料夾」等字拆成假指令；建置邏輯改放到 PowerShell，bat 只負責啟動

### 主要檔案
- `setup-env.bat`：改為純英文啟動器
- `scripts/setup-env.ps1`：實際安裝依賴與複製本機設定

---

## 2026-08-18 19:30：修正 setup-env 結尾中文被 cmd 拆指令

### 改動摘要
- 建置成功後的提示含全形逗號，cmd 用系統編碼讀 .bat 會把後半句當成命令；結尾改成不含 `，` 的文字

### 主要檔案
- `setup-env.bat`：結尾兩行提示拿掉全形逗號與句號

---

## 2026-08-18 19:25：修正 setup-env.bat 括號被當成指令

### 改動摘要
- cmd 會把 `echo` 裡的括號或 `images\` 拆成下一句命令，建置其實已成功但結尾會噴錯誤；已改成不含括號的提示文字

### 主要檔案
- `setup-env.bat`：改寫結尾與其他 echo 文案

---

## 2026-08-18 19:19：新增一鍵建置環境腳本

### 改動摘要
- 從 GitHub 拉下來後要先裝依賴與本機設定，改成獨立的 `setup-env.bat`，不混在啟動伺服器裡

### 主要檔案
- `setup-env.bat`：檢查 Node、執行 npm install、複製缺少的 local 設定
- `start-server.bat`：拿掉自動安裝，只負責啟動
- `README.md`：補充第一次 clone 先跑建置腳本

---

## 2026-08-18 19:15：clone 後自動安裝 Vite 依賴

### 改動摘要
- 從 GitHub 拉下來沒有 `node_modules`，一鍵啟動會找不到 `vite`；`start-server.bat` 改成第一次自動跑 `npm install`

### 主要檔案
- `start-server.bat`：偵測沒有 `node_modules/vite` 時先安裝依賴
- `README.md`：補充第一次 clone 的行為

---

## 2026-08-18 17:39：補上導航設定寫入失敗提示

### 改動摘要
- 導航設定改為只有在 API 真正寫入成功時才顯示儲存成功，若登入失效或後端不可用，會明確提示目前僅暫存在瀏覽器

### 主要檔案
- `src/lib/nav-arrow-settings.js`：新增可等待的設定寫入／重設流程
- `src/pages/settings.js`：依 API 成敗顯示不同儲存訊息

---

## 2026-08-18 17:23：導航設定改存檔案而非僅 localStorage

### 改動摘要
- 導覽頁與設定頁改從 `/api/nav-settings` 讀取共用導航設定，並寫入 `data/nav-settings.json`，避免更換 port 或瀏覽器後設定看起來消失

### 主要檔案
- `src/lib/nav-arrow-settings.js`：新增 API 初始化與儲存邏輯
- `scripts/dev-server.cjs`：新增導航設定讀寫 API
- `data/nav-settings.json`：共用導航設定檔

---

## 2026-08-18 17:08：README 補齊目前架構與啟動方式

### 改動摘要
- 重寫 README，補上首頁分流、管理登入、Vite / API 啟動方式、資料結構與本機設定說明

### 主要檔案
- `README.md`：更新為目前專案架構與操作方式

---

## 2026-08-18 16:40：統一管理開發服務啟停

### 改動摘要
- 新增單一啟動腳本統一帶起 API 與 Vite，並調整為適用 Windows 的啟動方式，避免 `start-server.bat` 另開視窗後殘留背景 `node` 程序

### 主要檔案
- `scripts/dev-stack.cjs`：集中啟動前後端並在結束時清理子程序
- `start-server.bat`：改為呼叫單一管理腳本

---

## 2026-08-18 16:33：修正 dev-server ESM/CJS 衝突

### 改動摘要
- `package.json` 設了 `"type": "module"` 導致 `dev-server.js` 的 `require` 報錯，改名為 `.cjs` 解決

### 主要檔案
- `scripts/dev-server.cjs`：由 `.js` 改名
- `start-server.bat`：更新路徑引用

---

## 2026-08-18 16:31：一鍵啟動前後端開發環境

### 改動摘要
- `start-server.bat` 改成同時開啟 Node API 與 Vite 前端，避免每次手動開兩個終端機

### 主要檔案
- `start-server.bat`：一鍵啟動 `scripts/dev-server.js` 與 `npm run dev`

---

## 2026-08-18 16:28：導入 Vite 並改為 ES Module

### 改動摘要
- 移除未使用的舊平面圖／獨立環景頁，導入 Vite 開發與打包流程，開啟 source map 與 `/api` 代理
- 將主程式與共用腳本搬進 `src/`，改用 ES Module 頁面入口，縮小全域 script 依賴

### 主要檔案
- `package.json`、`vite.config.js`：Vite 開發／打包設定
- `src/navigation/app.js`、`src/navigation/state.js`：主導航程式與共用狀態
- `src/lib/*.js`、`src/pages/*.js`：共用模組與頁面入口
- `navigation.html`、`settings.html`、`admin/*.html`：改用 `type="module"`

---

## 2026-08-18 15:45：新增首頁（身分選擇）

### 改動摘要
- 新增 `index.html` 入口首頁，可選「訪客／學生」或「管理員」進入對應頁面
- 原地圖導航頁改名為 `navigation.html`

### 主要檔案
- `index.html`：首頁（身分選擇）
- `navigation.html`：原 `index.html` 改名
- `style.css`：首頁樣式
- `admin/login.html`、`admin/index.html`：連結更新

---

## 2026-08-16 18:50：管理頁需密碼登入

### 改動摘要
- 新增 `/admin/login.html` 登入與管理後台；未登入看不到編輯模式與設定頁，也不能寫入節點 JSON
- 密碼放在 `config/admin.local.json`（或環境變數 `ADMIN_PASSWORD`），不寫進前端

### 主要檔案
- `scripts/dev-server.js`：登入 session、保護管理頁與寫入 API
- `admin/login.html`、`admin/index.html`：登入與後台入口
- `app.js`、`index.html`、`settings.html`：前台隱藏管理功能

---

## 2026-08-16 18:03：空白鍵暫停／繼續自動播放

### 改動摘要
- 路徑自動播放中按空白鍵可暫停或繼續；輸入框與按鈕焦點時不攔截，避免重複觸發

### 主要檔案
- `app.js`：空白鍵切換暫停／繼續
- `index.html`：操作說明與 HUD 提示

---

## 2026-08-16 17:56：預覽與播放的 HUD 大小對齊

### 改動摘要
- 設定預覽不再把整層 overlay 縮小後再套大小滑桿，改依實際播放畫面寬度比例縮放面板／小地圖，避免預覽看起來正常、實際卻變很大

### 主要檔案
- `settings.html`：預覽 overlay 與環景同框，只設寬度比例
- `style.css`：HUD／小地圖大小與邊距吃 `--preview-fit-scale`

---

## 2026-08-16 17:38：提高縮放上限並可調小地圖大小

### 改動摘要
- 速度面板大小上限由 140% 提高到 300%
- 設定頁新增小地圖大小（50%–300%）

### 主要檔案
- `nav-arrow-settings.js`：`hudScale` 上限與 `minimapScale`
- `settings.html`：小地圖大小滑桿
- `style.css`：小地圖縮放

---

## 2026-08-16 17:33：預覽 HUD 位置改與播放畫面對齊

### 改動摘要
- 設定預覽的速度面板／小地圖改在「實際播放視窗尺寸」的縮放平面上定位，避免小預覽框讓 HUD 看起來跑位

### 主要檔案
- `settings.html`：預覽 overlay 平面與縮放
- `nav-arrow-settings.js`：拖曳改用未縮放座標
- `style.css`：預覽 overlay 平面

---

## 2026-08-16 17:25：預覽版面對齊實際播放畫面

### 改動摘要
- 設定預覽改為與實際環景相同的頂欄＋畫面結構，小地圖比例也跟播放中一致
- 拿掉預覽小地圖的定位藍點，標題改為預覽用

### 主要檔案
- `settings.html`：預覽結構與小地圖版面
- `style.css`：預覽舞台對齊實際 overlay

---

## 2026-08-16 17:18：設定預覽可拖動速度面板與小地圖

### 改動摘要
- 設定頁環景預覽會顯示速度面板、右上角小地圖與當前位置，並可在預覽中拖曳調整位置
- 實際播放中改為只顯示、不再拖動修改

### 主要檔案
- `settings.html`：預覽疊加 HUD／小地圖與拖曳
- `nav-arrow-settings.js`：小地圖位置設定與共用拖曳
- `app.js`：播放中套用位置、移除拖曳
- `style.css`：預覽舞台與四角位置

---

## 2026-08-16 17:05：速度面板可調外觀並自由拖曳

### 改動摘要
- 設定頁可調播放速度面板的透明度、大小與四角位置
- 播放中可拖曳面板到任意位置，並記住為「自訂」

### 主要檔案
- `nav-arrow-settings.js`：HUD 外觀／位置設定
- `settings.html`：面板設定與預覽
- `app.js`：拖曳與套用樣式
- `style.css`：四角位置與預覽框

---

## 2026-08-16 16:57：播放中可用鍵盤即時調速

### 改動摘要
- 自動播放時於畫面左側顯示當前停留秒數，以及加速／減速按鈕與對應按鍵（`+`/`−`、↑/↓）
- 播放中調整速度會立刻套用到目前這站的剩餘停留時間

### 主要檔案
- `index.html`：左側速度 HUD
- `app.js`：鍵盤與按鈕調速、停留計時重排
- `style.css`：HUD 樣式

---

## 2026-08-14 18:29：設定頁可改播放停留上下限

### 改動摘要
- 設定頁新增「自動播放路徑」停留下限／上限（0.1–60 秒），導航頁「每站停留」滑桿會跟著套用

### 主要檔案
- `nav-arrow-settings.js`：儲存 `playDelayMinSec`／`playDelayMaxSec`
- `settings.html`：上下限輸入欄
- `app.js`：套用滑桿範圍
- `style.css`：數字輸入樣式

---

## 2026-08-14 18:23：導航播放速度範圍加大

### 改動摘要
- 自動播放「每站停留」滑桿改為 0.2–20 秒（原 0.8–8 秒），可更快或更慢導覽

### 主要檔案
- `index.html`：`pathAutoDelay` 上下限與步進
- `app.js`：停留時間下限改為 200ms

---

## 2026-08-10 15:32：連線可指定上樓／下樓箭頭

### 改動摘要
- 改為在節點連線列（如 `→ 2003`）後方勾選「上樓／下樓」，直接指定該箭頭類型；兩者互斥，皆不勾則為一般箭頭
- 移除先前節點級上下樓勾選；舊連線若尚無欄位，仍依跨樓方向自動帶入

### 主要檔案
- `app.js`：`link.floorChange`、連線列勾選、熱點解析
- `style.css`：連線上下樓勾選樣式

---

## 2026-08-10 15:25：上下樓圖示改為節點勾選

### 改動摘要
- （已由連線級勾選取代）跨樓箭頭改為可手動指定上下樓圖示

### 主要檔案
- `app.js`、`style.css`

---

## 2026-08-05 17:23：自動對準開關只在暫停或手動查看時生效

### 改動摘要
- 調整為自動導覽進行中一律可對準下一站；只有在暫停或手動查看路徑節點時，才依設定決定是否強制對準

### 主要檔案
- `app.js`：更新 `shouldApplyPathNextCentering()` 判斷

---

## 2026-08-05 17:20：修正關閉自動對準後仍被 focusLink 強制指向

### 改動摘要
- 修正路徑節點跳轉與自動播放仍傳入 `focusLinkId` 的問題；關閉設定後不再被下一箭頭強制帶方向

### 主要檔案
- `app.js`：新增 `shouldApplyPathNextCentering()`，統一路徑下一點對準的啟用條件

---

## 2026-08-05 17:16：導覽外隱藏綠箭頭與路徑強制對準

### 改動摘要
- 修正為只有在路徑導覽進行中時，才顯示綠色下一站箭頭與套用下一站自動對準

### 主要檔案
- `app.js`：將 `pathNextLink`、路徑提示與綠箭頭樣式綁定到導覽中狀態

---

## 2026-08-05 17:13：導覽結束後停止強制轉向

### 改動摘要
- 將進站自動對準與轉彎輔助限制在路徑導覽期間；導覽結束後不再自動改變視角

### 主要檔案
- `app.js`：新增 `pathGuidanceActive` 控制路徑導覽中的自動對準

---

## 2026-08-05 17:04：設定頁檔名改為 settings.html

### 改動摘要
- 將設定頁實體檔名由 `arrow-settings.html` 改為 `settings.html`，並同步更新入口連結

### 主要檔案
- `settings.html`：新的設定頁檔名
- `index.html`：更新設定頁連結

---

## 2026-08-05 17:02：設定頁新增進站自動對準開關

### 改動摘要
- 將「進站後自動對準路徑下一個點」做成設定頁可開關選項，預設維持開啟

### 主要檔案
- `nav-arrow-settings.js`：新增 `centerPathNextArrow` 設定
- `arrow-settings.html`：加入切換勾選框
- `app.js`：依設定決定是否自動對準下一站箭頭

---

## 2026-08-02 14:56：campus.json 全景圖路徑改為 campus 子資料夾

### 改動摘要
- 將 `campus.json` 內 82 筆節點的 `url` 由 `./images/xxxx.jpg` 改為 `./images/campus/xxxx.jpg`

### 主要檔案
- `data/nodes/campus.json`：所有全景圖 url 路徑前綴

---

### 改動摘要

- 已計算路徑時，進入節點後視角會對準「下一站」箭頭（畫面中央），方便接續點擊
- 有開轉彎輔助的節點仍先顯示進場面向，再旋轉至下一箭頭

### 主要檔案

- `app.js`：`getNextPathFocusLink`、進站視角優先對準路徑下一箭頭

---

## 2026-08-01 20:46：上下樓指標強化與路徑箭頭變色

### 改動摘要

- 跨樓層連線改為上樓／下樓專用圖示與醒目標籤
- 已計算路徑時，下一站導航箭頭改為綠色並脈動，與一般藍箭頭區分

### 主要檔案

- `app.js`：樓層方向判斷、`isPathNext` 熱點標記
- `panorama.js`、`style.css`：箭頭樣式與圖示

---

## 2026-08-01 20:42：路徑結果節點可點擊跳轉

### 改動摘要

- 計算路徑後，結果列上的各節點名稱可點擊，直接開啟該站環景（若正在自動播放會先停止）

### 主要檔案

- `app.js`：路徑結果渲染與 `jumpToPathStep`
- `style.css`、`index.html`：點擊樣式與說明

---

## 2026-08-01 20:11：修正自動導覽閃爍跳下一站

### 改動摘要

- 環景 `mount` 改為等實際載入完成才繼續，避免未顯示完就排程下一站
- 轉彎輔助以進場面向計算夾角，並在旋轉後依「每站停留秒數」再前進

### 主要檔案

- `panorama.js`：`mount`／切景 Promise 等 load
- `app.js`：轉彎輔助時序與停留時間

---

## 2026-08-01 20:04：節點轉彎輔助（＞15° 自動對準下一箭頭）

### 改動摘要

- 編輯模式可為各節點開關「轉彎輔助」；進入節點後若下一導航箭頭與目前面向相差超過 15°，會自動旋轉對準
- 設定頁改名「設定」，並可調整旋轉秒數

### 主要檔案

- `app.js`：`autoFaceNext` 欄位、自動／路徑導航轉向邏輯
- `panorama.js`：`lookAt` 支援時長與完成回呼
- `nav-arrow-settings.js`、`arrow-settings.html`、`index.html`、`style.css`

---

## 2026-08-01 19:38：圖庫與程式碼分離並清理 git 歷史

### 改動摘要

- `images/` 圖檔改為本機保存、不再提交 GitHub；並從歷史中移除以縮小遠端倉庫
- 補充圖庫取得說明，更新忽略規則

### 主要檔案

- `.gitignore`：忽略 `images/**`（保留 `.gitkeep` 與說明）
- `images/README.md`：圖庫放置與取得方式
- `README.md`：啟動說明補上圖庫步驟

---

## 2026-08-01 18:55：準備 GitHub 發布並排除敏感金鑰

### 改動摘要

- 新增 `.gitignore`，避免環境變數與本機 Google Maps 金鑰被提交
- 將 `config/maps.local.json` 移出版本追蹤（本機檔案保留）

### 主要檔案

- `.gitignore`：忽略 `.env`、`maps.local.json`、`node_modules` 等
- `config/maps.local.json`：改為僅本機使用，不再納入 git

---

## 2026-07-10 15:32：修正自動導覽選單彈出與小地圖節點偏移

### 改動摘要

- 自動播放路徑時不再每站強制開啟導覽選單，改為開始導覽時關閉側邊欄
- 小地圖改為與主地圖相同的圖片比例對齊方式，節點與路徑線正確貼合平面圖

### 主要檔案

- `app.js`：移除 playAutoPathStep 的選單開啟、新增小地圖版面同步
- `index.html`、`style.css`：小地圖內層 map-stage 結構

---

## 2026-07-10 15:25：環景模式右上角小地圖

### 改動摘要

- 進入全景模式時，於右上角顯示當前樓層／校園平面圖小地圖，標示目前節點位置
- 導覽路徑規劃後，小地圖以綠線顯示路徑、藍色脈動標記當前位置，已走過路段改為灰色

### 主要檔案

- `index.html`：小地圖 DOM 結構
- `style.css`：小地圖樣式與動畫
- `app.js`：小地圖渲染、路徑高亮與更新時機

---

## 2026-07-10 15:13：改善箭頭拖曳流暢度

### 改動摘要

- 拖曳時改為手動同步熱點 DOM 位置，並用 requestAnimationFrame 節流，解決卡頓與箭頭消失問題
- 拖曳期間暫停環景平移、提高箭頭層級與不透明度

### 主要檔案

- `panorama.js`：拖曳佈局同步與事件處理
- `style.css`：拖曳中視覺樣式

---

### 改動摘要

- 環景編輯模式下，可直接拖動地面導航箭頭調整水平方向（yaw）與俯角（arrowPitch）
- 放開滑鼠後自動儲存至連線資料

### 主要檔案

- `panorama.js`：箭頭拖曳與熱點位置更新
- `app.js`：連線位置儲存、編輯模式切換
- `style.css`：可拖曳箭頭樣式

---

### 改動摘要

- 修正全景圖層遮住側邊選單與 ☰ 按鈕的 z-index 問題
- 環景上方工具列新增「☰ 選單」按鈕，方便在全景模式中開關導覽選單

### 主要檔案

- `style.css`：全景模式下的選單層級
- `index.html`、`app.js`：環景選單按鈕與共用切換邏輯

---

### 改動摘要

- 路徑自動播放時可隨時暫停，之後從目前站點繼續，不必從頭開始
- 側邊選單提供「暫停／繼續播放」與「停止導覽」；環景上方也新增暫停按鈕

### 主要檔案

- `app.js`：暫停／繼續播放邏輯
- `index.html`：停止與環景暫停按鈕
- `style.css`：按鈕樣式

---

### 改動摘要

- 新增 `arrow-settings.html`，可用滑桿即時調整箭頭大小、透明度、俯角，並在環景中預覽
- 設定儲存於瀏覽器 localStorage，主程式開啟環景時自動套用
- 側邊選單加入「開啟箭頭設定頁」連結

### 主要檔案

- `nav-arrow-settings.js`：讀寫與套用箭頭設定
- `arrow-settings.html`：設定頁與即時預覽
- `panorama.js`、`app.js`、`index.html`、`style.css`：串接設定與入口

---

### 改動摘要

- 將環景中「前往下一節點」的藍色按鈕改為貼地的箭頭圖示，並支援調整透明度與俯仰位置
- 全域預設可在 `panorama.js` 調整；各連線可在 JSON 加上 `arrowPitch`、`arrowOpacity` 覆寫

### 主要檔案

- `panorama.js`：箭頭熱點渲染與預設參數
- `style.css`：地面箭頭樣式
- `app.js`、`index.html`：提示文字更新

---

## 2026-07-07 19:33：建立改版筆記規則

### 改動摘要

- 新增 Cursor 規則：之後專案有修改時，自動在本檔新增日期時間與改動摘要

### 主要檔案

- `.cursor/rules/changelog.mdc`：alwaysApply 規則
- `PANORAMA-改版筆記.md`：改為全專案改版紀錄

---

## 2026-07-07 19:22：減少環景切換閃爍

### 背景

- 專案已有**環景圖預載**（`app.js` → `PanoramaViewer.preloadPanoramaSrcs`）。
- 預載只負責把圖片放進快取，**不能**單獨解決閃爍。
- 舊版每次切換都 `destroy()` + 清空 DOM + 重建 Pannellum，中間會短暫空白。

### 改動摘要

| 項目 | 說明 |
|------|------|
| 原地切換 | viewer 已存在時，用 `addScene` + `loadScene` 換圖，不重建 |
| 淡入淡出 | 啟用 Pannellum `sceneFadeDuration: 350ms` |
| 快取共用 | 預載與 `mount()` 共用 `panoramaSrcCache` |
| CSS | `is-switching` 只保留輕微模糊（等圖時）；切換過渡交給 `pnlm-fade-img` |

### 主要檔案

- `panorama.js`：`switchPanorama`、`createViewer`、`canSwitchInPlace`
- `style.css`：`.is-switching`、`.pnlm-fade-img`
- `app.js`：預載觸發點（未改邏輯，仍照舊）

### 切換流程（簡圖）

```
openPanoramaViewer / 點熱點切換
  → preloadRelatedPanoramas（相鄰節點）
  → preloadPathPanoramas（若有路徑）
  → PanoramaViewer.mount()
       → preparePanoramaSrc（等圖，命中快取則很快）
       → 已有 viewer？switchPanorama : createViewer
```

---

## 預載入機制（現況）

### 何時觸發

1. **開啟環景**：預載目前節點的 `links` 目標（一跳鄰居）
2. **開啟環景且有路徑**：再預載路徑上**目前站起 3 站**（`PATH_PANORAMA_PRELOAD_AHEAD`）
3. **路徑計算成功**：同樣只預載前 3 站（尚未開環景也會先載）
4. **路徑自動播放**：每前進一站，從該站起再預載 3 站
5. **訪客頁**：起點＋目的地選定後，背景限速 prefetch 路徑前 8 站（2 路並行；地圖定位／GPS 起點除外）

### 核心 API（`panorama.js`）

- `preparePanoramaSrc`：載入 + 快取 + 大圖縮到 4096px
- `preloadPanoramaSrc` / `preloadPanoramaSrcs`：fire-and-forget，錯誤靜默忽略
- `panoramaSrcCache` / `panoramaSrcPending`：去重與共用進行中 Promise

### 注意

- 預載是**非阻塞**的，不會等預載完才 `mount`
- 路徑預載**不會一次載整條**，預設只載 3 站；相鄰節點預載仍只有一跳鄰居
- 環景圖**尚未快取**時，切換會顯示「環景載入中…」遮罩（已快取則不顯示）
- 沒有使用 HTML `<link rel="preload">`

---

## 之後可考慮的改版

- [x] **「目前位置」整段拿掉；校內大致定位＋偏離無法查詢**（清單 18）
- [x] **環景隱藏 Pannellum compass**（清單 19）
- [x] **訪客頁可選是否搭電梯**（`floor` 參數；清單 28）
- [x] **訪客監控改 session 辨識**（清單 23；含 bfcache 心跳）
- [x] **Presence 限流 prune＋access.log 輪替**（清單 24）
- [ ] **公告網址關鍵字改參數級比對**（減低順序／大小寫誤判）
- [ ] **手機 HUD 拖移與環景手勢衝突**評估
- [ ] **自動播放中「關閉」勿直接銷毀環景**（暫緩；清單 29）
- [x] **自動播放中更新側欄路徑引導文案**（清單 30）
- [x] **`go=1` 保留到首次成功開播**（避免重整失效）。清單 31
- [x] **大樓平面圖出口快捷（往校園／跨棟，可拖動）**。清單 35
- [ ] **同名目的地建議顯示再簡化**（如 S302 多處）。清單 33
- [x] **後台一個月內每日訪客數量**（audit 近 30 日；清單 34）
- [ ] 預載更遠節點（例如路徑下一步的鄰居）
- [x] 切換時若圖未快取，顯示輕量 loading 提示（不閃黑）
- [ ] `sceneFadeDuration` 可做成設定值
- [x] 路徑自動播放時，提前預載下下個節點（已以 `PATH_PANORAMA_PRELOAD_AHEAD = 3` 實作）
- [x] 自動播放略過周圍預載；暫停／結束後補載
- [x] 首次公告關閉後才自動播放；結束回饋於最後一站觸發
## 除錯提示

- 切換仍卡：開 DevTools → Network，看目標圖是否已快取命中
- 切換失敗：Console 可能有「環景切換失敗」或 fallback 重建 viewer
- 大圖錯誤：需用 `start-server.bat` 開本地伺服器（CORS / canvas 限制）
