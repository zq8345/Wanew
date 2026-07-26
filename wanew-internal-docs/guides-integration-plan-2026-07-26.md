# Guides ② 整合迁移计划(2026-07-26)

**范围**:把 rv-off-grid(10)+ mounts(9)+ power(4)+ industrial(6)= **29 篇旧 hub 文章**迁入统一 /guides/ 库。
**性质**:只做结构迁移,不动视觉(标题人话/内容分类/卡摘要/统一顶图 = ③)。
**解决①遗留**:/guides/(总库)与 /guides/marine/(子页)重合 → 迁完 /guides/ 变真"5 主题总库"、marine 页成真子集、MARINE 标签变有用、散在旧 hub 内容归位。

## 1. 文章清单(29)
- **rv-off-grid** 10:ids 25,34,94,721,4356,4362,4370,4371,4372,4383(manifest 已有 slug)
- **mounts** 9:ids 93,4358,4369,4373,4374,4375,4376,4377,4382(manifest 已有 slug)
- **power** 4:ids 35,4353,4357,4384(manifest 已有 slug)
- **industrial** 6:ids 92,4359,4378,4379,4380,4381(**manifest 未收,本计划新增 slug**)
- slug 唯一性:52 现有 + 6 新增 = 58,**0 碰撞、0 内部重复**(已验)。marine 保持 29+1dedup 不动。

## 2. 旧 URL → 新 /guides/ URL 映射(逐篇)

### rv-off-grid
| 旧 | 新 |
|---|---|
| /rv-off-grid/25 | /guides/essential-starlink-rv-accessories-full-time-rvers-setup/ |
| /rv-off-grid/34 | /guides/choose-best-starlink-rv-accessories-setup/ |
| /rv-off-grid/94 | /guides/complete-guide-starlink-rv-12v-accessories-compatibility/ |
| /rv-off-grid/721 | /guides/essential-security-solutions-starlink-rv-accessories-mounts-locks/ |
| /rv-off-grid/4356 | /guides/best-starlink-mini-accessories-rv-off-grid-use/ |
| /rv-off-grid/4362 | /guides/starlink-mini-pipe-mount-installation-guide-step-by/ |
| /rv-off-grid/4370 | /guides/power-starlink-mini-solar-panels-complete-12v-dc/ |
| /rv-off-grid/4371 | /guides/best-starlink-mini-cable-management-rv-roof-mounts/ |
| /rv-off-grid/4372 | /guides/winterizing-starlink-mini-cold-weather-accessories-guide/ |
| /rv-off-grid/4383 | /guides/set-up-starlink-mini-rv-camping-complete-guide/ |

### mounts
| 旧 | 新 |
|---|---|
| /mounts/93 | /guides/reliable-mount-solutions-industrial-applications-meeting-global-surge/ |
| /mounts/4358 | /guides/starlink-mount-compatibility-guide-mini-standard-performance/ |
| /mounts/4369 | /guides/starlink-mini-standard-which-mounting-kit-do-need/ |
| /mounts/4373 | /guides/universal-starlink-pipe-mount-complete-installation-compatibility-guide/ |
| /mounts/4374 | /guides/flat-roof-mounting-solutions-starlink-terminals-complete-guide/ |
| /mounts/4375 | /guides/starlink-wall-mount-roof-mount-pros-cons-home/ |
| /mounts/4376 | /guides/install-starlink-mount-without-drilling-non-permanent-solutions/ |
| /mounts/4377 | /guides/starlink-junction-box-installation-outdoor-cable-management/ |
| /mounts/4382 | /guides/wanew-pipe-mount-wall-mount-flat-roof-mount/ |

### power
| 旧 | 新 |
|---|---|
| /power/35 | /guides/power-supply-options-starlink-rv-accessories-explained/ |
| /power/4353 | /guides/wanew-starlink-mini-power-guide-12v-adapters-dc/ |
| /power/4357 | /guides/choose-starlink-mini-12v-power-adapter-setup/ |
| /power/4384 | /guides/starlink-compatible-power-adapters-buyer-guide-12v-dc/ |

