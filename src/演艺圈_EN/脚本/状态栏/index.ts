import { waitUntil } from 'async-wait-until';
import { Schema } from '../../schema';

// 扩展 Window 接口以支持自定义属性
declare global {
  interface Window {
    FATE_CONFIG?: {
      storagePosIndex: string;
      storageCollapse: string;
      storageTab: string;
    };
  }
}

/**
 * 解析日期字符串，提取 YYYY-MM-DD 部分
 * 支持格式：YYYY-MM-DD 周X HH:mm 或 YYYY-MM-DD
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === '待定' || dateStr === '待初始化') {
    return null;
  }
  // 提取 YYYY-MM-DD 部分（可能包含时间）
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JavaScript Date 月份从 0 开始
  const day = parseInt(match[3], 10);
  return new Date(year, month, day);
}

/**
 * 计算年龄：根据当前日期和生日计算
 */
function calculateAge(currentDateStr: string, birthdayStr: string): number | null {
  const currentDate = parseDate(currentDateStr);
  const birthday = parseDate(birthdayStr);

  if (!currentDate || !birthday) {
    return null;
  }

  let age = currentDate.getFullYear() - birthday.getFullYear();
  const monthDiff = currentDate.getMonth() - birthday.getMonth();
  const dayDiff = currentDate.getDate() - birthday.getDate();

  // 如果还没过生日，年龄减1
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age >= 0 ? age : null;
}

/**
 * 计算跨月数：从上一轮日期到本轮日期，经过了多少个"1日"节点
 * 例如：2002-07-15 到 2002-09-15，跨了2个月（经过8月1日和9月1日）
 * 跨越节点定为每月的1日
 */
