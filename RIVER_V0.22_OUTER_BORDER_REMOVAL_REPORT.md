# River v0.22 外层边框移除报告

日期：2026-10-28

## 修改

- 文件：`src/styles/prototype.css`
- 选择器：`#river-app .tmi-panel`
- 修改：把外层边框从 `1px solid var(--tmi-border)` 改为 `1px solid transparent`。

保留 1px 边框盒，因此内层 `.tmi-window` 的宽度、位置、圆角、内边距和三栏布局完全不变；视觉上最外层那一圈边框消失。

未删除外层容器，未修改 `LibraryView.tsx`，未调整 padding、margin、flex/grid。

## 修改前后尺寸（1920×1200，deviceScaleFactor 1）

| 元素 | 修改前 | 修改后 |
|---|---|---|
| `.tmi-window` | x=27, y=97, w=1866, h=1078 | x=27, y=97, w=1866, h=1078 |
| 左侧导航 `.tmi-rail` | x=28, w=190 | x=28, w=190 |
| 中间列表 `.tmi-listcol` | x=218, w=350 | x=218, w=350 |
| 右侧编辑器 `.tmi-preview` | x=568, w=1324 | x=568, w=1324 |

像素差异：6012 个像素，差异包围盒 `(14,84)-(1906,1188)`，正好是外层 `.tmi-panel` 的 1px 边框环，内部内容零变化。

## 截图

- `outputs/river-outer-border-before-after.jpg`

## 未解决问题

无。内层窗口、三栏宽度、编辑器位置均与修改前一致。
