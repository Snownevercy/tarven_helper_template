/**
 * 保护只读字段不被 AI 直接覆盖，并自动计算只读字段的值
 *
 * - protagonist._age (根据 world.currentDate 和 protagonist.$birthday 计算)
 * - personalAccount._cash (根据上一轮数据 + 一次性变动 + 月度固定收支与跨月数计算)
 * - companyAccount._cash (根据上一轮数据 + 一次性变动 + 月度固定支出与收入来源月毛利、跨月数计算)
 * - companyAccount.monthlyRevenueSources.${id}._monthlyGrossProfit (根据 monthlyVolume * unitPrice * (1 - variableCostRate) 计算)
 * - companyAccount.monthlyRevenueSources.${id}._scope（当旧数据中已有值时，拒绝任何覆盖，始终保留旧值）
 */

import {
  calculateAge,
  calculateMonthCrossing,
  calculateMonthlyProfit,
  calculatePersonalCash,
  getCrossedMonths,
  processCompanyCashWithReceivables,
} from './calc';

interface ProjectWithProfit {
  _monthlyGrossProfit?: number;
  _scope?: string;
  monthlyVolume?: number;
  unitPrice?: number;
  variableCostRate?: number;
  $paymentTermMonths?: number;
}

export function setupReadonlyFields(): void {
  if (typeof Mvu === 'undefined' || !Mvu.events) {
    return;
  }
  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables: Record<string, unknown>, old_variables: Record<string, unknown>) => {
    const old_stat_data = _.get(old_variables, 'stat_data');
    const new_stat_data = _.get(new_variables, 'stat_data');

    if (!new_stat_data) {
      return;
    }

    console.info('[状态栏-只读字段] ===== 开始处理变量更新 =====');

    // 计算并保护 protagonist._age
    const currentDate = _.get(new_stat_data, 'world.currentDate');
    const birthday = _.get(new_stat_data, 'protagonist.$birthday');
    if (
      currentDate &&
      birthday &&
      currentDate !== '待定' &&
      currentDate !== '待初始化' &&
      birthday !== '待定' &&
      birthday !== '待初始化'
    ) {
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
    if (
      old_current_date &&
      new_current_date &&
      old_current_date !== '待定' &&
      old_current_date !== '待初始化' &&
      new_current_date !== '待定' &&
      new_current_date !== '待初始化'
    ) {
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
        Number(old_personal_cash),
        Number(personalOneTimeChange) || 0,
        monthCrossing,
        Number(old_monthly_income) || 0,
        Number(old_monthly_expense) || 0,
      );
      _.set(new_stat_data, 'personalAccount._cash', calculatedPersonalCash);
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

    // 计算并保护 companyAccount._cash 与 companyAccount.$receivablesByDueMonth（账期逻辑）
    const old_company_cash = _.get(old_stat_data, 'companyAccount._cash');
    const companyOneTimeChange = _.get(new_stat_data, 'companyAccount.oneTimeCompanyChange');
    const old_fixed_costs = _.get(old_stat_data, 'companyAccount.monthlyFixedExpenses');
    const old_running_projects = _.get(old_stat_data, 'companyAccount.monthlyRevenueSources');
    const old_receivables = _.get(old_stat_data, 'companyAccount.$receivablesByDueMonth', {}) as Record<string, number>;

    if (old_company_cash !== undefined) {
      const crossedMonths = getCrossedMonths(String(old_current_date ?? ''), String(new_current_date ?? ''));
      const currentYMMatch = new_current_date && String(new_current_date).match(/(\d{4})-(\d{2})/);
      const currentYM: string = currentYMMatch ? `${currentYMMatch[1]}-${currentYMMatch[2]}` : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

      const { cash: calculatedCash, receivablesByDueMonth: newReceivables } = processCompanyCashWithReceivables(
        Number(old_company_cash),
        Number(companyOneTimeChange) || 0,
        crossedMonths,
        currentYM,
        (old_fixed_costs || {}) as Record<string, unknown>,
        (old_running_projects || {}) as Record<string, { _monthlyGrossProfit?: number; $paymentTermMonths?: number }>,
        old_receivables,
      );
      _.set(new_stat_data, 'companyAccount._cash', Number(calculatedCash));
      _.set(new_stat_data, 'companyAccount.$receivablesByDueMonth', newReceivables);

      if (crossedMonths.length === 0) {
        console.info(
          `[状态栏-只读字段] 计算公司现金(未跨月): 旧现金=${old_company_cash}, 一次性变动=${companyOneTimeChange}, 新现金=${calculatedCash}`,
        );
      } else {
        const payrollCost = Number(_.get(old_fixed_costs, 'payroll')) || 0;
        const facilityCost = Number(_.get(old_fixed_costs, 'facilityCost')) || 0;
        const marketingCost = Number(_.get(old_fixed_costs, 'marketingBudget')) || 0;
        const otherCost = Number(_.get(old_fixed_costs, 'other')) || 0;
        const totalFixedCost = payrollCost + facilityCost + marketingCost + otherCost;
        let totalMonthlyProfit = 0;
        const projectProfits: Record<string, number> = {};
        const runningProjectsForLog = (old_running_projects && typeof old_running_projects === 'object' ? old_running_projects : {}) as Record<string, ProjectWithProfit>;
        for (const projectId in runningProjectsForLog) {
          const project = runningProjectsForLog[projectId];
          if (project && typeof project === 'object' && '_monthlyGrossProfit' in project) {
            const monthlyProfit = Number(project._monthlyGrossProfit) || 0;
            totalMonthlyProfit += monthlyProfit;
            projectProfits[projectId] = monthlyProfit;
          }
        }
        console.info(
          `[状态栏-只读字段] 计算公司现金(账期,跨${crossedMonths.length}个月): 旧现金=${old_company_cash}, 一次性变动=${companyOneTimeChange}, 月度固定支出=${totalFixedCost}, 月毛利总和=${totalMonthlyProfit}, 新现金=${calculatedCash}, 应收账款键数=${Object.keys(newReceivables).length}`,
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
    const new_running_projects = _.get(new_stat_data, 'companyAccount.monthlyRevenueSources') as Record<string, ProjectWithProfit> | undefined;
    if (new_running_projects && typeof new_running_projects === 'object') {
      const old_running_projects_for_scope = (old_running_projects && typeof old_running_projects === 'object' ? old_running_projects : {}) as Record<string, ProjectWithProfit>;

      for (const projectId in new_running_projects) {
        const new_project = new_running_projects[projectId];
        const old_project = old_running_projects_for_scope[projectId];

        if (new_project && typeof new_project === 'object') {
          if (old_project && typeof old_project === 'object' && '_scope' in old_project) {
            const oldScope = old_project._scope;
            const newScope = new_project._scope;
            if (newScope !== undefined && newScope !== oldScope) {
              _.set(new_stat_data, `companyAccount.monthlyRevenueSources.${projectId}._scope`, oldScope);
              console.info(
                `[状态栏-只读字段] 保护_scope: 项目=${projectId}, 拒绝修改为=${newScope}, 保留旧值=${oldScope}`,
              );
            }
          }

          const monthlyVolume = new_project.monthlyVolume;
          const unitPrice = new_project.unitPrice;
          const variableCostRate = new_project.variableCostRate ?? 0.3;
          const calculatedProfit = calculateMonthlyProfit(monthlyVolume ?? 0, unitPrice ?? 0, variableCostRate);
          _.set(
            new_stat_data,
            `companyAccount.monthlyRevenueSources.${projectId}._monthlyGrossProfit`,
            calculatedProfit,
          );
          console.info(
            `[状态栏-只读字段] 计算项目月毛利: 项目=${projectId}, monthlyVolume=${monthlyVolume}, unitPrice=${unitPrice}, variableCostRate=${variableCostRate}, _monthlyGrossProfit=${calculatedProfit}`,
          );
        }
      }
    }

    console.info('[状态栏-只读字段] ===== 变量更新处理完成 =====');
  });
}
