export const Schema = z.object({
  // --- 世界环境 ---
  世界: z.object({
    当前日期: z.string().prefault('待定'),
    当前地点: z.string().prefault('待定'),
    时代新闻: z.string().prefault('待定'),
    行业新闻: z.string().prefault('待定'),
    八卦新闻: z.string().prefault('待定'),
  }),

  // --- 主角档案 ---
  主角: z.object({
    姓名: z.string().prefault('待定'),
    性别: z.string().prefault('待定'),
    国籍: z.string().prefault('待定'),
    生日: z.string().prefault('待定'),
    _年龄: z.coerce.number().prefault(0),
    外貌: z.string().prefault('待定'),
    职业: z.string().prefault('待定'),
    性癖: z.string().prefault('无'),
  }),

  // --- 职业履历 ---
  职业履历: z.object({
    作品名: z.array(z.string()).prefault([]),
    获取奖项: z.array(z.string()).prefault([]),
  }),

  // --- 行业评估 ---
  专业评估: z.object({
    当前咖位: z.string().prefault('无'),
    业务能力: z.string().prefault('无'),
    媒体风向: z.string().prefault('无'),
    社会风评: z.string().prefault('无'),
    粉丝基础: z.string().prefault('无'),
  }),

  //--- 个人账户 ---
  个人账户: z
    .object({
      月度固定收入: z.coerce.number().prefault(0).describe('每月固定收入总和：工资、租金收入、投资分红等'),
      月度固定支出: z.coerce.number().prefault(0).describe('每月固定支出总和：房租、贷款月供、生活费等'),

      // === 一次性变动（AI 可写）===
      私账一次性变动: z.coerce.number().prefault(0).describe('本轮一次性收支净变动（正数=收入，负数=支出）'),

      // === 其他信息（AI 可写）===
      合约状态: z.string().prefault('无'),

      // 持有资产：分三类，格式为「资产描述@数量@购入总价」
      持有资产: z
        .object({
          房产: z.array(z.string()).prefault([]),
          车辆: z.array(z.string()).prefault([]),
          股票: z.array(z.string()).prefault([]),
        })
        .prefault({})
        .describe('格式：资产描述@数量@购入总价（人民币）'),

      // === 只读（脚本计算）===
      _现金: z.coerce.number().prefault(0),
    })
    .prefault({}),

  //--- 公司账户 ---
  公司账户: z
    .object({
      // 运行项目：记录公司正在运营的业务线/产品线，用于计算经营性收入（月毛利由脚本计算）
      运行项目: z
        .record(
          z.string().describe('业务线名称'),
          z.object({
            项目范围: z
              .string()
              .prefault('待定')
              .describe('项目范围（简短文本，描述该项目目前涵盖的业务边界与适用场景）'),
            月销量: z.coerce
              .number()
              .prefault(0)
              .describe('规模指标(volume)：按量计费=本月销量；订阅=本月活跃/付费用户数(user base)'),
            单价: z.coerce
              .number()
              .prefault(0)
              .describe('单位收益(unit value)：按量计费=每次/每件平均收入；订阅=每用户每月平均收入(ARPU)'),
            可变成本率: z.coerce
              .number()
              .transform(v => _.clamp(v, 0, 1))
              .prefault(0.3)
              .describe('每单位销售的可变成本占比，0.0~1.0'),
            _月毛利: z.coerce.number().prefault(0).describe('由脚本计算：月销量 * 单价 * (1 - 可变成本率)'),
          }),
        )
        .prefault({})
        .describe('公司正在运营的业务线/产品线，用于计算经营性收入'),

      // 固定成本：扩展为4个子项
      固定成本: z
        .object({
          人力成本: z.coerce
            .number()
            .prefault(0)
            .describe('Monthly fixed payroll and staff-related costs (operating expenses: mainly R&D / S&M / G&A).'),
          场地成本: z.coerce
            .number()
            .prefault(0)
            .describe('Office / studio rent and facility utilities (operating expenses: usually classified as G&A).'),
          营销预算: z.coerce
            .number()
            .prefault(0)
            .describe(
              'Monthly fixed marketing spend such as ads and promotions (operating expenses: selling & marketing, S&M).',
            ),
          其他运营: z.coerce.number().prefault(0).describe('软件订阅、设备折旧等'),
        })
        .prefault({}),

      公账一次性变动: z.coerce.number().prefault(0).describe('本轮非经营性资金流动（正数=收入，负数=支出）'),

      _现金: z.coerce.number().prefault(0),
    })
    .prefault({}),

  // --- 社交网络 ---
  人脉: z.object({
    社交版图: z.array(z.string()).prefault(['无']),
    近期互动: z.array(z.string()).describe('最近有过关键交互的人').prefault(['无']),
    关系簿: z.record(z.string(), z.coerce.number()).prefault({}),
  }),

  // --- 特殊机制 ---
  蝴蝶效应: z.object({
    已抹除列表: z.record(z.string(), z.string().describe('原作者')).prefault({}),
  }),
});
