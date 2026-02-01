/**
 * 纯计算函数：日期解析、年龄、跨月数、公司/个人现金、月毛利
 */

/**
 * 解析日期字符串，提取 YYYY-MM-DD 部分
 * 支持格式：YYYY-MM-DD 周X HH:mm 或 YYYY-MM-DD
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === '待定' || dateStr === '待初始化') {
    return null;
  }
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  return new Date(year, month, day);
}

/**
 * 计算年龄：根据当前日期和生日计算
 */
export function calculateAge(currentDateStr: string, birthdayStr: string): number | null {
  const currentDate = parseDate(currentDateStr);
  const birthday = parseDate(birthdayStr);

  if (!currentDate || !birthday) {
    return null;
  }

  let age = currentDate.getFullYear() - birthday.getFullYear();
  const monthDiff = currentDate.getMonth() - birthday.getMonth();
  const dayDiff = currentDate.getDate() - birthday.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age >= 0 ? age : null;
}

/**
 * 计算跨月数：从上一轮日期到本轮日期，经过了多少个"1日"节点
 */
export function calculateMonthCrossing(oldDateStr: string, newDateStr: string): number {
  const oldDate = parseDate(oldDateStr);
  const newDate = parseDate(newDateStr);

  if (!oldDate || !newDate || newDate <= oldDate) {
    return 0;
  }

  let currentYear = oldDate.getFullYear();
  let currentMonth = oldDate.getMonth();
  const oldDay = oldDate.getDate();
  const newYear = newDate.getFullYear();
  const newMonth = newDate.getMonth();

  if (oldDay > 1) {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  let monthCount = 0;
  while (true) {
    if (currentYear > newYear || (currentYear === newYear && currentMonth > newMonth)) {
      break;
    }
    if (currentYear === newYear && currentMonth === newMonth) {
      monthCount++;
      break;
    }
    monthCount++;
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  return monthCount;
}

/** 跨过的月份列表，用于账期记账。month 为 1–12 */
export function getCrossedMonths(
  oldDateStr: string,
  newDateStr: string,
): Array<{ year: number; month: number }> {
  const oldDate = parseDate(oldDateStr);
  const newDate = parseDate(newDateStr);
  if (!oldDate || !newDate || newDate <= oldDate) return [];

  let currentYear = oldDate.getFullYear();
  let currentMonth = oldDate.getMonth();
  const oldDay = oldDate.getDate();
  const newYear = newDate.getFullYear();
  const newMonth = newDate.getMonth();

  if (oldDay > 1) {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  const result: Array<{ year: number; month: number }> = [];
  while (true) {
    if (currentYear > newYear || (currentYear === newYear && currentMonth > newMonth)) break;
    result.push({ year: currentYear, month: currentMonth + 1 });
    if (currentYear === newYear && currentMonth === newMonth) break;
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }
  return result;
}

/** 将 (year, month) 加 N 个月，返回 YYYY-MM */
function addMonthsToYM(year: number, month1Based: number, addMonths: number): string {
  let m = month1Based - 1 + addMonths;
  let y = year;
  while (m > 11) {
    m -= 12;
    y++;
  }
  while (m < 0) {
    m += 12;
    y--;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export interface CompanyCashWithReceivablesResult {
  cash: number;
  receivablesByDueMonth: Record<string, number>;
}

/**
 * 公司账户现金 + 应收账款（账期逻辑）：
 * 记账：每跨过一个月，该月各条收入来源的月毛利按「发生月 + 账期」记入到期月的应收账款；固定支出当月扣现金。
 * 收款：当前年月时，把所有到期月 ≤ 当前年月的应收账款加总进现金并销账。
 * 多个项目同一到期月会累加到同一 key，无问题。
 */
export function processCompanyCashWithReceivables(
  oldCash: number,
  oneTimeChange: number,
  crossedMonths: Array<{ year: number; month: number }>,
  currentYM: string,
  oldFixedCosts: Record<string, unknown>,
  oldRunningProjects: Record<string, { _monthlyGrossProfit?: number; $paymentTermMonths?: number } | unknown>,
  oldReceivablesByDueMonth: Record<string, number>,
): CompanyCashWithReceivablesResult {
  let cash = Number(oldCash) || 0;
  const receivables = _.cloneDeep(oldReceivablesByDueMonth) || {};

  const payrollCost = Number(_.get(oldFixedCosts, 'payroll')) || 0;
  const facilityCost = Number(_.get(oldFixedCosts, 'facilityCost')) || 0;
  const marketingCost = Number(_.get(oldFixedCosts, 'marketingBudget')) || 0;
  const otherOps = Number(_.get(oldFixedCosts, 'other')) || 0;
  const totalFixedCost = payrollCost + facilityCost + marketingCost + otherOps;

  for (const { year, month } of crossedMonths) {
    cash -= totalFixedCost;
    if (oldRunningProjects && typeof oldRunningProjects === 'object') {
      for (const projectId in oldRunningProjects) {
        const project = oldRunningProjects[projectId];
        if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
          const profit = Number((project as { _monthlyGrossProfit?: number })._monthlyGrossProfit) || 0;
          const termMonths = Number((project as { $paymentTermMonths?: number }).$paymentTermMonths) || 0;
          const dueKey = addMonthsToYM(year, month, termMonths);
          receivables[dueKey] = (receivables[dueKey] || 0) + profit;
        }
      }
    }
  }

  let totalCollected = 0;
  for (const dueKey of Object.keys(receivables)) {
    if (dueKey <= currentYM) {
      totalCollected += receivables[dueKey];
      delete receivables[dueKey];
    }
  }
  cash += totalCollected;
  cash += Number(oneTimeChange) || 0;

  return { cash, receivablesByDueMonth: receivables };
}

/**
 * 计算个人账户现金
 */
export function calculatePersonalCash(
  oldCash: number,
  oneTimeChange: number,
  monthCrossing: number,
  monthlyIncome: number,
  monthlyExpense: number,
): number {
  let cash = Number(oldCash) || 0;
  cash += Number(oneTimeChange) || 0;

  if (monthCrossing >= 1) {
    const monthlyNet = (Number(monthlyIncome) || 0) - (Number(monthlyExpense) || 0);
    cash += monthlyNet * monthCrossing;
  }

  return cash;
}

/**
 * 计算月毛利：月销量 * 单价 * (1 - 可变成本率)
 */
export function calculateMonthlyProfit(
  monthlySales: number,
  unitPrice: number,
  variableCostRate: number,
): number {
  const sales = Number(monthlySales) || 0;
  const price = Number(unitPrice) || 0;
  const costRate = _.clamp(Number(variableCostRate) || 0, 0, 1);
  return sales * price * (1 - costRate);
}
