/**
 * 状态栏渲染：获取 MVU 数据、按路径取值、各 Tab 的 HTML 渲染
 */

import { Schema } from '../../schema';

export type SchemaData = z.infer<typeof Schema>;

/** 当前咖位合法枚举值，与 schema 中 professionalAssessment.currentTier 一致 */
const VALID_CURRENT_TIERS = [
  '待初始化',
  '素人',
  '十八线',
  '三线',
  '二线',
  '一线',
  '顶流',
  '天王巨星',
] as const;

/**
 * 解析前规范化 stat_data：AI 或世界书可能写出不在 enum 内的值（如空串、空格、错别字），
 * 统一为合法值以免 Schema.parse 抛错。
 */
function normalizeStatDataBeforeParse(raw: Record<string, unknown>): Record<string, unknown> {
  const data = _.cloneDeep(raw);
  const tier = _.get(data, 'professionalAssessment.currentTier');
  if (tier !== undefined && tier !== null && !VALID_CURRENT_TIERS.includes(tier as (typeof VALID_CURRENT_TIERS)[number])) {
    _.set(data, 'professionalAssessment.currentTier', '待初始化');
  }
  return data;
}

export function getMvuDataSafe(): SchemaData {
  // 优先用 Mvu.getMvuData（MVU 框架接口）
  try {
    if (typeof Mvu !== 'undefined' && typeof Mvu.getMvuData === 'function') {
      const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      if (variables && variables.stat_data) {
        return Schema.parse(normalizeStatDataBeforeParse(variables.stat_data));
      }
    }
  } catch (e) {
    console.warn('获取 MVU 数据失败 (Mvu.getMvuData):', e);
  }
  // 回退：用酒馆助手 getVariables 读当前消息楼层变量（脚本在 iframe 时 Mvu 可能拿不到父页数据）
  try {
    if (typeof getVariables === 'function') {
      const messageVars = getVariables({ type: 'message', message_id: 'latest' });
      if (messageVars && _.has(messageVars, 'stat_data')) {
        const statData = _.get(messageVars, 'stat_data') as Record<string, unknown>;
        return Schema.parse(normalizeStatDataBeforeParse(statData));
      }
    }
  } catch (e) {
    console.warn('获取 MVU 数据失败 (getVariables):', e);
  }
  try {
    return Schema.parse({});
  } catch {
    // Schema 顶层无 prefault 时 parse({}) 会抛错，返回空对象供 getVal 取默认值
    return {} as SchemaData;
  }
}

export function getVal<T = unknown>(data: SchemaData | null | undefined, path: string, def: T = '无' as T): T {
  if (!data) return def;
  let current: unknown = data;
  try {
    const keys = path.split('.');
    for (const key of keys) {
      if (current === undefined || current === null) return def;
      current = (current as Record<string, unknown>)[key];
    }
    return (current !== undefined && current !== null && current !== '' ? current : def) as T;
  } catch (e) {
    return def;
  }
}

interface MonthlyRevenueSource {
  name?: string;
  monthlyVolume?: number;
  unitPrice?: number;
  _monthlyGrossProfit?: number;
  variableCostRate?: number;
}

