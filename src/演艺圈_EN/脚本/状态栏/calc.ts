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

/**
 * 计算公司账户现金
 */
export function calculateCompanyCash(
  oldCash: number,
  oneTimeChange: number,
  monthCrossing: number,
  oldFixedCosts: Record<string, unknown>,
  oldRunningProjects: Record<string, { _monthlyGrossProfit?: number } | unknown>,
): number {
  let cash = Number(oldCash) || 0;
  cash += Number(oneTimeChange) || 0;

  if (monthCrossing >= 1) {
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
          totalMonthlyProfit += Number((project as { _monthlyGrossProfit?: number })._monthlyGrossProfit) || 0;
        }
      }
    }

    cash -= totalFixedCost * monthCrossing;
    cash += totalMonthlyProfit * monthCrossing;
  }

  return cash;
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