### industrial(6·新增 slug·⚠️多为商务内容,见 §6 flag)
| 旧 | 新 |
|---|---|
| /industrial/92 | /guides/industrial-power-supplies-high-efficiency-stable-solutions/ |
| /industrial/4359 | /guides/oem-starlink-compatible-accessories-what-buyers-should-verify/ |
| /industrial/4378 | /guides/bulk-ordering-guide-moq-lead-time-pricing-starlink-mounts/ |
| /industrial/4379 | /guides/custom-starlink-accessory-manufacturing-prototype-to-production/ |
| /industrial/4380 | /guides/quality-control-standards-starlink-compatible-accessories/ |
| /industrial/4381 | /guides/shipping-logistics-how-wanew-delivers-worldwide/ |

## 3. 301 方案(SEO 零损失)
- **逐篇 301**:`/{topic}/{id}` → `/guides/{slug}/`(29 条)。文章为 EN-only(无 es/pt/zh 变体),故文章 301 只需 en 一条/篇。
- **旧 hub index 301**:`/{topic}/` → `/guides/{topic}/`(4 topic × 4 语 = 16 条;旧 hub en/es/pt/zh index 都存在)。
- **CF Pages 机制(marine 已踩过)**:静态文件优先于 _redirects → **必须 git rm 旧产物,301 才生效**。故:git rm 29 篇文章 + 4×4 旧 hub index。
- **执行后 curl 逐条验**:每篇旧 URL 返回 301→新 slug(仿 marine 的 30/30 逐条)。

## 4. 5 类 topic 标签
- marine / rv-off-grid / mounts / power / **industrial**(新增第 5)。
- regen.mjs:`TOPICS` 加 "industrial";`TKEY` 加 industrial→header 键;`active_topics` 设为 5 全开(builder 只建有文章的主题,自动含 5)。
- guides.json:补 `guides.topic.industrial.title/intro`(4 语);rv/mounts/power topic 键 G1 已有。
- nav:Guides 下拉恢复 5 topic(marine+rv+mounts+power+industrial)+ Compatibility + FAQ;footer Guides 列同步。
- filter chip:5 主题 ≥2 → 筛选行自动恢复(builder 已按 ≥2 主题渲染)。①的"/guides/ vs marine 重合"由此消解。

## 5. 卡面"人话短标题"处理思路(⑤·②给思路·③执行)
- **问题**:卡标题堆砌关键词(如"OEM Manufacturing & Custom Branding Services...— Your Trusted Starlink Accessories Manufacturer")不像人话、伤专业。
- **思路(数据模型)**:manifest 每篇加可选 `card_title`(人话短标题,≤~60 字符);卡面 H1 用 `card_title`(缺省回落 `title`);SEO 长标题保留在 `<title>`(meta_title)+ 文章内 H1。这样卡面清爽、SEO 不丢。
- **②本批**:只加数据字段结构预留(不逐篇写短标题);**③逐篇写人话短标题 + 内容按 how-to/buying/comparison 归类**(总工 item③④)。

## 6. ⚠️ Flag 待总工/Joe 定
1. **industrial 6 篇多为商务内容**(OEM 验厂/批发 MOQ/定制量产/QC/物流 + 1 篇工业电源 92)——非 hands-on 攻略,但符合"推进转化"(B2B/OEM 询盘)。②按 industrial 标签迁入;**③是否重归类为"buying/business"类别(呼应你 item④ how-to·buying·comparison)?** 或部分并入其它 topic?
2. **/industrial/92**(工业电源)内容更接近 power topic,是否改挂 power?(现按 industrial 迁)
3. **industrial 作为 topic 名**:marine/rv/mounts/power 是使用场景/品类,industrial 混了场景+商务。③可能重命名(如 "Business & OEM")。
4. 首页 3 张 guide 卡(/power/4384·/rv-off-grid/4383·/mounts/4382)迁后需改指新 slug(避免 301-hop),本批一并改。

## 7. 执行顺序(批准后)
1. manifest 补 industrial 6 条 + 加 card_title 字段结构 → 2. guides.json 补 industrial topic 键(4语)→ 3. regen.mjs TOPICS/TKEY 加 industrial、active_topics 5 全开 → 4. nav/footer 恢复 5 topic → 5. git rm 29 旧文 + 16 旧 hub index → 6. _redirects 加 29+16 条 301 → 7. 首页卡改指新 slug → 8. regen+chrome-sync → 9. 全闸 → 10. commit+push → 11. curl 逐条验(29 篇 301 + 16 hub 301 + 5 topic 页 + /guides/ 5 主题库)。
