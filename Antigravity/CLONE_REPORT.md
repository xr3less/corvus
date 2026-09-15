# original vs clone · 克隆评估报告

## 结论
- 原站 URL: https://pryzm.design/
- 克隆 URL: http://127.0.0.1:8123/pryzm-clone.html
- 自动推断复杂度: L5
- 复刻模式建议: 技术拆解 / 忠实复刻优先
- 自动报告边界: 结构、数量、框架、console 可自动比；传入 visual-diff 后可纳入像素差异分。内容残留和法务仍需审计。

## 技术信号
| 项目 | 原站 | 克隆站 |
|---|---|---|
| title | Pryzm | Background & Visual Studio for Designers | Pryzm | Background & Visual Studio for Designers |
| lang | en | en |
| frameworks | next | none |
| scrollHeight | 9360 | 6755 |
| h1 | Backgrounds nobody else has, in seconds | Backgrounds nobody else has, in seconds |

## 数量对比
| 指标 | 原站 | 克隆站 | 自动评分 |
|---|---:|---:|---:|
| sections | 14 | 23 | 3/5 |
| links | 39 | 29 | 3/5 |
| images | 71 | 30 | 2/5 |
| video | 1 | 0 | 1/5 |
| canvas | 2 | 1 | 2/5 |
| forms | 2 | 2 | 5/5 |
| buttons | 7 | 12 | 3/5 |
| inputs | 2 | 2 | 5/5 |
| interactive | 53 | 43 | 4/5 |
| scripts | 30 | 1 | 1/5 |

## 复刻评分
- 源证据: 3/5
- 结构保真: 4/5
- 视觉保真: 1/5
- 动效/交互: 2/5
- 响应式: 4/5
- 功能完整: 4/5
- 内容替换: 需人工看文案残留
- 法务/部署风险: 需人工核查 license / 素材

## Console
- 原站 console errors: 0
- 克隆 console errors: 0
- 原站 page errors: 0
- 克隆 page errors: 0

## 路由覆盖
- 未提供 route-crawl 结果。多页面站需要传 --original-routes / --clone-routes。


## 交互覆盖
- 未提供 interaction-probe 结果。交互站需要传 --original-interactions / --clone-interactions。


## 截图证据
- 原站侦察: RECON/original-recon.json
- 克隆侦察: RECON/clone-recon.json
- 像素差异: RECON/visual-diff-1440.json
- 像素差异率: 0.5047758636039886
- 原站截图: screenshots\original-1440.png, screenshots\original-768.png, screenshots\original-390.png
- 克隆截图: screenshots\clone-1440.png, screenshots\clone-768.png, screenshots\clone-390.png

## 已知缺口
- 未传入 visual-diff 时，视觉保真需要打开截图人工确认。
- 法务、素材授权、品牌替换完整度需要人工核查。
