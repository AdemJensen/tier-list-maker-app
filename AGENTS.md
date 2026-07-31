# AGENTS.md

本文件是“从夯到拉排名生成器”项目的长期维护指南。后续 AI 在修改代码、界面、文档或安装包前，应先阅读并遵循这里的约定。

## 1. 产品定位

产品名称为：**从夯到拉排名生成器**。

它是一款 Windows / macOS 桌面 Tier List 工具。核心体验是：创建候选项、拖入分档、调整展示样式、导出排名图片。

直播只是使用场景之一，不应再把产品描述为“专门用于直播展示的工具”。README、包描述、界面文案和发布说明都应以“排名生成器”为主基调。

当前品牌标识：

- npm 包名：`tier-list-maker`
- Electron 产品名：`从夯到拉排名生成器`
- Electron App ID：`com.tier-list-maker.app`
- 默认大标题：`从夯到拉排名生成器`
- 默认小标题：`TIER LIST MAKER`

## 2. 不可破坏的核心体验

主界面只包含三部分：

1. 上方工具栏；
2. 中间分档表格；
3. 下方候选列表。

必须长期保持以下行为：

- 主界面始终占满窗口宽高，并随窗口响应式变化。
- 候选项可以在候选列表和任意分档之间拖动。
- 分档内项目过多时自动换行，并撑高当前分档和整张表格。
- 表格内部不得出现横向或纵向滚动条。
- 单个分档增高时，优先压缩其他分档的空白高度；所有分档达到最低高度后，才允许整个页面纵向滚动。
- 主表格和设置预览中的表格边框为直角；外层白色卡片保留圆角。
- 候选卡片的宽高由内容和显示尺寸决定，不能随候选区域高度被拉伸。
- 非方形图片使用 `object-fit: cover`、居中裁切为最大正方形。
- 页面发生滚动时，候选区域不能出现高度计算错误、内容溢出或卡片被截断。

## 3. 工具栏约定

工具栏保留三个主要操作：

- 设置；
- 重置；
- 导出图片。

交互要求：

- 重置按钮使用红色危险样式。
- 重置前必须二次确认。
- 重置只清空排名，将项目移回候选列表；不能删除候选项或设置。
- “导出图片”导出中间榜单区域为 PNG。
- 导出文件默认名称使用“从夯到拉排名生成器-日期.png”。

## 4. 设置面板

设置面板包含三个分类：

- 基本设置；
- 分档/列管理；
- 候选项管理。

### 基本设置

需要支持：

- 分别控制 Logo、大标题、小标题的内容和显隐；
- 大标题同步为网页和应用窗口标题；
- 调整分档字体、候选标签字体和图片尺寸；
- 每个尺寸选项独立恢复默认值。

“当前效果预览”必须位于“显示尺寸”卡片内部，紧跟三个滑块之后。它是普通文档流内容，不吸顶、不悬浮、不带独立阴影。

预览需要同时展示：

- 纯文本候选项；
- 纯图片候选项；
- 图片 + 文本候选项。

预览和主界面必须共享同一组 CSS 尺寸变量。相关变量同时应用到 `document.documentElement` 和 `.app-shell`，因为设置对话框位于 `.app-shell` 外部。

显隐使用原生 `hidden` 属性。全局样式 `[hidden] { display: none !important; }` 是必要的，避免组件自身的 `display` 声明覆盖隐藏行为。

### 分档/列管理

支持修改分档名称、颜色、数量和顺序，并保留“从夯到拉”和“S 到 D”模板。

编辑期间使用草稿状态；用户应用更改后再写入正式状态。删除分档时，其中的候选项必须安全返回候选列表。

### 候选项管理

支持三种候选项：

- `text`：纯文本；
- `image`：纯图片；
- `composite`：图片 + 文本。

候选项管理需要保持以下能力：

- 回车快速添加纯文本，并保持输入框焦点；
- 输入英文逗号时询问是否拆分为多个候选项；
- “本次编辑都按此方式处理”只在当前设置对话框打开期间有效，关闭后重置；
- 纯图片和图片 + 文本支持一次选择多张图片；
- 选择图片后立即显示居中裁切的正方形预览；
- 图片 + 文本默认使用文件名（不含扩展名）作为标签；
- 支持一键按标签文字去重；
- 点击候选项可以编辑标签、替换图片或移除图片；
- 候选列表可选择“横向滚动”或“自动换行并增高”。

