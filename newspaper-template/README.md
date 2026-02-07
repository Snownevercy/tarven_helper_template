# Our Company News — 报纸模板

本页面由 Figma 设计稿 [Newspaper Template (Community)](https://www.figma.com/design/emDLLFoPLQK20kX2WzuCpI/Newspaper-Template--Community-?node-id=0-1) 转换而来，为单页、嵌入式使用的 HTML 页面，无脚本、无外部依赖。

---

## 页面结构

- **报头 (`.masthead`)**
  - 顶部一行：左侧期号 `Edition n° 1`，右侧日期，使用 `display: table` 实现左右分布。
  - 主标题 `Our Company News`，上下各一条装饰线 (`.masthead-title-line`)。

- **主内容区 (`.content-columns`)**
  - **左栏 (`.column-left`)**：主文章区，包含两篇文章与一张配图。
    - 文章标题：`.article-title`
    - 正文：`.article p`
    - 图片容器：`.figure-wrap`，使用 `aspect-ratio: 16/10` 控制比例，不写死高度。
    - 图注：`.figure-caption`
  - **右栏 (`.column-right`)**：侧边笑话区 `.aside-joke`，含标题、笑话正文与投稿说明 `.note`。

- **漫画区 (`.comic-section`)**
  - 标题 + 占位块 (`.comic-placeholder`，`aspect-ratio: 4/1`) + 版权信息。

- **投稿区 (`.contribute-section`)**
  - 标题 + 说明文字 + 注意事项 `.note`。

---

## 样式规则

| 用途         | 类名 / 选择器        | 说明 |
|--------------|----------------------|------|
| 整体容器     | `.newspaper`         | `max-width: 100%`，不设高度，适配嵌入容器宽度。 |
| 报头         | `.masthead`          | 居中、底部细线分隔。 |
| 期号/日期    | `.masthead-edition` / `.masthead-date` | `display: table-cell` 实现左右对齐。 |
| 主标题       | `.masthead h1`       | 使用 `clamp()` 做字号响应式。 |
| 双栏         | `.column-left` / `.column-right` | `float` 布局，约 62% / 38% 宽度。 |
| 文章         | `.article`           | 标题 + 段落，底部留白。 |
| 图片区       | `.figure-wrap`       | `aspect-ratio: 16/10`，内部图片 `object-fit: cover`。 |
| 笑话区       | `.aside-joke`        | 浅底、边框，列表用 `li::before` 显示 “—”。 |
| 区块标题     | `.section-title`    | 统一字号与字重。 |
| 漫画占位     | `.comic-placeholder` | `aspect-ratio: 4/1`，虚线框占位。 |
| 备注文字     | `.note`              | 小字号、灰色。 |

- **响应式**：宽度 ≤ 640px 时，左右栏改为块级、各占 100% 宽度，取消 `float`。
- **高度与嵌入**：未使用 `vh`、`min-height` 等会撑高父容器的写法；宽度以 `max-width: 100%` 和比例控制，避免横向滚动。
- **字体**：`Georgia, "Times New Roman", serif`，无外链字体。

---

## 使用说明

- 将 `index.html` 作为完整文档嵌入宿主页面（如 iframe 或服务端包含）即可。
- 配图为占位用 data URI，实际使用时可将 `.figure-wrap img` 的 `src` 替换为真实图片地址；若必须完全无外部资源，可继续使用 data URI 或内联 SVG。
- 漫画区当前为占位块，可替换为四格图片或更多 HTML 结构，保持使用 `aspect-ratio` 控制比例即可。
