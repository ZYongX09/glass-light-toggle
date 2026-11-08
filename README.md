# glass-toggle

玻璃质感**通用二态开关** —— 对 [experiments.thisiswhitespace.com/glass-light-toggle](https://experiments.thisiswhitespace.com/glass-light-toggle)（原作 **Zsolt Kacso**）的一比一光学复刻，并泛化为零依赖 Web Component：`<glass-toggle>`。

- 点阵图标在 CPU 上做逐像素弹簧模拟并光栅化为纹理，玻璃折射、磨砂、镜面高光、LED 散射全部由单个 **WebGL2 片元着色器**完成
- **默认即通用形态**：深色圆角底板（`plinth`，可嵌任意页面背景）+ 点阵电源符 + 薄荷绿(开)/冷灰(关)灯光 + 固定暗表面
- **图标可换**：内置图标库 / 像素字符串 / 任意 emoji，两态间以整体涡旋 morph 过渡
- 支持点击、拖拽（越界回弹与速度甩动）、键盘与无障碍（`role="switch"`）；视口外实例自动暂停渲染

> **破坏性变更**：v1.1 起 `<glass-light-toggle>` 更名为 `<glass-toggle>`，默认形态改为通用开关；日/夜场景保留为 `preset="day-night"`。见文末迁移表。

## 运行演示

```bash
cd glass-light-toggle   # 目录/仓库名保持不变
python3 -m http.server 8080
# 浏览器打开 http://127.0.0.1:8080
```

演示页首屏是 `preset="day-night"` 的全屏日/夜场景（与原版观感一致），下方为通用形态与各变体、API 文档、迁移表。

## 快速开始

```html
<script type="module" src="./glass-toggle.js"></script>

<!-- 通用默认：任意页面直接放，深色底板自带羽化透明边 -->
<glass-toggle style="width:560px;height:360px"></glass-toggle>

<!-- 日/夜场景（原版观感）：建议铺满视口或放在深色容器里 -->
<glass-toggle preset="day-night" style="width:100vw;height:100vh"></glass-toggle>
```

组件为块级元素，画布铺满自身盒子并按容器尺寸自适应缩放。

## 默认值（通用开关取向）

| 参数 | 通用默认 | 日/夜预设（`preset="day-night"`） |
| --- | --- | --- |
| `surface` | `plinth`（圆角底板 + 透明羽化边） | `scene`（全场景环境底色） |
| `theme` | `dark`（固定暗表面） | `auto`（表面明暗跟随开关，页面过中点交叉渐变） |
| `on-icon` / `off-icon` | `power` / `power` | `sun` / `moon` |
| `on-color` / `off-color` | `#34d399` / `#7c8598` | `#ffa82e` / `#6f86ff` |

`preset` 只提供基底值，任何显式设置的属性都优先于它。

## 图标语法（`on-icon` / `off-icon`）

三种写法，运行时可改（修改属性即重建 morph 配对）：

1. **内置名**：`moon` `sun` `power` `play` `pause` `heart` `bell` `lock` `star` `check` `plus` `wifi`
2. **像素字符串**：以 `/` 分行的点阵，`#`=亮、`+`=半亮(0.55)、`*`=闪烁星、`.`=空，自动居中：
   ```html
   <glass-toggle off-icon="....#..../...###.../..#####../.#######./#########/...###.../...###.../...###..."
                 on-icon="...###.../...###.../...###.../#########/.#######./..#####../...###.../....#....">
   </glass-toggle>
   ```
3. **emoji/短文本**：其它 1–2 字符按 emoji 处理，离屏 canvas 采样 alpha 成点阵（字形随平台字体略有差异）：
   ```html
   <glass-toggle off-icon="🌙" on-icon="☀️"></glass-toggle>
   ```

## API

### Attributes

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | boolean | `false` | 初始/受控状态；外部修改会生效并反映回特性 |
| `on-icon` / `off-icon` | string | `power` / `power` | 开/关态图标（语法见上） |
| `on-color` / `off-color` | `#rrggbb` | `#34d399` / `#7c8598` | 开/关态灯光颜色 |
| `theme` | `"auto" \| "dark" \| "light"` | `dark` | 表面明暗：`auto` 跟随开关位置（日/夜行为），其余固定 |
| `surface` | `"plinth" \| "scene"` | `plinth` | `plinth`＝圆角底板+透明羽化边；`scene`＝全场景环境底色（铺满元素盒） |
| `preset` | `"day-night"` | — | 一键日/夜预设 |
| `disabled` | boolean | `false` | 禁用交互、灯光转暗、`aria-disabled` |
| `path` | `"glass" \| "track"` | `glass` | 光带路径：贴把手环绕 / 沿容器内壁环绕 |
| `zoom` | number | `1` | 相对自适应尺寸的放大倍数（最小 0.5） |
| `hint` | string | 自动 | 底部提示文字；自动为 `Click or drag`（触屏 `Tap or drag`）；`"none"` 隐藏 |
| `label` | string | — | 无障碍 `aria-label` |

### Properties / 方法

| 成员 | 说明 |
| --- | --- |
| `el.checked` | 读写当前开关状态（boolean） |
| `el.toggle()` | 切换开关 |

### Events（均可冒泡、可穿越 Shadow DOM）

| 事件 | 说明 |
| --- | --- |
| `change` | 切换后触发，`e.detail.checked` 为新状态 |
| `themechange` | 仅 `theme="auto"`：表面明暗跨界时触发一次，`e.detail.lit` 表示是否进入亮色 |

### 样式挂钩

`::part(canvas)`、`::part(hint)`。

## 在框架中使用

### React

```jsx
import { useRef, useEffect, useState } from "react";
import "./glass-toggle.js";

function Demo() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const onChange = e => setOn(e.detail.checked);
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);
  return <glass-toggle ref={ref} style={{ width: 560, height: 360 }} />;
}
```

> CustomEvent 不经过 React 合成事件系统，用原生 `addEventListener` 监听即可。

### Vue 3

```html
<script setup>
import { ref } from "vue";
import "./glass-toggle.js";
const on = ref(false);
</script>

<template>
  <glass-toggle style="width:560px;height:360px"
                :checked="on"
                @change="on = $event.detail.checked" />
</template>
```

### 原生 JS（受控）

```js
const el = document.querySelector("glass-toggle");
el.addEventListener("change", e => console.log(e.detail.checked));
el.checked = true;   // 程序受控切换
el.toggle();
el.setAttribute("on-icon", "check");   // 运行时换图标
```

## 实现说明（相对原作的移植与改造）

| 原实现（standalone/main.js） | 本组件 |
| --- | --- |
| 全屏 canvas，中心取 `window` 尺寸 | 画布铺满组件盒子，中心取元素尺寸（ResizeObserver 自适应） |
| `?zoom=` 查询参数 | `zoom` 属性 |
| 全局 `keydown` 切换 | 画布聚焦后的 `keydown`（不劫持页面其它按键） |
| 直接改 `document.body` 主题类 | `theme="auto"` 时派发 `themechange`，由页面自行联动 |
| 硬编码月亮/太阳点阵 | 精灵系统：内置库 / 像素串 / emoji 采样，`pairUp(A, B)` 按扫掠角任意配对 |
| 页面明暗 = 把手位置的函数 | `uTheme` 由 `theme` 策略供给（auto 跟随 / dark / light 固定） |
| 页面背景画满整屏 | `surface` 策略：`scene`（原样）或 `plinth`（着色器输出 alpha，圆角底板 + 26px 羽化） |
| — | 补充 `role="switch"` + `aria-checked`、`change` 事件、受控 `checked`、`disabled` |
| — | 视口外实例自动暂停渲染（IntersectionObserver，rootMargin 120px） |

轨道几何、LED 环绕数学、弹簧参数、片元着色器光学与原实现逐行一致。

## 注意事项

- **需要 WebGL2**（Chrome/Edge/Firefox/Safari 15+ 均支持）；不支持时组件显示回退提示，不影响页面其余部分。
- 演示页请通过本地 HTTP 服务打开（ES module 不允许 `file://` 跨文件加载）。
- `surface="scene"` 会绘制自身环境底色（日/夜场景的一部分）；嵌入任意背景请用默认的 `plinth`。
- emoji 图标字形随平台字体不同而有差异；图片 URL 图标暂不支持（CORS/画布污染限制）。
- 多实例各自持有独立 WebGL 上下文（浏览器通常 ≥8 个没问题）；视口外实例已自动暂停，不计开销。
- 若感觉不流畅，先在常规浏览器里确认：内嵌 webview / 弱 iGPU / Mesa 软件回退等环境会让这个全屏着色器场景掉帧（实测同一台机器上，内嵌 webview 连原版页面也只有约 5fps）。

## 从 glass-light-toggle 迁移

| 旧 | 新 |
| --- | --- |
| `<glass-light-toggle>` | `<glass-toggle preset="day-night">`（观感一致） |
| `moon-color` / `sun-color` | `off-color` / `on-color` |
| 默认全屏场景 + 页面明暗联动 | 默认为通用形态；`preset="day-night"` 或 `surface="scene" theme="auto"` 恢复 |
| `change` / `themechange` / 拖拽 / 键盘 / `zoom` / `hint` / `label` / `path` | 不变 |

## 致谢与许可

设计与原始实现版权归 [Zsolt Kacso / thisiswhitespace](https://experiments.thisiswhitespace.com) 所有；本移植与通用化改造仅供学习与内部使用，请勿用于商业再分发。