Toast 必须显示在设置对话框之上，不能被 `<dialog>` 顶层遮挡。

## 5. 批量导入规则

导入逻辑位于 `src/importers.js`，修改时必须同步运行导入测试。

### Excel

- 支持 `.xlsx`。
- 前 20 行中至少有一行包含表头 `选项名`。
- `选项名` 列下方的非空内容导入为纯文本候选项。

### ZIP

ZIP 中必须包含：

- 一个符合上述格式的 `.xlsx` 文件；
- 一个 `images` 文件夹。

图片文件名（不含扩展名）与选项名相同时，组合为图片 + 文本候选项；没有匹配图片时回退为纯文本。

支持 PNG、JPG/JPEG、GIF、WebP、BMP、AVIF 和 SVG。GIF 不应因为裁切逻辑被转成静态图片。

## 6. 状态和兼容性

核心状态结构：

```text
state
├── tiers
├── candidates
├── pool
├── tierItems
└── preferences
```

约定：

- `candidates` 保存候选项实体；
- `pool` 保存尚未排名的候选项 ID；
- `tierItems` 以分档 ID 为键保存候选项 ID；
- 同一个候选项 ID 只能出现在一个位置；
- 所有载入数据先经过 `normalizeState()`；
- 状态修改优先通过 `commit()`、`schedulePersist()` 和既有渲染函数完成；
- 不要绕过规范化逻辑直接拼接持久化数据。

本地数据存储在 IndexedDB。以下旧标识是**有意保留的兼容层**，不要仅为统一命名而修改：

- IndexedDB 名称：`live-tier-board`；
- Electron `userData` 目录：`直播分档榜`。

它们保证产品改名后仍能读取旧版本地榜单和设置。若未来必须更改，需要先实现可靠的数据迁移和回滚方案。

## 7. 代码结构

- `src/main.js`：应用状态、主界面渲染、拖拽、设置面板和交互逻辑。
- `src/styles.css`：全部视觉样式、响应式布局和尺寸变量。
- `src/storage.js`：IndexedDB 读写。
- `src/importers.js`：Excel / ZIP 解析和图片匹配。
- `src/icons.js`：内置 SVG 图标。
- `electron/main.cjs`：桌面窗口、生命周期和 PNG 导出。
- `electron/preload.cjs`：受限的渲染进程桥接 API。
- `index.html`：Vite 入口和默认页面标题。
- `README.md`：面向用户的产品说明。
- `docs/screenshots/`：README 使用的界面截图。
- `outputs/`：供用户下载的安装包和使用说明，不纳入 Git。
- `work/`：测试脚本和临时文件，不纳入 Git。

项目使用原生 JavaScript、DOM API、CSS 和 Electron，不要在没有明确收益时引入前端框架或大型 UI 依赖。

## 8. 样式和响应式原则

- 优先修改现有 CSS 变量和布局规则，避免用 JavaScript 计算视觉尺寸。
- `.app-shell` 负责整个页面滚动；`.tier-board` 和 `.tier-dropzone` 保持 `overflow: visible`。
- 分档项目使用 Flexbox 换行，不建立表格内部滚动容器。
- 候选卡片保持 `flex: 0 0 auto`，防止被父容器拉伸或压缩。
- 图片和复合卡片尺寸由 `--candidate-image-size`、`--candidate-image-plain-size` 控制。
- 小窗口下优先缩短工具栏文字和设置侧栏，不牺牲拖拽区域的可用性。
- 当前桌面窗口最小宽度为 560px；修改断点或最小宽度时需要实际测试。
- `<dialog>`、Toast 和确认框涉及浏览器顶层渲染，调整 `z-index` 前必须做真实交互验证。

## 9. Electron 约定