export const renderModules: Record<string, (sd: SchemaData) => string> = {
  home(sd) {
    const name = getVal(sd, 'protagonist.name', '未知');
    const age = getVal(sd, 'protagonist._age', 0);
    const ageStr = age > 0 ? `${age}岁` : '未知';
    const birthday = getVal(sd, 'protagonist.$birthday', '待初始化');
    const appearance = getVal(sd, 'protagonist.appearance', '待初始化');
    const job = getVal(sd, 'protagonist.occupation', '待初始化');

    const personalCash = getVal(sd, 'personalAccount._cash', 0);
    const monthlyIncome = getVal(sd, 'personalAccount.monthlyFixedIncome', 0);
    const monthlyExpense = getVal(sd, 'personalAccount.monthlyFixedExpense', 0);
    const contractRaw = getVal(sd, 'personalAccount.contractStatus', '待初始化');
    const assets = getVal(sd, 'personalAccount.assets', {} as Record<string, unknown>);

    const renderContract = (contractStr: string): string => {
      if (!contractStr || contractStr === '无' || contractStr === '待初始化')
        return contractStr === '无' ? '无' : '待初始化';
      const contracts = contractStr
        .split(/[;；]/)
        .map(c => c.trim())
        .filter(c => c);
      if (contracts.length === 0) return '无';
      if (contracts.length === 1) return contracts[0];
      return contracts.map(c => `<div style="margin-bottom:2px;">${c}</div>`).join('');
    };
    const contract = renderContract(contractRaw);

    const renderAssets = (assetsObj: Record<string, unknown>): string => {
      if (!assetsObj || typeof assetsObj !== 'object') return '无';
      const categories = ['realEstate', 'vehicles', 'stocks'];
      const items: string[] = [];
      for (const cat of categories) {
        const arr = assetsObj[cat];
        if (Array.isArray(arr) && arr.length > 0) {
          for (const item of arr) {
            if (typeof item === 'string' && item.trim()) {
              const parts = item.split('@');
              items.push(parts[0] || item);
            }
          }
        }
      }
      return items.length > 0 ? items.join('、') : '无';
    };
    const assetsList = renderAssets(assets);

    const works = getVal(sd, 'career.works', [] as string[]);
    const awards = getVal(sd, 'career.industryAwards', [] as string[]);
    const renderList = (arr: string[]) => {
      if (!Array.isArray(arr) || arr.length === 0) {
        return `<div style="font-size:10px; color:#555; padding:4px;">暂无记录</div>`;
      }
      return arr.map(item => `<div class="list-item"><span class="hl-val">${item}</span></div>`).join('');
    };

    const monthlyNet = monthlyIncome - monthlyExpense;

    return `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.1);">
            <div style="font-size:16px; font-weight:700; color:#fff;">${name}</div>
            <div style="font-size:11px; color:#aaa;">${ageStr}</div>
        </div>
        <div class="card">
            <div class="card-title">基本信息</div>
            <div class="info-row"><span class="info-key">生日</span><span class="info-val">${birthday}</span></div>
            <div class="info-row"><span class="info-key">职业</span><span class="info-val">${job}</span></div>
            <div class="info-row"><span class="info-key">外貌</span><span class="info-val" style="font-size:10px; max-width:180px; text-align:right;">${appearance}</span></div>
        </div>
        <div class="card">
            <div class="card-title">个人账户</div>
            <div class="info-row"><span class="info-key">现金</span><span class="info-val" style="color:#4a9; font-weight:700;">¥${Number(personalCash).toLocaleString()}</span></div>
            <div class="info-row"><span class="info-key">月固定收入</span><span class="info-val" style="color:#4a9;">+¥${Number(monthlyIncome).toLocaleString()}/月</span></div>
            <div class="info-row"><span class="info-key">月固定支出</span><span class="info-val" style="color:#a44;">-¥${Number(monthlyExpense).toLocaleString()}/月</span></div>
            <div class="info-row"><span class="info-key">月度净收入</span><span class="info-val" style="color:${monthlyNet >= 0 ? '#4a9' : '#a44'}; font-weight:700;">${monthlyNet >= 0 ? '+' : ''}¥${Number(monthlyNet).toLocaleString()}/月</span></div>
            <div class="info-row"><span class="info-key">持有资产</span><span class="info-val" style="font-size:10px; max-width:140px; text-align:right;">${assetsList}</span></div>
        </div>
        <div class="card">
            <div class="card-title">合约状态</div>
            <div style="font-size:10px; color:#ccc; line-height:1.5;">${contract}</div>
        </div>
        <div class="card">
            <div class="card-title">代表作品</div>
            ${renderList(works)}
        </div>
        <div class="card">
            <div class="card-title">荣誉记录</div>
            ${renderList(awards)}
        </div>`;
  },

  business(sd) {
    const companyCash = getVal(sd, 'companyAccount._cash', 0);
    const fixedCosts = getVal(sd, 'companyAccount.monthlyFixedExpenses', {} as Record<string, number>);
    const oneTimeChange = getVal(sd, 'companyAccount.oneTimeCompanyChange', 0);
    const runningProjects = getVal(sd, 'companyAccount.monthlyRevenueSources', {} as Record<string, MonthlyRevenueSource>);

    const fixedCostEntries: Array<{ key: string; label: string }> = [
      { key: 'payroll', label: '人力' },
      { key: 'facilityCost', label: '场地' },
      { key: 'marketingBudget', label: '营销' },
      { key: 'other', label: '其他' },
    ];

    const fixedCostsList: string =
      typeof fixedCosts === 'object' && fixedCosts !== null
        ? fixedCostEntries
            .map(({ key, label }) => {
              const value = fixedCosts[key];
              const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
              return `<div class="info-row">
                <span class="info-key">${label}</span>
                <span class="info-val">¥${numValue.toLocaleString()}/月</span>
              </div>`;
            })
            .join('') || '<div style="font-size:10px; color:#555; padding:4px;">暂无月度固定支出</div>'
        : '<div style="font-size:10px; color:#555; padding:4px;">暂无月度固定支出</div>';

    const totalFixedCost = fixedCostEntries.reduce((sum, { key }) => {
      const value = fixedCosts?.[key];
      return sum + (typeof value === 'number' ? value : parseFloat(String(value)) || 0);
    }, 0);

    const projectsList: string =
      typeof runningProjects === 'object' && runningProjects !== null
        ? Object.keys(runningProjects)
            .sort((a, b) => {
              const numA = parseInt(a.replace(/^id_/, ''), 10) || 0;
              const numB = parseInt(b.replace(/^id_/, ''), 10) || 0;
              return numA - numB;
            })
            .map(projectId => {
              const project = runningProjects[projectId];
              if (typeof project === 'object' && project !== null) {
                const displayName = project.name || projectId;
                const monthlyVolume = project.monthlyVolume ?? 0;
                const unitPrice = project.unitPrice ?? 0;
                const monthlyProfit = project._monthlyGrossProfit ?? 0;
                const costRate = project.variableCostRate ?? 0.3;
                const safeId = String(projectId).replace(/"/g, '&quot;');
                return `<div class="list-item project-item" data-project-id="${safeId}" style="padding:4px 0;">
                      <div style="flex:1;">
                        <span class="hl-val">${displayName}</span>
                        <div style="font-size:9px; color:#666; margin-top:2px;">
                          销量: ${Number(monthlyVolume).toLocaleString()} | 单价: ¥${Number(unitPrice).toLocaleString()} | 成本率: ${(Number(costRate) * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="dim-val" style="color:${monthlyProfit >= 0 ? '#4a9' : '#a44'};">
                          ${monthlyProfit >= 0 ? '+' : ''}¥${Number(monthlyProfit).toLocaleString()}/月
                        </span>
                        <div class="project-actions">
                          <span class="btn-small btn-edit-project" data-project-id="${safeId}" title="编辑">✏️</span>
                          <span class="btn-small btn-delete-project" data-project-id="${safeId}" title="删除">🗑️</span>
                        </div>
                      </div>
                    </div>`;
              }
              return null;
            })
            .filter(Boolean)
            .join('') || '<div style="font-size:10px; color:#555; padding:4px;">暂无月度收入来源</div>'
        : '<div style="font-size:10px; color:#555; padding:4px;">暂无月度收入来源</div>';

    let totalMonthlyProfit = 0;
    if (typeof runningProjects === 'object' && runningProjects !== null) {
      for (const projectId in runningProjects) {
        const project = runningProjects[projectId];
        if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
          totalMonthlyProfit += Number(project._monthlyGrossProfit) || 0;
        }
      }
    }

    const monthlyNetProfit = totalMonthlyProfit - totalFixedCost;

    return `
        <div class="card">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>公司账户</span>
                <span class="btn-small btn-recalculate-cash" title="重算现金" style="cursor:pointer; padding:2px 6px; font-size:9px; background:rgba(74,169,74,0.3); border-radius:4px;">🔄 重算</span>
            </div>
            <div class="info-row"><span class="info-key">现金</span><span class="info-val" style="color:#4a9; font-weight:700;">¥${Number(companyCash).toLocaleString()}</span></div>
            <div class="info-row"><span class="info-key">月度净利润</span><span class="info-val" style="color:${monthlyNetProfit >= 0 ? '#4a9' : '#a44'};">${monthlyNetProfit >= 0 ? '+' : ''}¥${Number(monthlyNetProfit).toLocaleString()}/月</span></div>
        </div>
        <div class="card">
            <div class="card-title">月度收入来源</div>
            ${projectsList}
            <div class="btn-add btn-add-project">+ 新增收入来源</div>
        </div>
        <div class="card">
            <div class="card-title">月度固定支出 <span style="font-size:8px; color:#666; font-weight:400;">(合计: ¥${totalFixedCost.toLocaleString()}/月)</span></div>
            ${fixedCostsList}
        </div>
        <div class="card">
            <div class="card-title">公账一次性变动</div>
            <div class="info-row">
                <span class="info-key">本轮变动</span>
                <span class="info-val" style="color:${oneTimeChange >= 0 ? '#4a9' : '#a44'}; font-weight:${oneTimeChange !== 0 ? '700' : '500'};">
                    ${oneTimeChange >= 0 ? '+' : ''}¥${Number(oneTimeChange).toLocaleString()}
                </span>
            </div>
        </div>`;
  },

  social(sd) {
    const circles = getVal(sd, 'network.socialMap', [] as string[]);
    const interactions = getVal(sd, 'network.recentInteractions', [] as string[]);
    const relationMap = getVal(sd, 'network.relationshipBook', {} as Record<string, number>);
    const relationList: Array<{ name: string; v: number }> = [];
    if (typeof relationMap === 'object' && relationMap !== null) {
      for (const k in relationMap) {
        const v = typeof relationMap[k] === 'number' ? relationMap[k] : parseInt(String(relationMap[k])) || 0;
        relationList.push({ name: k, v });
      }
    }
    const allies = relationList.filter(r => r.v > 30).sort((a, b) => b.v - a.v);
    const enemies = relationList.filter(r => r.v < -30).sort((a, b) => a.v - b.v);
    const renderTags = (arr: string[]) =>
      Array.isArray(arr) && arr.length > 0 && arr[0] !== '无'
        ? arr
            .map(
              i =>
                `<span style="display:inline-block; background:rgba(255,255,255,0.1); padding:2px 5px; border-radius:3px; font-size:10px; margin-right:4px; margin-bottom:4px;">${i}</span>`,
            )
            .join('')
        : '<span style="color:#555; font-size:10px;">无</span>';
    const renderRel = (list: Array<{ name: string; v: number }>) =>
      list.length
        ? list
            .map(
              r =>
                `<div class="list-item"><span class="hl-val">${r.name}</span><span class="dim-val">${r.v}</span></div>`,
            )
            .join('')
        : '<div style="font-size:10px; color:#555;">无</div>';
    const renderInter = (arr: string[]) =>
      Array.isArray(arr) && arr.length > 0 && arr[0] !== '无'
        ? arr.map(i => `<div style="font-size:10px; color:#ccc; margin-bottom:3px;">• ${i}</div>`).join('')
        : '<div style="font-size:10px; color:#555;">无</div>';
    return `
        <div class="card">
            <div class="card-title">社交版图</div>
            <div>${renderTags(circles)}</div>
        </div>
        <div class="card">
            <div class="card-title">近期互动</div>
            <div>${renderInter(interactions)}</div>
        </div>
        <div class="card">
            <div class="card-title">核心盟友</div>
            ${renderRel(allies)}
        </div>
        <div class="card">
            <div class="card-title">潜在敌对</div>
            ${renderRel(enemies)}
        </div>`;
  },

  world(sd) {
    const date = getVal(sd, 'world.currentDate', '待初始化');
    const loc = getVal(sd, 'world.currentLocation', '待初始化');
    const n1 = getVal(sd, 'world.eraNews', '待初始化');
    const n2 = getVal(sd, 'world.industryNews', '待初始化');
    const n3 = getVal(sd, 'world.gossipNews', '待初始化');
    const level = getVal(sd, 'professionalAssessment.currentTier', '待初始化');
    const media = getVal(sd, 'professionalAssessment.mediaSentiment', '待初始化');
    const publicRep = getVal(sd, 'professionalAssessment.publicReputation', '待初始化');
    const fans = getVal(sd, 'professionalAssessment.fanbase', '待初始化');
    return `
        <div class="card" style="text-align:center;">
            <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">${date}</div>
            <div style="font-size:10px; color:#888;">📍 ${loc}</div>
        </div>
        <div class="card">
            <div class="card-title">新闻动态</div>
            <div class="info-block"><b style="color:#888;">时代:</b> ${n1}</div>
            <div class="info-block"><b style="color:#888;">行业:</b> ${n2}</div>
            <div class="info-block"><b style="color:#888;">八卦:</b> ${n3}</div>
        </div>
        <div class="card">
            <div class="card-title">专业评估</div>
            <div class="info-row"><span class="info-key">当前咖位</span><span class="info-val">${level}</span></div>
            <div class="info-row"><span class="info-key">媒体风向</span><span class="info-val">${media}</span></div>
            <div class="info-row"><span class="info-key">社会风评</span><span class="info-val">${publicRep}</span></div>
            <div class="info-row"><span class="info-key">粉丝基础</span><span class="info-val">${fans}</span></div>
        </div>`;
  },
};
