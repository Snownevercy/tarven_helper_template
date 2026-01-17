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
    配偶: z.string().prefault('无'),
    子女: z.string().prefault('无'),
    情人: z.string().prefault('无'),
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
      现金: z.coerce.number().prefault(0),
      合约状态: z.string().prefault('无'),
      // 修正：资产量化
      持有资产: z
        .record(
          z.string(),
          z.object({
            数量: z.coerce.number().prefault(0),
          }),
        )
        .prefault({})
        .describe('Key:资产名称'),
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
            月销量: z.coerce.number().prefault(0).describe('月销量/月活'),
            单价: z.coerce.number().prefault(0).describe('单价/ARPU'),
            边际成本率: z.coerce
              .number()
              .transform(v => _.clamp(v, 0, 1))
              .prefault(0.5),
            _月毛利: z.coerce.number().prefault(0).describe('由脚本计算：月销量 * 单价 * (1 - 边际成本率)'),
          }),
        )
        .prefault({})
        .describe('公司正在运营的业务线/产品线，用于计算经营性收入'),

      固定成本: z
        .object({
          人力成本: z.coerce.number().prefault(0),
          房租: z.coerce.number().prefault(0),
        })
        .prefault({}),

      公账一次性变动: z.coerce
        .number()
        .prefault(0)
        .describe('非经营性资金流动，主营业务收入不计入（正数=收入，负数=支出）'),

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
