### 档案状态栏 stat_data 映射清单（草案）

> 说明：右侧是**当前脚本中采用的默认路径**，你可以直接在这个文件里改成你想要的路径或备注。
> 修改好后告诉我“按 stat_data_mapping.md 更新脚本”，我会用你改过的版本同步更新代码。

---

## 1. 个人档案 Tab（protagonist）

- **姓名**
  - 界面字段：姓名
  - 当前路径：`protagonist.name`
- **年龄**
  - 界面字段：年龄
  - 当前路径：`protagonist._age`
- **出生日期**
  - 界面字段：出生 / 生日
  - 当前路径：`protagonist.$birthday`
- **职业**
  - 界面字段：职业
  - 当前路径：`protagonist.occupation`
- **外貌描述**
  - 界面字段：外貌
  - 当前路径：`protagonist.appearance`
- **位置**
  - 界面字段：位置
  - 当前路径：`world.currentLocation`
- **标注**
  - 界面字段：标注（例如恋物癖）
  - 当前路径：`protagonist.kink`
- **档案编号 / 归档日期**
  - 界面字段：档案编号 / 归档日期
  - 当前：脚本内写死/用XXXX-XX-XX代替
  - 如果你希望有固定字段：请在此注明你想用的路径

---

## 2. 职业履历 Tab（career）

- **当前咖位**
  - 界面字段：当前咖位
  - 当前路径：`professionalAssessment.currentTier`
- **媒体情绪**
  - 界面字段：媒体情绪 / 媒体风向
  - 当前路径：`professionalAssessment.mediaSentiment`
- **公众声誉**
  - 界面字段：公众声誉 / 社会风评
  - 当前路径：`professionalAssessment.publicReputation`
- **粉丝基础**
  - 界面字段：粉丝基础
  - 当前路径：`professionalAssessment.fanbase`
- **代表作品列表**
  - 界面字段：代表作品
  - 当前路径：`career.works[]`
- **荣誉记录列表**
  - 界面字段：荣誉记录
  - 当前路径：`career.industryAwards[]`

---

## 3. 个人账户 Tab（personal）

- **账户余额**
  - 界面字段：Current Balance / 个人账户余额
  - 当前路径：`personalAccount._cash`
- **月固定收入**
  - 界面字段：月固定收入
  - 当前路径：`personalAccount.monthlyFixedIncome`
- **月固定支出**
  - 界面字段：月固定支出
  - 当前路径：`personalAccount.monthlyFixedExpense`
- **本轮一次性变动**
  - 界面字段：本轮一次性变动
  - 当前路径：`personalAccount.oneTimePersonalChange`
- **合约状态**
  - 界面字段：当前合约状态
  - 当前路径：`personalAccount.contractStatus`
- **资产列表**
  - 界面字段：持有资产（房产 / 车辆 / 股票等）
  - 当前读取来源：`personalAccount.assets.realEstate[] / vehicles[] / stocks[]`
  - 当前解析方式：每条字符串按「描述@数量@购入总价」拆分，仅展示**描述**部分
  - 如果你希望区分显示数量/价格：在此写清你偏好的格式
- **账户编号 / 银行名等抬头**
  - 界面字段：银行名称、账户编号等
  - 当前：请写死，编造就可以
  - 如需绑定到 stat_data：请写出你想用的路径

---

## 4. 公司账户 Tab（company）

- **商业账户余额**
  - 界面字段：BUSINESS ACCOUNT / 账户余额
  - 当前路径：`companyAccount._cash`
- **应收账款明细**
  - 界面字段：按月份列出的到期金额
  - 当前路径：`companyAccount.$receivablesByDueMonth`
  - 说明：键为 `YYYY-MM`，值为该月应收金额，脚本按此生成列表
- **应收账款总额**
  - 界面字段：应收账款总数
  - 当前：**脚本对 `$receivablesByDueMonth` 求和计算**，不单独占字段
