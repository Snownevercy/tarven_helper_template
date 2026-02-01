export const Schema = z.object({
  // --- 世界环境 ---
  world: z.object({
    currentDate: z.string().prefault('待初始化'),
    currentLocation: z.string().prefault('待初始化'),
    eraNews: z.string().prefault('待初始化'),
    industryNews: z.string().prefault('待初始化'),
    gossipNews: z.string().prefault('待初始化'),
  }),

  // --- 主角档案 ---
  protagonist: z.object({
    name: z.string().prefault('待初始化'),
    $birthday: z.string().prefault('待初始化'),
    _age: z.coerce.number().prefault(0),
    appearance: z.string().prefault('待初始化'),
    occupation: z.string().prefault('待初始化'),
    kink: z.string().prefault('无'),
  }),

  // --- 职业履历 ---
  career: z.object({
    works: z.array(z.string()).prefault([]),
    industryAwards: z.array(z.string()).prefault([]),
  }),

  // --- 行业评估 ---
  professionalAssessment: z.object({
    currentTier: z
      .enum(['待初始化', '素人', '十八线', '三线', '二线', '一线', '顶流', '天王巨星'])
      .prefault('待初始化'),
    mediaSentiment: z.string().prefault('待初始化'),
    publicReputation: z.string().prefault('待初始化'),
    fanbase: z.string().prefault('待初始化'),
  }),

  //--- 个人账户 ---
  personalAccount: z
    .object({
      monthlyFixedIncome: z.coerce.number().prefault(0).describe('每月固定收入总和：工资、租金收入、投资分红等'),
      monthlyFixedExpense: z.coerce.number().prefault(0).describe('每月固定支出总和：房租、贷款月供、生活费等'),

      // === 一次性变动（AI 可写）===
      oneTimePersonalChange: z.coerce.number().prefault(0).describe('本轮一次性收支净变动（正数=收入，负数=支出）'),

      // === 其他信息（AI 可写）===
      contractStatus: z.string().prefault('待初始化'),

      // 持有资产：分三类，格式为「资产描述@数量@购入总价」
      assets: z
        .object({
          realEstate: z.array(z.string()).prefault([]),
          vehicles: z.array(z.string()).prefault([]),
          stocks: z.array(z.string()).prefault([]),
        })
        .prefault({})
        .describe('格式：资产描述@数量@购入总价（人民币）'),

      // === 只读（脚本计算）===
      _cash: z.coerce.number().prefault(0),
    })
    .prefault({}),

  //--- 公司账户 ---
  companyAccount: z
    .object({
      // 月度收入来源：Key 必须为稳定 ID（id_1, id_2...），勿用中文名称作 Key；显示名用各条的 name 字段
      monthlyRevenueSources: z
        .record(
          z.string().regex(/^id_\d+$/),
          z.object({
            name: z
              .string()
              .prefault('待初始化')
              .describe('业务显示名称，如「影视制作」「代言商务」，可随剧情修改，勿用名称当 record 的 key'),
            _scope: z
              .string()
              .prefault('待初始化')
              .describe('该业务线涵盖的范围与定义（简短文本，用于判断新业务是否归入本条）'),
            monthlyVolume: z.coerce
              .number()
              .prefault(0)
              .describe('规模指标(volume)：按量计费=本月销量；订阅=本月活跃/付费用户数(user base)'),
            unitPrice: z.coerce
              .number()
              .prefault(0)
              .describe('单位收益(unit value)：按量计费=每次/每件平均收入；订阅=每用户每月平均收入(ARPU)'),
            variableCostRate: z.coerce
              .number()
              .transform(v => _.clamp(v, 0, 1))
              .prefault(0.3)
              .describe('每单位销售的可变成本占比，0.0~1.0'),
            _monthlyGrossProfit: z.coerce.number().prefault(0).describe('由脚本计算：月销量 * 单价 * (1 - 可变成本率)'),
          }),
        )
        .prefault({})
        .describe(
          '公司每月经营性收入来源。Key 必须为固定 ID（如 id_1、id_2），勿用业务名称作 Key；业务显示名写在每条 name 字段',
        ),

      // 月度固定支出：每月固定成本，与个人账户「月度固定支出」对称
      monthlyFixedExpenses: z
        .object({
          payroll: z.coerce
            .number()
            .prefault(0)
            .describe('Monthly fixed payroll and staff-related costs (operating expenses: mainly R&D / S&M / G&A).'),
          facilityCost: z.coerce
            .number()
            .prefault(0)
            .describe('Office / studio rent and facility utilities (operating expenses: usually classified as G&A).'),
          marketingBudget: z.coerce
            .number()
            .prefault(0)
            .describe('每月固定营销支出（广告、推广等）；大型一次性活动走公账一次性变动'),
          other: z.coerce.number().prefault(0).describe('每月其他固定支出（软件订阅、设备折旧、保险等）'),
        })
        .prefault({}),

      oneTimeCompanyChange: z.coerce.number().prefault(0).describe('本轮非经营性资金流动（正数=收入，负数=支出）'),

      _cash: z.coerce.number().prefault(0),
    })
    .prefault({}),

  // --- 社交网络 ---
  network: z.object({
    socialMap: z.array(z.string()).prefault(['无']),
    recentInteractions: z.array(z.string()).describe('最近有过关键交互的人').prefault(['无']),
    relationshipBook: z.record(z.string(), z.coerce.number()).prefault({}),
  }),

  // --- 特殊机制 ---
  butterflyEffect: z.object({
    erasedList: z.record(z.string(), z.string().describe('原作者')).prefault({}),
  }),
});
