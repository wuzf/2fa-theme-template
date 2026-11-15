# 2FA 主题模板

[English](README.en.md)

这是为 [2FA](https://github.com/wuzf/2fa) 制作**完整前端主题**（v2「app」主题：`themeApiVersion: 2`、`kind: "app"`、SDK API 1）的起步模板。它已经是一个可以安装使用的主题：账户列表（分组 / 平铺、搜索、排序、服务筛选）、当前码与下一个码的复制、倒计时、HOTP 计数器及其异常处理、每个账户的菜单、「管理」页、各种状态提示、版本与项目链接、15 种语言、浅色与深色、键盘操作。外观刻意保持朴素，方便你改成自己的风格。

需要 2FA 2.0.0 或更高版本。

## 1. 准备

- [Node.js](https://nodejs.org/) 20 或更高版本
- [git](https://git-scm.com/)

## 2. 创建自己的仓库

在 GitHub 打开本模板，点 **Use this template → Create a new repository**；或者直接克隆：

```sh
git clone https://github.com/wuzf/2fa-theme-template my-2fa-theme
cd my-2fa-theme
```

然后把 `LICENSE` 里的 `Copyright (c) 2026 2FA Theme Contributors` 改成你自己的名字。

## 3. 安装依赖

```sh
npm ci
```

## 4. 打开开发壳

```sh
npm run dev
```

浏览器打开 <http://127.0.0.1:4201>（端口被占用时用 `PORT=4300 npm run dev`）。开发壳用的是**合成数据**：示例账户、模拟时钟、只记录调用而不真正复制或保存，主机文案也只有英文。它方便你快速调整布局，但不是真实安装，最后一定要在真实实例里检查（第 10 步）。

页面顶部的链接可以切换深色、中文、紧凑，以及加载中、空列表、读取失败、已退出、登录未确认、离线和待同步、隐藏账户、HOTP 待核对等状态；也可以直接在地址后加参数，例如 `?state=offline&scheme=dark&lang=zh-CN`。

## 5. 项目结构：该改哪里

| 路径                    | 作用                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `theme.config.js`       | 主题清单：id、名称、版本、作者、简介、样式文件和主题设置。**先改这里。**                 |
| `src/theme.js`          | 整个界面：页面结构、账户卡片、状态提示、事件。标着 `Customise:` 的地方是为修改准备的。   |
| `src/menu.js`           | 「管理」页有哪些分组、每组放哪些主机功能、按什么顺序。想做有自己风格的菜单就改这个文件。 |
| `src/i18n.js`           | 主题自己的文字（15 种语言），以及用到的主机文案键和英文后备。                            |
| `src/hostAppearance.js` | 主机自己的弹窗、菜单和提示用什么颜色、圆角和字体，与 `tokens.css` 保持一致。             |
| `src/styles/tokens.css` | 颜色、字体、间距等变量；浅色和深色各一套。                                               |
| `src/styles/theme.css`  | 布局和组件样式。                                                                         |
| `dev/`                  | 开发壳，不会打进主题包。                                                                 |
| `scripts/`              | 构建、开发服务器、主机校验和测试脚本。                                                   |
| `tests/`                | 测试。                                                                                   |

建议的第一轮修改：

1. 在 `theme.config.js` 里改 `id`、`name`、`author`、`description`，`version` 从 `0.1.0` 开始。`id` 一旦发布就不要再改：它代表这个主题系列。
2. 把 `src/theme.js` 里的路由 `#/theme/my-2fa-theme/` 改成 `#/theme/你的id/`，`package.json` 的 `name` 也一并改掉。
3. 在 `src/styles/tokens.css` 和 `src/hostAppearance.js` 里换成你的配色（两处要一致，测试会对比）。
4. 类名前缀 `tpl-` 可以整体替换成你自己的前缀，记得 JS、CSS 和测试一起换。

## 6. 会导致主题被拒或出故障的规则

- **不要自己计算验证码。** 只显示快照里的 `otp.current` / `otp.next`。复制时在同一次点击里调用 `sdk.otp.readCopyTarget()` 和 `sdk.otp.copy()`，中间不能 `await`，票据原样传回，不要缓存、复制或拼装。
- **所有修改都走主机流程。** 添加、编辑、删除、导入导出、设置、登录退出都用 `sdk.host.open()` 打开主机弹窗，不要自己请求 `/api/`。
- **HOTP 不要自动重试。** 结果未知或待核对时只显示状态，由用户点击「核对计数器状态」（`sdk.otp.reconcile()`）。
- **不加载任何远程资源。** 不用 CDN、远程字体、图片、CSS 或 JS；依赖都要打包进主题。包里只允许 JS、CSS、JSON、PNG、JPEG、WebP、GIF、WOFF2，以及 `licenses/` 下的 TXT；不能有 HTML、SVG 或 source map。
- **主题包是公开的。** 包里的所有文件在发布后都能被访问，不要放密钥、令牌或个人数据。
- **样式限定在主题根节点**（`.tpl-theme`）内，不影响主机弹窗。`:hover` 只能写在 `@media (hover: hover)` 里，并在 `@media (hover: none)` 里配一条同样选择器的 `:active`；保留 `[hidden] { display: none !important }` 和可见的 `:focus-visible`。
- **15 种语言。** 主题自己的文字要提供全部 15 种语言；主机功能的名称用 `sdk.i18n.t(key)`。
- **主题设置的标签只是一个字符串。** v2 不支持按语言翻译设置，所以写成 `"信息密度 / Density"` 这样的中英对照。
- **只用自己的路由** `#/theme/<id>/...`；不要注册 Service Worker、清缓存或直接 `location.reload()`，需要刷新时用 `sdk.lifecycle.requestReload()`。
- 未确认登录和已退出时必须显示对应的登录入口，不要用示例数据冒充真实状态。

## 7. 测试

```sh
npm test
```

`npm test` 会把 `tests/` 里的每个文件放在单独的进程里依次运行，每个进程限制 512 MB 内存和 180 秒。不要用 `node --test tests/` 一次跑完整个目录：两个 DOM 元素比较失败时，Node 会打印 happy-dom 的整个对象图，内存会被迅速吃光。只跑名字里含某段文字的文件（同样有内存和时间限制）：

```sh
npm test -- menu-order
```

或者直接运行一个文件，记得带上内存上限：

```sh
node --max-old-space-size=512 --test tests/menu-order.test.js
```

自己写测试时，比较 DOM 元素用 `assert.ok(a === b)`，不要用 `assert.equal(a, b)`。

没有设置 `HOST_ROOT` 时，需要主项目的测试会显示为 skipped（见第 9 步）。格式检查：`npm run format:check`，自动格式化：`npm run format`。

## 8. 构建

```sh
npm run build
```

产物是 `dist/2fa-theme.zip`（主题包）、`dist/2fa-theme.zip.sha256` 和 `dist/2fa-theme.json`（清单）。构建会按实际字节生成文件清单、大小和 SHA-256，同样的源文件每次得到完全相同的 ZIP。`src/` 下的文件全部打包；字体和图片放进 `assets/`，它们的许可证放进 `licenses/`，构建会自动带上；`LICENSE` 会作为 `licenses/LICENSE.txt` 打包。

## 9. 用主项目校验

把 2FA 主项目克隆到模板旁边并安装依赖：

```sh
git clone https://github.com/wuzf/2fa ../2fa
npm ci --prefix ../2fa
```

然后用主项目真正的导入程序检查主题包，并运行连接真实主机脚本的测试：

```sh
HOST_ROOT=../2fa npm run test:host
HOST_ROOT=../2fa npm test
```

Windows PowerShell 写法：

```powershell
$env:HOST_ROOT = '../2fa'
npm run test:host
npm test
```

`test:host` 通过时会输出主题 id 和 `packageId`（包内容的哈希）。

## 10. 真正的检查：导入自己的实例

以上检查都通过后，在你自己的 2FA 实例里：**外观与主题 → 导入主题**，选择 `dist/2fa-theme.zip`。安装后先预览（示例数据，授权 5 分钟），确认后点 **应用外观**。应用后至少检查：

- 320 / 390 / 768 / 1440 宽度，浅色和深色，长名称，切换几种语言；
- 分组 / 平铺和各种排序，搜索与服务筛选；
- 复制当前码和下一个码，HOTP 账户的复制与核对；
- 账户菜单、「管理」页每个入口真的能打开，键盘操作，关闭弹窗后焦点回到原处；
- 编辑保存、离线后的待同步提示、退出与重新登录；
- 出问题时访问 `https://你的域名/?safeMode=1` 可以临时停用主题。

## 11. 发布

主题有两种发布方式，任选其一：

- **自己的主题目录**：建一个公开 GitHub 仓库，`main` 分支根目录放 `catalog.json`，主题包放在 `themes/<id>/2fa-theme.zip`（结构与官方目录相同，可复制官方仓库的 `npm run catalog` 生成索引）。用户在 **外观与主题 → 主题目录** 添加 `所有者/仓库名` 后即可安装。
- **官方社区目录**：按 [wuzf/2fa-theme-mytheme](https://github.com/wuzf/2fa-theme-mytheme) 的 CONTRIBUTING.md 提交 PR，把 `2fa-theme.zip`、`theme.json` 和 `LICENSE` 放进 `themes/<id>/`。

## 12. 更新主题

沿用同一个 `id`，在 `theme.config.js` 里提高 `version`（SemVer，例如 `0.1.0` → `0.2.0`），重新构建，再重新导入或更新目录里的包。同一个 id 的新包会替换已安装的旧版本。设置项尽量保持 `key` 和类型不变，用户的设置就能保留；新增的 `capabilities` 会让 2FA 不再自动更新这个主题。

## 13. 完整参考

- [完整前端主题与 SDK API 1（THEME_APP_SDK.md）](https://github.com/wuzf/2fa/blob/main/docs/THEME_APP_SDK.md)：挂载接口、包格式、SDK 快照与方法、主机入口、发布前检查清单。
- [自定义主题与外观（THEMES.md）](https://github.com/wuzf/2fa/blob/main/docs/THEMES.md)：安装、主题目录、自动更新和安全模式。

## 许可

模板以 [MIT](LICENSE) 许可发布。使用模板后请把 `LICENSE` 中的版权人改成你自己的名字；添加的字体、图片等第三方素材需要自带许可证，放在 `licenses/` 中。
