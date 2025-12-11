## 目标
- 在空项目内落地一套可复用的 Playable Ads 小游戏框架，统一生命周期、交互门槛、CTA、静音、预加载、响应式与构建适配。

## 将创建的目录与文件
- `assets/Scenes/Main.scene`：主场景（Canvas、UI 根、遮罩 Gate、计时 Label、CTA 按钮、静音按钮）
- `assets/PlayableFramework/`：框架脚本
  - `PlayableConfig.ts`：统一配置中心（cta 链接、时长、方向、语言、调试）
  - `PlayableEvents.ts`：事件总线（boot、preload、start、first-interaction、cta、timeout、end、mute-changed）
  - `PlayableBridge.ts`：容器桥接与 CTA、结束信号（`postMessage` 回退到链接跳转）
  - `Preloader.ts`：预加载与简单进度条（`resources` bundle 下目录）
  - `Responsive.ts`：竖屏/横屏设计分辨率切换
  - `CTAButton.ts`：按钮组件，触发商店跳转
  - `MuteToggle.ts`：静音开关，持久化 `localStorage`
  - `PlayableApp.ts`：应用入口组件，统一生命周期与首次交互门槛、倒计时
- `assets/Scripts/`：示例接入
  - `GameConfigInit.ts`：在场景加载时设置框架配置
  - `GameController.ts`：示例订阅生命周期事件并承载玩法逻辑
- `.adapterrc`（项目根）：构建适配配置（使用你已有的 playable-ads-adapter 插件）

## 场景搭建
- 创建 `Main.scene` 并加入：
  - `Canvas` 与 UI 根节点
  - `Gate` 遮罩节点（"点击开始"），挂 `PlayableApp.gate`
  - `ProgressBar` 与 `Label`，挂 `Preloader`
  - `Label` 用于倒计时显示，挂 `PlayableApp.timerLabel`
  - `CTAButton` 节点挂 `CTAButton` 组件
  - `MuteToggle` 节点挂 `MuteToggle` 组件并关联一个 `AudioSource`（BGM）
- 在场景根节点挂 `PlayableApp`，关联 `preloader`、`preloadDirs`（如 `images`、`audio`）、`gate`、`timerLabel`、`bgm`。

## 生命周期与交互门槛
- 启动：`Boot` → 预加载：`Preload` → 首次点击门槛：`FirstInteraction` → 开始：`Start`
- 倒计时与结束：超时触发 `Timeout`，统一调用 `PlayableBridge.end('timeout')`
- CTA：所有商店跳转统一走 `PlayableBridge.openStore()`，并发 `CTA` 事件
- 静音：`MuteToggle` 切换、发 `MuteChanged` 事件，音量全局受控

## 响应式与方向
- 配置 `orientation` 为 `portrait` 或 `landscape`，在 `PlayableApp` 启动时应用设计分辨率（720x1280 或 1280x720），`view.resizeWithBrowserSize(true)` 保持自适应。

## 预加载
- 使用 `Preloader.preloadDirs(["images","audio"])` 加载 `resources` 下的目录；进度实时更新到 `ProgressBar/Label`。

## 配置与本地化
- 通过 `setConfig({...})` 注入：`ctaUrl`、`durationSec`、`allowReplay`、`orientation`、`locale`、`debug`。
- 可选：以后接入 `i18n`（你的插件已有 `i18n` 目录），当前先以英文/中文文案在场景内配置。

## 构建与适配
- 在根目录新增 `.adapterrc`：`{"buildPlatform":"web-mobile","skipBuild":false}`，供 `extensions/playable-ads-adapter` 读取。
- 通过编辑器或命令行构建 `web-mobile`；插件在 `onBeforeBuild/onAfterBuild` 钩子做单页 playable 适配。

## 验证流程
- 在编辑器运行：检查首次点击才开始 BGM 与倒计时；CTA 跳转与 `END_PLAYABLE` 消息；静音状态持久化；预加载进度显示。
- 构建后在浏览器打开：验证 `postMessage` 与链接回退；方向与自适应；超时自动结束。

## 交付与后续
- 完成上述文件创建与场景配置后，你即可把不同玩法逻辑仅放入 `GameController` 并订阅事件；框架保持不变。
- 若需要接入广告平台特定 API（如 MRAID），在 `PlayableBridge` 内添加对应分支。

请确认：我将按以上清单创建脚本与主场景、写入 `.adapterrc` 并关联组件，随后进行本地运行与构建验证。