- **下月到账金额**
  - 界面字段：下月到账
  - 当前：脚本根据 `world.currentDate` 推出“下一个月”的 `YYYY-MM`，再从 `$receivablesByDueMonth` 取
- **月度收入来源表**
  - 界面字段：业务名称 / 规模 / 单价 / 成本率 / 账期 / 毛利
  - 当前来源：`companyAccount.monthlyRevenueSources`
  - 单条字段：
    - `name` — 业务显示名称
    - `_scope` — 业务范围
    - `monthlyVolume` — 月销量/规模
    - `unitPrice` — 单价
    - `variableCostRate` — 可变成本率
    - `$paymentTermMonths` — 账期月数
    - `_monthlyGrossProfit` — 月毛利（脚本计算）
- **月度固定支出**
  - 界面字段：人力成本 / 场地成本 / 营销预算 / 其他支出 / 合计
  - 当前路径：
    - `companyAccount.monthlyFixedExpenses.payroll`
    - `companyAccount.monthlyFixedExpenses.facilityCost`
    - `companyAccount.monthlyFixedExpenses.marketingBudget`
    - `companyAccount.monthlyFixedExpenses.other`
- **公账一次性变动**
  - 界面字段：公账一次性变动 / 本轮变动
  - 当前路径：`companyAccount.oneTimeCompanyChange`
- **报告编号 / 报告日期等抬头**
  - 当前：报告编号随便编一个写死 + 报告日期用`world.currentDate`
  - 如需绑定到其它字段，请在此注明

---

## 5. 社交网络 Tab（network）

- **社交地图标签**
  - 界面字段：IT创业圈 / 文学圈 等
  - 当前路径：`network.socialMap[]`
- **最近关键互动**
  - 界面字段：最近关键互动列表
  - 当前路径：`network.recentInteractions[]`
- **人脉关系簿**
  - 界面字段：姓名 + 好感度/关系值
  - 当前路径：`network.relationshipBook`（键：人物名，值：数值）
  - 当前逻辑：
    - 数值 > 30 → 归为「核心盟友」
    - 数值 < -30 → 归为「潜在敌对」
  - 如果你希望自定义分组规则，请在此写你想要的阈值或分层方式

---

## 6. 世界动态 Tab（world）

- **日期**
  - 界面字段：当前日期
  - 当前路径：`world.currentDate`
- **位置**
  - 界面字段：当前位置
  - 当前路径：`world.currentLocation`
- **时代新闻**
  - 界面字段：时代新闻
  - 当前路径：`world.eraNews`
- **行业新闻**
  - 界面字段：行业新闻
  - 当前路径：`world.industryNews`
- **八卦新闻**
  - 界面字段：八卦新闻
  - 当前路径：`world.gossipNews`
- **（可选）在本 Tab 里顺带展示的行业评估**
  - 如果你希望世界动态页也显示咖位/粉丝等，可以继续用：
    - `professionalAssessment.currentTier`
    - `professionalAssessment.mediaSentiment`
    - `professionalAssessment.publicReputation`
    - `professionalAssessment.fanbase`

---

## 7. 蝴蝶效应 Tab（butterfly）

- **已抹除记录列表**
  - 界面字段：作品标题 + 原作者
  - 当前路径：`butterflyEffect.erasedList`
  - 说明：键 = 作品/事件名，值 = 原作者名
- **系统说明 / 警告文案**
  - 当前：文案写在脚本里（不从 stat_data 读取）
  - 如果你希望这些说明也挂在某个变量下，请在此写出你想用的路径

---

## 使用说明

- 你可以直接在本文件中把「当前路径」那一行改成你想用的路径，或补充备注。
- 改好后告诉我：“按 `stat_data_mapping.md` 更新脚本”，我会：
  - 按你修改后的路径，统一更新 `index.ts` 中 7 个 Tab 的渲染逻辑；
  - 保证 UI 仍然保持 `archive-system.html` 的档案风样式不变。