- macOS 关闭最后一个窗口后直接 `app.quit()`，不继续驻留 Dock。
- `contextIsolation`、`sandbox` 保持开启，`nodeIntegration` 保持关闭。
- 渲染进程只能通过 `preload.cjs` 暴露的最小 API 调用桌面能力。
- 不要把任意文件系统能力直接暴露给页面。
- 产品改名时，包名、版本、描述、App ID、Product Name、窗口标题、HTML 标题、默认偏好和导出文件名必须同步检查。

## 10. README 和截图

README 的写作基调是“排名生成器”，功能特性应描述用户能力，不要写成按钮位置或内部实现说明。

推荐结构：

1. 一句话产品介绍；
2. 主界面截图；
3. 精炼的功能特性；
4. 设置和候选项截图；
5. 使用步骤；
6. 导入格式；
7. 本地运行与构建。

当前截图为 1280×960 JPEG：

- `docs/screenshots/main-interface.jpg`；
- `docs/screenshots/customization-settings.jpg`；
- `docs/screenshots/candidate-management.jpg`。

更新截图时：

- 使用真实应用界面；
- 可以临时加入演示数据，但截图完成后必须移除临时代码；
- 检查文件真实格式与扩展名一致；
- README 使用相对路径；
- 不要在截图中暴露个人文件、路径或隐私数据。

## 11. 验证流程

小改动也至少运行：

```bash
node --check src/main.js
node --check electron/main.cjs
npm run build
git diff --check
```

涉及导入逻辑时运行：

```bash
node work/test-importers.mjs
```

发布前运行完整检查：

```bash
node --check src/main.js
node --check electron/main.cjs
npm run build
node work/test-importers.mjs
npm audit --omit=dev --cache work/npm-cache
git diff --check
```

涉及界面的改动需要在本地预览中验证：

- 使用全新端口测试默认状态，避免旧 IndexedDB 偏好掩盖默认值；
- 操作前读取当前 DOM 状态；
- 检查真实计算样式，而不只检查属性；
- 检查浏览器控制台的 warning / error；
- 验证后关闭测试页和本地服务。

重点回归场景：

- Logo、标题和小标题显隐；
- 三个显示尺寸滑块和实时预览；
- 大量项目造成的换行、分档增高和页面滚动；
- 候选列表横向滚动与自动换行；
- 图片正方形裁切；
- 设置对话框内 Toast；
- 重置确认；
- Excel / ZIP 导入；
- macOS 关闭窗口退出应用。

## 12. 版本和打包

对用户可见的功能、行为、品牌或安装包发生变化时，更新：

- `package.json` 版本；
- `package-lock.json` 顶层版本；
- `outputs/使用说明.md` 中的版本和文件名。

macOS 双架构 ZIP：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false \
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
npx electron-builder --mac zip --arm64 --x64
```

Windows x64 便携版：

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false \
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npx electron-builder --win portable --x64
```

交付文件命名：

```text
release/v<version>/
├── v<version>-win-x64.exe
├── v<version>-mac-arm64.zip
└── v<version>-mac-x64.zip
```

发布前验证：

- 两个 macOS ZIP 均可通过 `unzip -t`；
- ZIP 内 `.app` 名称、`CFBundleDisplayName`、`CFBundleIdentifier` 和版本正确；
- Windows 文件为有效 PE 可执行文件；
- 记录 SHA-256；
- 当前安装包未做 Apple / Windows 商业证书签名，使用说明中必须保留首次运行提示。

## 13. 工作方式

- 先检查现有工作区状态，保留用户未提交的改动。
- 只修改任务相关文件，不顺手重构无关代码。
- 文本修改使用 `apply_patch`。
- 搜索优先使用 `rg`。
- 不使用破坏性 Git 或文件删除命令。
- 修复布局问题时同时验证主界面、设置预览和窄窗口。
- 完成后报告实际验证结果，不把“代码看起来正确”当成测试通过。

## 14. 完成定义

一项工作只有在以下条件全部满足后才算完成：

- 用户请求的行为已实现；
- 不可破坏的核心体验仍成立；
- 兼容性标识未被误删；
- 相关自动检查通过；
- 需要时完成真实 UI 验证；
- 文档、版本和安装包与代码保持一致；
- 临时服务、测试页面和临时代码已清理。
