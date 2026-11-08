# glass-light-toggle

玻璃质感日/夜开关 —— 对 [experiments.thisiswhitespace.com/glass-light-toggle](https://experiments.thisiswhitespace.com/glass-light-toggle)（原作 **Zsolt Kacso**）的一比一复刻，封装为**零依赖 Web Component**：`<glass-light-toggle>`。

- 像素月亮/太阳图标在 CPU 上做逐像素弹簧模拟，光栅化为小纹理
- 玻璃折射、磨砂、镜面高光、LED 散射等全部光学效果由单个 **WebGL2 片元着色器**完成
- 支持点击、拖拽（带越界回弹与速度甩动）、键盘操作与无障碍（`role="switch"`）
- 仅依赖浏览器 WebGL2，无任何 npm 依赖，可直接以 `<script type="module">` 引入

## 运行演示

```bash
cd glass-light-toggle
python3 -m http.server 8080
# 浏览器打开 http://127.0.0.1:8080
```

演示页首屏是铺满视口的组件实例（与原页面 1:1），下方为各配置变体与 API 文档。

## 快速开始

```html
<script type="module" src="./glass-light-toggle.js"></script>

<!-- 建议尺寸不小于 480×320：组件会自适应缩放，四周留白用于光晕溢出 -->
<glass-light-toggle style="width:560px;height:400px"></glass-light-toggle>
```

组件为块级元素（`display:block`），画布铺满自身盒子，按容器尺寸自适应缩放，无需其他样式。

## API

### Attributes

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | boolean | `false` | 初始/受控状态；`true` 为「开」（太阳）。外部修改会生效并反映回特性 |
| `path` | `"glass" \| "track"` | `glass` | 光带路径：贴把手环绕 / 沿容器内壁环绕 |
| `zoom` | number | `1` | 相对自适应尺寸的放大倍数（最小 0.5） |
| `moon-color` | `#rrggbb` | `#6f86ff` | 夜（月亮）态灯光颜色 |
| `sun-color` | `#rrggbb` | `#ffa82e` | 昼（太阳）态灯光颜色 |
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
| `themechange` | 滑过明暗中点时触发一次，`e.detail.lit` 表示是否进入亮色主题 |

### 样式挂钩

`::part(canvas)`、`::part(hint)` 可用于外部微调（如提示文字字体）。

## 在框架中使用

### React

```jsx
import { useRef, useEffect, useState } from "react";
import "./glass-light-toggle.js";

function Demo() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const onChange = e => setOn(e.detail.checked);
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);
  return <glass-light-toggle ref={ref} style={{ width: 560, height: 400 }} />;
}
```

> CustomEvent 不经过 React 合成事件系统，用原生 `addEventListener` 监听即可。

### Vue 3

```html
<script setup>
import { ref } from "vue";
import "./glass-light-toggle.js";
const on = ref(false);
</script>

<template>
  <glass-light-toggle style="width:560px;height:400px"
                      :checked="on"
                      @change="on = $event.detail.checked" />
</template>
```

### 原生 JS（受控）

```js
const el = document.querySelector("glass-light-toggle");
el.addEventListener("change", e => console.log(e.detail.checked));
el.checked = true;   // 程序受控切换
el.toggle();
```

## 实现说明（对应原作的移植要点）

| 原实现（standalone/main.js） | 本组件 |
| --- | --- |
| 全屏 canvas，中心取 `window` 尺寸 | 画布铺满组件盒子，中心取元素尺寸（ResizeObserver 自适应） |
| `?zoom=` 查询参数 | `zoom` 属性 |
| 全局 `keydown` 切换 | 画布聚焦后的 `keydown`（不劫持页面其它按键） |
| 直接改 `document.body` 主题类 | 派发 `themechange` 事件，由页面自行联动 |
| 硬编码灯光颜色/路径 | `moon-color` / `sun-color` / `path` 属性，运行时可改 |
| — | 补充 `role="switch"` + `aria-checked`、`change` 事件与受控 `checked` |
| — | 视口外实例自动暂停整个渲染循环（IntersectionObserver，rootMargin 120px）：多实例页面只有可见实例花费 GPU/CPU |

其余（布局常量、像素图标生成、角度配对、弹簧参数、轨道几何、片元着色器）与原实现逐行一致。

## 注意事项

- **需要 WebGL2**（Chrome/Edge/Firefox/Safari 15+ 均支持）；不支持时组件显示回退提示，不影响页面其余部分。
- 演示页请通过本地 HTTP 服务打开（ES module 不允许 `file://` 跨文件加载）。
- 组件会绘制自身的深色/亮色环境底色（原页面观感的一部分）；如需融入自定义背景，建议让容器底色接近 `#0d0d0d`（暗态）。
- 多实例各自持有独立 WebGL 上下文，数量过多时受浏览器上下文上限约束（通常 ≥8 个没问题）；视口外实例已自动暂停渲染，不计入开销。
- 若感觉不流畅，先在常规浏览器里确认：内嵌 webview / 弱 iGPU / Mesa 软件回退等环境会让这个全屏着色器场景掉帧（实测同一台机器上，内嵌 webview 连原版页面也只有约 5fps）。

## 致谢与许可

设计与原始实现版权归 [Zsolt Kacso / thisiswhitespace](https://experiments.thisiswhitespace.com) 所有；本移植仅供学习与内部使用，请勿用于商业再分发。