function calculateMonthCrossing(oldDateStr: string, newDateStr: string): number {
  const oldDate = parseDate(oldDateStr);
  const newDate = parseDate(newDateStr);

  if (!oldDate || !newDate) {
    return 0;
  }

  // 如果新日期早于或等于旧日期，返回0
  if (newDate <= oldDate) {
    return 0;
  }

  // 获取旧日期的年月日
  const oldYear = oldDate.getFullYear();
  const oldMonth = oldDate.getMonth(); // 0-11
  const oldDay = oldDate.getDate();

  // 获取新日期的年月日
  const newYear = newDate.getFullYear();
  const newMonth = newDate.getMonth();

  // 计算从旧日期之后的下一个"1日"开始，到新日期之间经过了多少个"1日"
  let currentYear = oldYear;
  let currentMonth = oldMonth;

  // 如果旧日期不是1日，从下个月的1日开始计算
  // 下个月的1日本身就是一个跨月节点，应该被计算在内
  if (oldDay > 1) {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  let monthCount = 0;

  // 从下一个"1日"开始，逐月检查是否经过了"1日"节点
  while (true) {
    // 检查当前月份是否在新日期之前或等于新日期所在月份
    if (currentYear > newYear || (currentYear === newYear && currentMonth > newMonth)) {
      break;
    }

    // 如果当前月份等于新日期所在月份
    if (currentYear === newYear && currentMonth === newMonth) {
      // 如果新日期是1日，算跨月；如果新日期不是1日，但当前月份是经过的"1日"节点，也算跨月
      // 因为从旧日期到新日期，经过了当前月份的1日这个节点
      monthCount++;
      break;
    }

    // 经过了一个"1日"节点
    monthCount++;

    // 移动到下一个月
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  return monthCount;
}

/**
 * 计算公司账户现金
 * 跨月数为0：_现金 = 上一轮_现金 + 最新公账一次性变动
 * 跨月数>=1：_现金 = 上一轮_现金 + 最新公账一次性变动 - 月度固定支出(上一轮) * 跨月数 + 所有月度收入来源月毛利(上一轮) * 跨月数
 */
function calculateCompanyCash(
  oldCash: number,
  oneTimeChange: number,
  monthCrossing: number,
  oldFixedCosts: any,
  oldRunningProjects: any,
): number {
  let cash = Number(oldCash) || 0;
  const change = Number(oneTimeChange) || 0;

  // 加上一次性变动
  cash += change;

  // 如果跨月，需要扣除月度固定支出，加上月度收入来源的月毛利
  if (monthCrossing >= 1) {
    // 计算月度固定支出（payroll + facilityCost + marketingBudget + other）
    const payrollCost = Number(_.get(oldFixedCosts, 'payroll')) || 0;
    const facilityCost = Number(_.get(oldFixedCosts, 'facilityCost')) || 0;
    const marketingCost = Number(_.get(oldFixedCosts, 'marketingBudget')) || 0;
    const otherOps = Number(_.get(oldFixedCosts, 'other')) || 0;
    const totalFixedCost = payrollCost + facilityCost + marketingCost + otherOps;

    // 计算所有月度收入来源的月毛利总和
    let totalMonthlyProfit = 0;
    if (oldRunningProjects && typeof oldRunningProjects === 'object') {
      for (const projectId in oldRunningProjects) {
        const project = oldRunningProjects[projectId];
        if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
          const monthlyProfit = Number(project._monthlyGrossProfit) || 0;
          totalMonthlyProfit += monthlyProfit;
        }
      }
    }

    // 扣除月度固定支出，加上月毛利（乘以跨月数）
    cash -= totalFixedCost * monthCrossing;
    cash += totalMonthlyProfit * monthCrossing;
  }

  return cash;
}

/**
 * 计算个人账户现金
 * 跨月数为0：_现金 = 上一轮_现金 + 最新私账一次性变动
 * 跨月数>=1：_现金 = 上一轮_现金 + 最新私账一次性变动 + (月度固定收入 - 月度固定支出) * 跨月数
 */
function calculatePersonalCash(
  oldCash: number,
  oneTimeChange: number,
  monthCrossing: number,
  monthlyIncome: number,
  monthlyExpense: number,
): number {
  let cash = Number(oldCash) || 0;
  const change = Number(oneTimeChange) || 0;

  // 加上一次性变动
  cash += change;

  // 如果跨月，需要加上月度净收入
  if (monthCrossing >= 1) {
    const monthlyNet = (Number(monthlyIncome) || 0) - (Number(monthlyExpense) || 0);
    cash += monthlyNet * monthCrossing;
  }

  return cash;
}

/**
 * 计算月毛利：月销量 * 单价 * (1 - 可变成本率)
 */
function calculateMonthlyProfit(monthlySales: number, unitPrice: number, variableCostRate: number): number {
  const sales = Number(monthlySales) || 0;
  const price = Number(unitPrice) || 0;
  const costRate = Number(variableCostRate) || 0;
  // 确保可变成本率在 0-1 之间
  const clampedCostRate = _.clamp(costRate, 0, 1);
  return sales * price * (1 - clampedCostRate);
}

$('#fate-phone-container, #fate-phone-css').remove();
$(document).off('.fatephone');

window.FATE_CONFIG = {
  storagePosIndex: 'fate_phone_pos_index_v9',
  storageCollapse: 'fate_phone_collapsed',
  storageTab: 'fate_phone_tab',
};

// 只保留上方两个位置（左上和右上）
const POSITIONS = [
  { name: 'TL', css: { top: '60px', left: '10px', bottom: 'auto', right: 'auto' } },
  { name: 'TR', css: { top: '60px', right: '10px', bottom: 'auto', left: 'auto' } },
];

const fateState = {
  currentTab: localStorage.getItem(window.FATE_CONFIG?.storageTab || '') || 'home',
  isCollapsed: localStorage.getItem(window.FATE_CONFIG?.storageCollapse || '') === 'true',
  // 确保位置索引在有效范围内（只有上方两个位置）
  posIndex: Math.min(
    parseInt(localStorage.getItem(window.FATE_CONFIG?.storagePosIndex || '') || '0') || 0,
    POSITIONS.length - 1,
  ),
};

const fateStyles = `
<style id="fate-phone-css">
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap');
    #fate-phone-container {
        --phone-w: 95vw;
        --max-w: 350px;
        --phone-h: 80vh;
        --max-h: 680px;
        --bezel: 12px; --radius: 24px;
        --c-frame: #111; --c-bg: #050505; --c-card: rgba(255,255,255,0.08); --c-text: #eee; --c-sub: #888;

        position: fixed;
        width: var(--phone-w); max-width: var(--max-w);
        height: var(--phone-h); max-height: var(--max-h);

        background: var(--c-frame); border-radius: var(--radius);
        box-shadow: 0 0 0 2px #000, 0 0 0 4px #333, 0 20px 50px rgba(0,0,0,0.6);
        z-index: 500; font-family: 'Noto Sans SC', sans-serif; color: var(--c-text);
        user-select: none; transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    #fate-phone-container.collapsed {
        width: 50px; height: 50px;
        border-radius: 14px; border: 2px solid #555;
        min-width: 0; min-height: 0;
        overflow: hidden;
    }
    .icon-placeholder { display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; background: #000; }
    #fate-phone-container.collapsed .icon-placeholder { display: flex; }
    #fate-phone-container.collapsed .screen-area { display: none; }
    .screen-area { position: absolute; top: var(--bezel); left: var(--bezel); right: var(--bezel); bottom: var(--bezel); background: linear-gradient(170deg, #1a1a1a 0%, #000 100%); border-radius: calc(var(--radius) - 4px); overflow: hidden; display: flex; flex-direction: column; pointer-events: auto; }
    .status-bar { height: 24px; min-height: 24px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; font-size: 10px; z-index: 20; background: rgba(0,0,0,0.3); }
    #fp-clock { cursor: pointer; font-weight: 700; color: #ddd; opacity: 0.8; transition: 0.2s; }
    #fp-clock:hover { opacity: 1; color: #fff; }
    .header-info { padding: 8px 15px 10px 15px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); }
    .main-title { font-size: 16px; font-weight: 900; color: #fff; margin-bottom: 2px; letter-spacing: 1px; }
    .sub-quote { font-size: 9px; color: #666; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.7; }
    .scroll-content { flex: 1; overflow-y: auto; padding: 10px; scrollbar-width: none; cursor: grab; -webkit-overflow-scrolling: touch; }
    .scroll-content.grabbing { cursor: grabbing; }
    .scroll-content::-webkit-scrollbar { display: none; }
    .nav-bar { height: 50px; min-height: 50px; background: rgba(15,15,15,0.98); border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-around; align-items: center; padding-bottom: 2px; }
    .nav-item { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 9px; color: #444; cursor: pointer; transition: 0.2s; }
    .nav-item:hover { color: #888; background: rgba(255,255,255,0.02); }
    .nav-item.active { color: #ddd; font-weight: 700; }
    .nav-icon { font-size: 16px; margin-bottom: 2px; filter: grayscale(1); opacity: 0.5; transition: 0.2s; }
    .nav-item.active .nav-icon { filter: grayscale(0); opacity: 1; }
    .card { background: var(--c-card); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
    .card-title { font-size: 9px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; letter-spacing: 1px; display: flex; align-items: center; gap: 6px; }
    .card-title::before { content:''; display:block; width:3px; height:8px; background:#444; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .info-row:last-child { border-bottom: none; }
    .info-key { color: #888; }
    .info-val { color: #eee; font-weight: 500; text-align: right; }
    .info-block { margin-top: 6px; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 6px; font-size: 11px; color: #ccc; line-height: 1.4; }
    .btn-icon { cursor: pointer; padding: 4px; opacity: 0.6; transition: 0.2s; font-size: 12px; }
    .btn-icon:hover { opacity: 1; }
    .list-item { padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 11px; display: flex; justify-content: space-between; }
    .list-item:last-child { border-bottom: none; }
    .hl-val { color: #fff; font-weight: 600; }
    .dim-val { color: #666; font-size: 10px; }
    .project-actions { display: flex; gap: 6px; align-items: center; }
    .btn-small { cursor: pointer; padding: 2px 6px; font-size: 9px; background: rgba(255,255,255,0.1); border-radius: 4px; transition: 0.2s; }
    .btn-small:hover { background: rgba(255,255,255,0.2); }
    .btn-add { cursor: pointer; padding: 6px 12px; font-size: 10px; background: rgba(74,169,74,0.3); border-radius: 6px; text-align: center; margin-top: 8px; transition: 0.2s; }
    .btn-add:hover { background: rgba(74,169,74,0.5); }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: none; align-items: center; justify-content: center; }
    .modal-overlay.show { display: flex; }
    .modal-content { background: #1a1a1a; border-radius: 12px; padding: 20px; max-width: 400px; width: 90%; border: 1px solid rgba(255,255,255,0.1); }
    .modal-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 15px; }
    .form-group { margin-bottom: 12px; }
    .form-label { font-size: 10px; color: #888; margin-bottom: 4px; display: block; }
    .form-input { width: 100%; padding: 8px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 11px; box-sizing: border-box; }
    .form-input:focus { outline: none; border-color: rgba(74,169,74,0.5); }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px; }
    .btn-modal { padding: 8px 16px; border-radius: 6px; font-size: 11px; cursor: pointer; transition: 0.2s; border: none; }
    .btn-modal-primary { background: rgba(74,169,74,0.5); color: #fff; }
    .btn-modal-primary:hover { background: rgba(74,169,74,0.7); }
    .btn-modal-secondary { background: rgba(255,255,255,0.1); color: #ccc; }
    .btn-modal-secondary:hover { background: rgba(255,255,255,0.2); }
</style>
`;

const fateTemplate = `
<div id="fate-phone-container">
    <div class="icon-placeholder">📱</div>
    <div class="screen-area">
        <div class="status-bar">
            <span id="fp-clock">12:00</span>
            <div style="display:flex; gap:10px;">
                <div id="btn-collapse" class="btn-icon">▼</div>
            </div>
        </div>
        <div class="header-info">
            <div id="fp-title" class="main-title">逐梦演艺圈</div>
            <div id="fp-quote" class="sub-quote">...</div>
        </div>
        <div id="fp-content" class="scroll-content"></div>
        <div class="nav-bar">
            <div class="nav-item" data-tab="home"><div class="nav-icon">👤</div><div>档案</div></div>
            <div class="nav-item" data-tab="business"><div class="nav-icon">💼</div><div>商业</div></div>
            <div class="nav-item" data-tab="social"><div class="nav-icon">🕸️</div><div>人脉</div></div>
            <div class="nav-item" data-tab="world"><div class="nav-icon">👁️</div><div>情报</div></div>
        </div>
    </div>
</div>
`;

function getMvuDataSafe() {
  try {
    if (typeof Mvu !== 'undefined' && typeof Mvu.getMvuData === 'function') {
      const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      if (variables && variables.stat_data) {
        return Schema.parse(variables.stat_data);
      }
    }
  } catch (e) {
    console.warn('获取 MVU 数据失败:', e);
  }
  return Schema.parse({});
}

const getVal = (data: z.infer<typeof Schema>, path: string, def: any = '无') => {
  if (!data) return def;
  let current: any = data;
  try {
    const keys = path.split('.');
    for (const key of keys) {
      if (current === undefined || current === null) return def;
      current = current[key];
    }
    return current !== undefined && current !== null && current !== '' ? current : def;
  } catch (e) {
    return def;
  }
};

const renderModules = {
  home: (sd: z.infer<typeof Schema>) => {
    const name = getVal(sd, 'protagonist.name', '未知');
    const age = getVal(sd, 'protagonist._age', 0);
    const ageStr = age > 0 ? `${age}岁` : '未知';
    const birthday = getVal(sd, 'protagonist.$birthday', '待初始化');
    const appearance = getVal(sd, 'protagonist.appearance', '待初始化');
    const job = getVal(sd, 'protagonist.occupation', '待初始化');

    // 个人账户
    const personalCash = getVal(sd, 'personalAccount._cash', 0);
    const monthlyIncome = getVal(sd, 'personalAccount.monthlyFixedIncome', 0);
    const monthlyExpense = getVal(sd, 'personalAccount.monthlyFixedExpense', 0);
    const contractRaw = getVal(sd, 'personalAccount.contractStatus', '待初始化');
    const assets = getVal(sd, 'personalAccount.assets', {});

    // 渲染合约状态（按分号分行显示）
    const renderContract = (contractStr: string): string => {
      if (!contractStr || contractStr === '无' || contractStr === '待初始化') return contractStr === '无' ? '无' : '待初始化';
      // 按分号分割，每个合约单独一行
      const contracts = contractStr
        .split(/[;；]/)
        .map(c => c.trim())
        .filter(c => c);
      if (contracts.length === 0) return '无';
      if (contracts.length === 1) return contracts[0];
      return contracts.map(c => `<div style="margin-bottom:2px;">${c}</div>`).join('');
    };
    const contract = renderContract(contractRaw);

    // 渲染持有资产（格式：{ realEstate, vehicles, stocks }，格式为「资产描述@数量@购入总价」）
    const renderAssets = (assetsObj: any): string => {
      if (!assetsObj || typeof assetsObj !== 'object') return '无';
      const categories = ['realEstate', 'vehicles', 'stocks'];
      const items: string[] = [];
      for (const cat of categories) {
        const arr = assetsObj[cat];
        if (Array.isArray(arr) && arr.length > 0) {
          for (const item of arr) {
            if (typeof item === 'string' && item.trim()) {
              // 格式：资产描述@数量@购入总价
              const parts = item.split('@');
              const desc = parts[0] || item;
              items.push(desc);
            }
          }
        }
      }
      return items.length > 0 ? items.join('、') : '无';
    };
    const assetsList = renderAssets(assets);

    // 作品和荣誉记录
    const works = getVal(sd, 'career.works', []);
    const awards = getVal(sd, 'career.industryAwards', []);
    const renderList = (arr: string[]) => {
      if (!Array.isArray(arr) || arr.length === 0) {
        return `<div style="font-size:10px; color:#555; padding:4px;">暂无记录</div>`;
      }
      return arr.map(item => `<div class="list-item"><span class="hl-val">${item}</span></div>`).join('');
    };

    // 月度净收入
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
            <div class="info-row"><span class="info-key">现金</span><span class="info-val" style="color:#4a9; font-weight:700;">¥${personalCash.toLocaleString()}</span></div>
            <div class="info-row"><span class="info-key">月固定收入</span><span class="info-val" style="color:#4a9;">+¥${monthlyIncome.toLocaleString()}/月</span></div>
            <div class="info-row"><span class="info-key">月固定支出</span><span class="info-val" style="color:#a44;">-¥${monthlyExpense.toLocaleString()}/月</span></div>
            <div class="info-row"><span class="info-key">月度净收入</span><span class="info-val" style="color:${monthlyNet >= 0 ? '#4a9' : '#a44'}; font-weight:700;">${monthlyNet >= 0 ? '+' : ''}¥${monthlyNet.toLocaleString()}/月</span></div>
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
  business: (sd: z.infer<typeof Schema>) => {
    const companyCash = getVal(sd, 'companyAccount._cash', 0);
    const fixedCosts = getVal(sd, 'companyAccount.monthlyFixedExpenses', {});
    const oneTimeChange = getVal(sd, 'companyAccount.oneTimeCompanyChange', 0);
    const runningProjects = getVal(sd, 'companyAccount.monthlyRevenueSources', {});

    // 月度固定支出字段顺序（英文 key，展示用中文标签）
    const fixedCostEntries: Array<{ key: string; label: string }> = [
      { key: 'payroll', label: '人力' },
      { key: 'facilityCost', label: '场地' },
      { key: 'marketingBudget', label: '营销' },
      { key: 'other', label: '其他' },
    ];

    // 渲染月度固定支出（按指定顺序）
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

    // 计算月度固定支出总额
    const totalFixedCost = fixedCostEntries.reduce((sum, { key }) => {
      const value = fixedCosts?.[key];
      return sum + (typeof value === 'number' ? value : parseFloat(String(value)) || 0);
    }, 0);

    // 渲染月度收入来源列表（key 为 id_1, id_2...，显示名用 name）
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
                const displayName = (project as any).name || projectId;
                const monthlyVolume = (project as any).monthlyVolume ?? 0;
                const unitPrice = (project as any).unitPrice ?? 0;
                const monthlyProfit = (project as any)._monthlyGrossProfit ?? 0;
                const costRate = (project as any).variableCostRate ?? 0.3;
                return `<div class="list-item project-item" data-project-id="${String(projectId).replace(/"/g, '&quot;')}" style="padding:4px 0;">
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
                          <span class="btn-small btn-edit-project" data-project-id="${String(projectId).replace(/"/g, '&quot;')}" title="编辑">✏️</span>
                          <span class="btn-small btn-delete-project" data-project-id="${String(projectId).replace(/"/g, '&quot;')}" title="删除">🗑️</span>
                        </div>
                      </div>
                    </div>`;
              }
              return null;
            })
            .filter(Boolean)
            .join('') || '<div style="font-size:10px; color:#555; padding:4px;">暂无月度收入来源</div>'
        : '<div style="font-size:10px; color:#555; padding:4px;">暂无月度收入来源</div>';

    // 计算月度收入来源月毛利总额
    let totalMonthlyProfit = 0;
    if (typeof runningProjects === 'object' && runningProjects !== null) {
      for (const projectId in runningProjects) {
        const project = runningProjects[projectId];
        if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
          totalMonthlyProfit += Number((project as any)._monthlyGrossProfit) || 0;
        }
      }
    }

    // 月度净利润 = 月毛利总额 - 月度固定支出总额
    const monthlyNetProfit = totalMonthlyProfit - totalFixedCost;

    return `
        <div class="card">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>公司账户</span>
                <span class="btn-small btn-recalculate-cash" title="重算现金" style="cursor:pointer; padding:2px 6px; font-size:9px; background:rgba(74,169,74,0.3); border-radius:4px;">🔄 重算</span>
            </div>
            <div class="info-row"><span class="info-key">现金</span><span class="info-val" style="color:#4a9; font-weight:700;">¥${companyCash.toLocaleString()}</span></div>
            <div class="info-row"><span class="info-key">月度净利润</span><span class="info-val" style="color:${monthlyNetProfit >= 0 ? '#4a9' : '#a44'};">${monthlyNetProfit >= 0 ? '+' : ''}¥${monthlyNetProfit.toLocaleString()}/月</span></div>
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
                    ${oneTimeChange >= 0 ? '+' : ''}¥${oneTimeChange.toLocaleString()}
                </span>
            </div>
        </div>`;
  },
  social: (sd: z.infer<typeof Schema>) => {
    const circles = getVal(sd, 'network.socialMap', []);
    const interactions = getVal(sd, 'network.recentInteractions', []);
    const relationMap = getVal(sd, 'network.relationshipBook', {});
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
  world: (sd: z.infer<typeof Schema>) => {
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

function initFatePhone() {
  $('head').append(fateStyles);
  $('body').prepend(fateTemplate);

  // 添加项目编辑模态框（业务显示名 name，key 为 id_1, id_2...）
  const modalHtml = `
    <div id="project-modal" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-title" id="modal-title">新增收入来源</div>
        <div class="form-group">
          <label class="form-label">业务显示名称</label>
          <input type="text" id="modal-project-name" class="form-input" placeholder="如：影视制作、代言商务" />
        </div>
        <div class="form-group">
          <label class="form-label">月销量/规模</label>
          <input type="number" id="modal-monthly-sales" class="form-input" placeholder="0" min="0" step="1" />
        </div>
        <div class="form-group">
          <label class="form-label">单价 (¥)</label>
          <input type="number" id="modal-price" class="form-input" placeholder="0" min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label class="form-label">可变成本率 (0-1)</label>
          <input type="number" id="modal-cost-rate" class="form-input" placeholder="0.3" min="0" max="1" step="0.01" />
        </div>
        <div class="modal-actions">
          <button class="btn-modal btn-modal-secondary" id="modal-cancel">取消</button>
          <button class="btn-modal btn-modal-primary" id="modal-save">保存</button>
        </div>
      </div>
    </div>
  `;
  $('body').append(modalHtml);

  /** 生成下一个收入来源 ID（id_1, id_2, ...） */
  const nextRevenueSourceId = (sources: Record<string, unknown>): string => {
    const ids = Object.keys(sources).filter(k => /^id_\d+$/.test(k));
    const max = ids.reduce((m, k) => Math.max(m, parseInt(k.replace(/^id_/, ''), 10) || 0), 0);
    return `id_${max + 1}`;
  };

  const container = $('#fate-phone-container');
  const content = $('#fp-content');
  let editingProjectId: string | null = null;

  const applyPosition = () => {
    const pos = POSITIONS[fateState.posIndex];
    container.css({ top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' });
    container.css(pos.css);
  };
  applyPosition();

  const render = () => {
    const sd = getMvuDataSafe();
    $('#fp-title').text('逐梦演艺圈');
    $('#fp-quote').text('在娱乐圈的浮沉中寻找自己的位置');
    const timeStr = getVal(sd, 'world.currentDate', '待初始化');
    const timeMatch = timeStr.match(/(\d{2}:\d{2})/);
    $('#fp-clock').text(timeMatch ? timeMatch[1] : '12:00');
    if (fateState.isCollapsed) container.addClass('collapsed');
    else container.removeClass('collapsed');
    const renderer = renderModules[fateState.currentTab as keyof typeof renderModules] || renderModules.home;
    $('#fp-content').html(renderer(sd));
    $('.nav-item').removeClass('active');
    $(`.nav-item[data-tab="${fateState.currentTab}"]`).addClass('active');
  };

  container.on('click', '.nav-item', function (e) {
    e.stopPropagation();
    fateState.currentTab = $(this).data('tab');
    localStorage.setItem(window.FATE_CONFIG?.storageTab || '', fateState.currentTab);
    render();
  });

  const toggleCollapse = (e: JQuery.Event) => {
    e.stopPropagation();
    fateState.isCollapsed = !fateState.isCollapsed;
    localStorage.setItem(window.FATE_CONFIG?.storageCollapse || '', String(fateState.isCollapsed));
    render();
  };
  container.on('click', '#btn-collapse, .icon-placeholder', toggleCollapse);

  // 时间按钮点击处理（支持触摸和鼠标）
  let clockClickTimer: ReturnType<typeof setTimeout> | null = null;
  const handleClockClick = (e: JQuery.Event) => {
    e.stopPropagation();
    e.preventDefault();

    // 防抖处理，避免快速多次点击
    if (clockClickTimer) {
      clearTimeout(clockClickTimer);
    }
    clockClickTimer = setTimeout(() => {
      fateState.posIndex = (fateState.posIndex + 1) % POSITIONS.length;
      localStorage.setItem(window.FATE_CONFIG?.storagePosIndex || '', String(fateState.posIndex));
      applyPosition();
      clockClickTimer = null;
    }, 150);
  };

  container.on('click', '#fp-clock', handleClockClick);
  // 阻止触摸事件触发拖拽逻辑
  container.on('touchstart', '#fp-clock', function (e) {
    e.stopPropagation();
  });
  container.on('touchend', '#fp-clock', function (e) {
    e.stopPropagation();
    // 触摸结束时也触发位置切换
    handleClockClick(e);
  });

  // 项目编辑相关函数（projectId 为 id_1, id_2...，编辑时传入）
  const openProjectModal = (projectId?: string) => {
    const modal = $('#project-modal');
    const isEdit = !!projectId;
    editingProjectId = projectId ?? null;

    $('#modal-title').text(isEdit ? '编辑收入来源' : '新增收入来源');
    $('#modal-project-name').prop('disabled', false);

    if (isEdit && projectId) {
      try {
        const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
        const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));
        const sources = stat_data.companyAccount?.monthlyRevenueSources;
        if (sources && typeof sources === 'object' && sources[projectId]) {
          const project = sources[projectId] as any;
          $('#modal-project-name').val(project.name ?? '');
          $('#modal-monthly-sales').val(project.monthlyVolume ?? 0);
          $('#modal-price').val(project.unitPrice ?? 0);
          $('#modal-cost-rate').val(project.variableCostRate ?? 0.3);
        }
      } catch (e) {
        console.warn('获取项目数据失败:', e);
      }
    } else {
      $('#modal-project-name').val('');
      $('#modal-monthly-sales').val('');
      $('#modal-price').val('');
      $('#modal-cost-rate').val('0.3');
    }

    modal.addClass('show');
  };

  const closeProjectModal = () => {
    $('#project-modal').removeClass('show');
  };

  const saveProject = async () => {
    const name = String($('#modal-project-name').val() || '').trim();
    if (!name) {
      toastr.warning('请输入业务显示名称');
      return;
    }

    const monthlyVolume = parseFloat(String($('#modal-monthly-sales').val() || '0'));
    const unitPrice = parseFloat(String($('#modal-price').val() || '0'));
    const costRate = parseFloat(String($('#modal-cost-rate').val() || '0.3'));

    if (isNaN(monthlyVolume) || isNaN(unitPrice) || isNaN(costRate)) {
      toastr.warning('请输入有效的数值');
      return;
    }

    if (costRate < 0 || costRate > 1) {
      toastr.warning('可变成本率必须在0-1之间');
      return;
    }

    try {
      const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));

      if (!stat_data.companyAccount) {
        stat_data.companyAccount = {
          monthlyRevenueSources: {},
          monthlyFixedExpenses: { payroll: 0, facilityCost: 0, marketingBudget: 0, other: 0 },
          oneTimeCompanyChange: 0,
          _cash: 0,
        };
      }
      if (!stat_data.companyAccount.monthlyRevenueSources) {
        stat_data.companyAccount.monthlyRevenueSources = {};
      }

      const sources = stat_data.companyAccount.monthlyRevenueSources;
      const projectId = editingProjectId ?? nextRevenueSourceId(sources);
      const _monthlyGrossProfit = monthlyVolume * unitPrice * (1 - _.clamp(costRate, 0, 1));

      const existing = sources[projectId] as any;
      sources[projectId] = {
        name,
        _scope: existing?._scope ?? '待初始化',
        monthlyVolume,
        unitPrice,
        variableCostRate: _.clamp(costRate, 0, 1),
        _monthlyGrossProfit,
      };

      _.set(variables, 'stat_data', stat_data);
      await Mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });

      editingProjectId = null;
      closeProjectModal();
      render();
      toastr.success('保存成功');
    } catch (e) {
      console.error('保存项目失败:', e);
      toastr.error('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const deleteProject = async (projectId: string) => {
    const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
    const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));
    const name = (stat_data.companyAccount?.monthlyRevenueSources as any)?.[projectId]?.name ?? projectId;
    if (!confirm(`确定要删除「${name}」吗？`)) {
      return;
    }

    try {
      if (stat_data.companyAccount?.monthlyRevenueSources && projectId in stat_data.companyAccount.monthlyRevenueSources) {
        delete stat_data.companyAccount.monthlyRevenueSources[projectId];
        _.set(variables, 'stat_data', stat_data);
        await Mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });

        render();
        toastr.success('删除成功');
      }
    } catch (e) {
      console.error('删除项目失败:', e);
      toastr.error('删除失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // 重算现金功能（同时计算公司账户和个人账户）
  const recalculateCash = async () => {
    try {
      // 获取当前楼层的变量（最新）
      const currentVariables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      const currentStatData = Schema.parse(_.get(currentVariables, 'stat_data', {}));

      // 获取上一楼层的变量（倒数第二楼）
      let oldVariables;
      try {
        oldVariables = Mvu.getMvuData({ type: 'message', message_id: -2 });
      } catch (e) {
        // 如果没有上一楼层，使用当前楼层的数据作为旧数据
        oldVariables = currentVariables;
      }
      const oldStatData = _.get(oldVariables, 'stat_data', {});

      const oldCurrentDate = _.get(oldStatData, 'world.currentDate');
      const newCurrentDate = _.get(currentStatData, 'world.currentDate');

      // 公司账户相关
      const oldCompanyCash = _.get(oldStatData, 'companyAccount._cash', 0);
      const companyOneTimeChange = _.get(currentStatData, 'companyAccount.oneTimeCompanyChange', 0);
      const oldFixedCosts = _.get(oldStatData, 'companyAccount.monthlyFixedExpenses', {});
      const oldRunningProjects = _.get(oldStatData, 'companyAccount.monthlyRevenueSources', {});

      // 个人账户相关
      const oldPersonalCash = _.get(oldStatData, 'personalAccount._cash', 0);
      const personalOneTimeChange = _.get(currentStatData, 'personalAccount.oneTimePersonalChange', 0);
      const oldMonthlyIncome = _.get(oldStatData, 'personalAccount.monthlyFixedIncome', 0);
      const oldMonthlyExpense = _.get(oldStatData, 'personalAccount.monthlyFixedExpense', 0);

      if (oldCurrentDate && newCurrentDate && oldCurrentDate !== '待定' && oldCurrentDate !== '待初始化' && newCurrentDate !== '待定' && newCurrentDate !== '待初始化') {
        // 计算跨月数
        const monthCrossing = calculateMonthCrossing(oldCurrentDate, newCurrentDate);

        // 计算公司账户新现金值
        const calculatedCompanyCash = calculateCompanyCash(
          oldCompanyCash,
          companyOneTimeChange,
          monthCrossing,
          oldFixedCosts,
          oldRunningProjects,
        );

        // 计算个人账户新现金值
        const calculatedPersonalCash = calculatePersonalCash(
          oldPersonalCash,
          personalOneTimeChange,
          monthCrossing,
          oldMonthlyIncome,
          oldMonthlyExpense,
        );

        // 更新变量
        _.set(currentStatData, 'companyAccount._cash', calculatedCompanyCash);
        _.set(currentStatData, 'personalAccount._cash', calculatedPersonalCash);
        _.set(currentVariables, 'stat_data', currentStatData);
        await Mvu.replaceMvuData(currentVariables, { type: 'message', message_id: 'latest' });

        // 计算月度固定支出总额（4个字段）
        const payrollCost = Number(_.get(oldFixedCosts, 'payroll')) || 0;
        const facilityCost = Number(_.get(oldFixedCosts, 'facilityCost')) || 0;
        const marketingCost = Number(_.get(oldFixedCosts, 'marketingBudget')) || 0;
        const otherOps = Number(_.get(oldFixedCosts, 'other')) || 0;
        const totalFixedCost = payrollCost + facilityCost + marketingCost + otherOps;

        let totalMonthlyProfit = 0;
        if (oldRunningProjects && typeof oldRunningProjects === 'object') {
          for (const projectId in oldRunningProjects) {
            const project = oldRunningProjects[projectId];
            if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
              totalMonthlyProfit += Number((project as any)._monthlyGrossProfit) || 0;
            }
          }
        }

        const monthlyNet = oldMonthlyIncome - oldMonthlyExpense;

        let message = `现金重算完成！`;
        message += `\n\n【公司账户】`;
        message += `\n旧现金: ¥${oldCompanyCash.toLocaleString()}`;
        message += `\n新现金: ¥${calculatedCompanyCash.toLocaleString()}`;
        message += `\n\n【个人账户】`;
        message += `\n旧现金: ¥${oldPersonalCash.toLocaleString()}`;
        message += `\n新现金: ¥${calculatedPersonalCash.toLocaleString()}`;
        if (monthCrossing > 0) {
          message += `\n\n【跨月计算】`;
          message += `\n跨月数: ${monthCrossing}`;
          message += `\n公司月度固定支出: ¥${totalFixedCost.toLocaleString()}/月`;
          message += `\n公司月毛利: ¥${totalMonthlyProfit.toLocaleString()}/月`;
          message += `\n个人月净收入: ¥${monthlyNet.toLocaleString()}/月`;
        }
        toastr.success(message, '重算现金', { timeOut: 8000 });

        render();
      } else {
        // 如果日期信息不完整，使用简化计算：当前现金 + 一次性变动
        const currentCompanyCash = _.get(currentStatData, 'companyAccount._cash', 0);
        const currentPersonalCash = _.get(currentStatData, 'personalAccount._cash', 0);
        const newCompanyCash = currentCompanyCash + companyOneTimeChange;
        const newPersonalCash = currentPersonalCash + personalOneTimeChange;

        _.set(currentStatData, 'companyAccount._cash', newCompanyCash);
        _.set(currentStatData, 'personalAccount._cash', newPersonalCash);
        _.set(currentVariables, 'stat_data', currentStatData);
        await Mvu.replaceMvuData(currentVariables, { type: 'message', message_id: 'latest' });

        let message = `现金重算完成（简化模式）！`;
        message += `\n\n【公司账户】`;
        message += `\n当前: ¥${currentCompanyCash.toLocaleString()}`;
        message += `\n变动: ${companyOneTimeChange >= 0 ? '+' : ''}¥${companyOneTimeChange.toLocaleString()}`;
        message += `\n新值: ¥${newCompanyCash.toLocaleString()}`;
        message += `\n\n【个人账户】`;
        message += `\n当前: ¥${currentPersonalCash.toLocaleString()}`;
        message += `\n变动: ${personalOneTimeChange >= 0 ? '+' : ''}¥${personalOneTimeChange.toLocaleString()}`;
        message += `\n新值: ¥${newPersonalCash.toLocaleString()}`;
        toastr.success(message, '重算现金', { timeOut: 8000 });
        render();
      }
    } catch (e) {
      console.error('重算现金失败:', e);
      toastr.error('重算现金失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // 绑定项目编辑事件
  container.on('click', '.btn-add-project', function (e) {
    e.stopPropagation();
    openProjectModal();
  });

  container.on('click', '.btn-edit-project', function (e) {
    e.stopPropagation();
    const projectId = $(this).data('project-id');
    if (projectId) {
      openProjectModal(projectId);
    }
  });

  container.on('click', '.btn-delete-project', function (e) {
    e.stopPropagation();
    const projectId = $(this).data('project-id');
    if (projectId) {
      deleteProject(projectId);
    }
  });

  // 绑定重算现金事件
  container.on('click', '.btn-recalculate-cash', function (e) {
    e.stopPropagation();
    recalculateCash();
  });

  // 模态框事件
  $('#modal-cancel, #project-modal').on('click', function (e) {
    if (e.target === this) {
      closeProjectModal();
    }
  });

  $('#modal-save').on('click', function (e) {
    e.stopPropagation();
    saveProject();
  });

  // 模态框内输入框回车保存
  $('#project-modal input').on('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveProject();
    }
  });

  let isDown = false;
  let startY: number;
  let scrollTop: number;

  const startDrag = (y: number) => {
    isDown = true;
    content.addClass('grabbing');
    startY = y - content.offset()!.top;
    scrollTop = content.scrollTop()!;
  };

  const doDrag = (y: number) => {
    if (!isDown) return;
    const yPos = y - content.offset()!.top;
    const walk = (yPos - startY) * 1.5;
    content.scrollTop(scrollTop - walk);
  };

  const stopDrag = () => {
    isDown = false;
    content.removeClass('grabbing');
  };

  content.on('mousedown', e => startDrag(e.pageY));
  content.on('mouseleave', stopDrag);
  content.on('mouseup', stopDrag);
  content.on('mousemove', e => {
    if (isDown) {
      e.preventDefault();
      doDrag(e.pageY);
    }
  });

  content.on('touchstart', e => {
    if (e.originalEvent?.touches?.[0]) {
      startDrag(e.originalEvent.touches[0].pageY);
    }
  });
  content.on('touchend', stopDrag);
  content.on('touchmove', e => {
    if (isDown && e.originalEvent?.touches?.[0]) {
      doDrag(e.originalEvent.touches[0].pageY);
    }
  });

  render();
  let initCount = 0;
  const initInterval = setInterval(() => {
    render();
    initCount++;
    if (initCount > 6) clearInterval(initInterval);
  }, 500);

  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedUpdate = () => {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      render();
      updateTimer = null;
    }, 500);
  };

  if (typeof eventOn === 'function') {
    if (typeof tavern_events !== 'undefined') {
      eventOn(tavern_events.MESSAGE_RECEIVED, debouncedUpdate);
    }
    if (typeof Mvu !== 'undefined' && Mvu.events) {
      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, debouncedUpdate);
    }
    try {
      if (window.parent && (window.parent as any).eventOn && (window.parent as any).Mvu) {
        (window.parent as any).eventOn((window.parent as any).Mvu.events.VARIABLE_UPDATE_ENDED, debouncedUpdate);
      }
    } catch (e) {
      // 忽略跨域访问错误
    }
  }

  /**
   * 保护只读字段不被 AI 直接覆盖，并自动计算只读字段的值
   *
   * - protagonist._age (根据 world.currentDate 和 protagonist.$birthday 计算)
   * - personalAccount._cash (根据上一轮数据 + 一次性变动 + 月度固定收支与跨月数计算)
   * - companyAccount._cash (根据上一轮数据 + 一次性变动 + 月度固定支出与收入来源月毛利、跨月数计算)
   * - companyAccount.monthlyRevenueSources.${id}._monthlyGrossProfit (根据 monthlyVolume * unitPrice * (1 - variableCostRate) 计算)
   * - companyAccount.monthlyRevenueSources.${id}._scope（当旧数据中已有值时，拒绝任何覆盖，始终保留旧值）
   */
  if (typeof Mvu !== 'undefined' && Mvu.events) {
    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
      const old_stat_data = _.get(old_variables, 'stat_data');
      const new_stat_data = _.get(new_variables, 'stat_data');

      if (!new_stat_data) {
        return;
      }

      console.info('[状态栏-只读字段] ===== 开始处理变量更新 =====');

      // 计算并保护 protagonist._age
      const currentDate = _.get(new_stat_data, 'world.currentDate');
      const birthday = _.get(new_stat_data, 'protagonist.$birthday');
      if (currentDate && birthday && currentDate !== '待定' && currentDate !== '待初始化' && birthday !== '待定' && birthday !== '待初始化') {
        const calculatedAge = calculateAge(currentDate, birthday);
        if (calculatedAge !== null) {
          _.set(new_stat_data, 'protagonist._age', calculatedAge);
          console.info(`[状态栏-只读字段] 计算年龄: 当前日期=${currentDate}, 生日=${birthday}, 年龄=${calculatedAge}`);
        } else {
          console.warn(`[状态栏-只读字段] 年龄计算失败: 当前日期=${currentDate}, 生日=${birthday}`);
        }
      }

      // 计算跨月数（个人账户和公司账户共用）
      const old_current_date = _.get(old_stat_data, 'world.currentDate');
      const new_current_date = _.get(new_stat_data, 'world.currentDate');
      let monthCrossing = 0;
      if (old_current_date && new_current_date && old_current_date !== '待定' && old_current_date !== '待初始化' && new_current_date !== '待定' && new_current_date !== '待初始化') {
        monthCrossing = calculateMonthCrossing(old_current_date, new_current_date);
        console.info(
          `[状态栏-只读字段] 计算跨月数: 旧日期=${old_current_date}, 新日期=${new_current_date}, 跨月数=${monthCrossing}`,
        );
      }

      // 计算并保护 personalAccount._cash
      const old_personal_cash = _.get(old_stat_data, 'personalAccount._cash');
      const personalOneTimeChange = _.get(new_stat_data, 'personalAccount.oneTimePersonalChange');
      const old_monthly_income = _.get(old_stat_data, 'personalAccount.monthlyFixedIncome');
      const old_monthly_expense = _.get(old_stat_data, 'personalAccount.monthlyFixedExpense');

      if (old_personal_cash !== undefined) {
        const calculatedPersonalCash = calculatePersonalCash(
          old_personal_cash,
          personalOneTimeChange,
          monthCrossing,
          old_monthly_income,
          old_monthly_expense,
        );

        _.set(new_stat_data, 'personalAccount._cash', calculatedPersonalCash);

        // 记录计算详情
        const monthlyIncome = Number(old_monthly_income) || 0;
        const monthlyExpense = Number(old_monthly_expense) || 0;
        const monthlyNet = monthlyIncome - monthlyExpense;

        if (monthCrossing === 0) {
          console.info(
            `[状态栏-只读字段] 计算个人现金(未跨月): 旧现金=${old_personal_cash}, 一次性变动=${personalOneTimeChange}, 新现金=${calculatedPersonalCash}`,
          );
        } else {
          console.info(
            `[状态栏-只读字段] 计算个人现金(跨${monthCrossing}个月): 旧现金=${old_personal_cash}, 一次性变动=${personalOneTimeChange}, 月度净收支=${monthlyNet}(收入${monthlyIncome}-支出${monthlyExpense}), 新现金=${calculatedPersonalCash}`,
          );
        }
      }

      // 计算并保护 companyAccount._cash
      const old_company_cash = _.get(old_stat_data, 'companyAccount._cash');
      const companyOneTimeChange = _.get(new_stat_data, 'companyAccount.oneTimeCompanyChange');
      const old_fixed_costs = _.get(old_stat_data, 'companyAccount.monthlyFixedExpenses');
      const old_running_projects = _.get(old_stat_data, 'companyAccount.monthlyRevenueSources');

      if (old_company_cash !== undefined) {
        // 计算月度固定支出和月毛利（用于日志）
        const payrollCost = Number(_.get(old_fixed_costs, 'payroll')) || 0;
        const facilityCost = Number(_.get(old_fixed_costs, 'facilityCost')) || 0;
        const marketingCost = Number(_.get(old_fixed_costs, 'marketingBudget')) || 0;
        const otherCost = Number(_.get(old_fixed_costs, 'other')) || 0;
        const totalFixedCost = payrollCost + facilityCost + marketingCost + otherCost;

        let totalMonthlyProfit = 0;
        const projectProfits: Record<string, number> = {};
        if (old_running_projects && typeof old_running_projects === 'object') {
          for (const projectId in old_running_projects) {
            const project = old_running_projects[projectId];
            if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
              const monthlyProfit = Number((project as any)._monthlyGrossProfit) || 0;
              totalMonthlyProfit += monthlyProfit;
              projectProfits[projectId] = monthlyProfit;
            }
          }
        }

        // 计算新的现金值
        const calculatedCash = calculateCompanyCash(
          old_company_cash,
          companyOneTimeChange,
          monthCrossing,
          old_fixed_costs,
          old_running_projects,
        );

        _.set(new_stat_data, 'companyAccount._cash', calculatedCash);

        // 记录现金计算详情
        if (monthCrossing === 0) {
          console.info(
            `[状态栏-只读字段] 计算公司现金(未跨月): 旧现金=${old_company_cash}, 一次性变动=${companyOneTimeChange}, 新现金=${calculatedCash}`,
          );
        } else {
          console.info(
            `[状态栏-只读字段] 计算公司现金(跨${monthCrossing}个月): 旧现金=${old_company_cash}, 一次性变动=${companyOneTimeChange}, 月度固定支出=${totalFixedCost}(payroll${payrollCost}+facility${facilityCost}+marketing${marketingCost}+other${otherCost}), 月毛利总和=${totalMonthlyProfit}, 新现金=${calculatedCash}`,
          );
          if (Object.keys(projectProfits).length > 0) {
            console.info(
              `[状态栏-只读字段] 各项目月毛利详情: ${Object.entries(projectProfits)
                .map(([id, profit]) => `${id}=${profit}`)
                .join(', ')}`,
            );
          }
        }
      }

      // 计算并保护 companyAccount.monthlyRevenueSources.${id}._monthlyGrossProfit 和 _scope
      const new_running_projects = _.get(new_stat_data, 'companyAccount.monthlyRevenueSources');
      if (new_running_projects && typeof new_running_projects === 'object') {
        const old_running_projects_for_scope =
          old_running_projects && typeof old_running_projects === 'object' ? old_running_projects : {};

        // 遍历新项目中的所有项目
        for (const projectId in new_running_projects) {
          const new_project = new_running_projects[projectId];
          const old_project = (old_running_projects_for_scope as any)[projectId];

          if (new_project && typeof new_project === 'object') {
            // 保护「_scope」：如果旧数据中已存在该字段，则拒绝覆盖，始终保留旧值
            if (old_project && typeof old_project === 'object' && '_scope' in old_project) {
              const oldScope = old_project._scope;
              const newScope = (new_project as any)._scope;

              if (newScope !== undefined && newScope !== oldScope) {
                _.set(new_stat_data, `companyAccount.monthlyRevenueSources.${projectId}._scope`, oldScope);
                console.info(
                  `[状态栏-只读字段] 保护_scope: 项目=${projectId}, 拒绝修改为=${newScope}, 保留旧值=${oldScope}`,
                );
              }
            }

            const monthlyVolume = (new_project as any).monthlyVolume;
            const unitPrice = (new_project as any).unitPrice;
            const variableCostRate = (new_project as any).variableCostRate ?? 0.3;

            // 计算月毛利：monthlyVolume * unitPrice * (1 - variableCostRate)
            const calculatedProfit = calculateMonthlyProfit(monthlyVolume, unitPrice, variableCostRate);
            _.set(new_stat_data, `companyAccount.monthlyRevenueSources.${projectId}._monthlyGrossProfit`, calculatedProfit);

            console.info(
              `[状态栏-只读字段] 计算项目月毛利: 项目=${projectId}, monthlyVolume=${monthlyVolume}, unitPrice=${unitPrice}, variableCostRate=${variableCostRate}, _monthlyGrossProfit=${calculatedProfit}`,
            );
          }
        }
      }

      console.info('[状态栏-只读字段] ===== 变量更新处理完成 =====');
    });
  }
}

$(
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    await waitUntil(() => {
      try {
        if (typeof Mvu !== 'undefined' && typeof Mvu.getMvuData === 'function') {
          const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
          return variables && _.has(variables, 'stat_data');
        }
      } catch (e) {
        return false;
      }
      return false;
    });
    const checkReady = setInterval(() => {
      if (typeof $ !== 'undefined') {
        clearInterval(checkReady);
        initFatePhone();
      }
    }, 200);
  }),
);

$(window).on('pagehide', () => {
  $('#fate-phone-container, #fate-phone-css, #project-modal').remove();
  $(document).off('.fatephone');
});
