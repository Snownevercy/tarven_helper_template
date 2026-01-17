/**
 * 保护只读字段不被AI更新，并自动计算只读字段的值
 *
 * 根据MVU变量框架文档，通过监听 VARIABLE_UPDATE_ENDED 事件，
 * 自动计算并保护以下只读字段：
 * - 主角._年龄 (根据 世界.当前日期 和 主角.生日 计算)
 * - 公司账户._现金 (由脚本根据固定成本、运行项目和一次性变动自动计算)
 * - 公司账户.运行项目.${项目名}._月毛利 (根据 月销量 * 单价 * (1 - 边际成本率) 计算)
 */

/**
 * 解析日期字符串，提取 YYYY-MM-DD 部分
 * 支持格式：YYYY-MM-DD 周X HH:mm 或 YYYY-MM-DD
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === '待定') {
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
 * 计算月毛利：月销量 * 单价 * (1 - 边际成本率)
 */
function calculateMonthlyProfit(monthlySales: number, unitPrice: number, marginalCostRate: number): number {
  const sales = Number(monthlySales) || 0;
  const price = Number(unitPrice) || 0;
  const costRate = Number(marginalCostRate) || 0;
  // 确保边际成本率在 0-1 之间
  const clampedCostRate = _.clamp(costRate, 0, 1);
  return sales * price * (1 - clampedCostRate);
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
 * 跨月数>=1：_现金 = 上一轮_现金 + 最新公账一次性变动 - 固定成本(上一轮) * 跨月数 + 所有运行项目月毛利(上一轮) * 跨月数
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

  // 如果跨月，需要扣除固定成本，加上运行项目的月毛利
  if (monthCrossing >= 1) {
    // 计算固定成本（人力成本 + 房租）
    const humanCost = Number(_.get(oldFixedCosts, '人力成本')) || 0;
    const rentCost = Number(_.get(oldFixedCosts, '房租')) || 0;
    const totalFixedCost = humanCost + rentCost;

    // 计算所有运行项目的月毛利总和
    let totalMonthlyProfit = 0;
    if (oldRunningProjects && typeof oldRunningProjects === 'object') {
      for (const project_name in oldRunningProjects) {
        const project = oldRunningProjects[project_name];
        if (project && typeof project === 'object' && '_月毛利' in project) {
          const monthlyProfit = Number(project._月毛利) || 0;
          totalMonthlyProfit += monthlyProfit;
        }
      }
    }

    // 扣除固定成本，加上月毛利（乘以跨月数）
    cash -= totalFixedCost * monthCrossing;
    cash += totalMonthlyProfit * monthCrossing;
  }

  return cash;
}

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');

    // 监听变量更新结束事件
    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
      const old_stat_data = _.get(old_variables, 'stat_data');
      const new_stat_data = _.get(new_variables, 'stat_data');

      if (!new_stat_data) {
        return;
      }

      console.info('[只读字段保护] ===== 开始处理变量更新 =====');

      // 计算并保护 主角._年龄
      const currentDate = _.get(new_stat_data, '世界.当前日期');
      const birthday = _.get(new_stat_data, '主角.生日');
      if (currentDate && birthday && currentDate !== '待定' && birthday !== '待定') {
        const calculatedAge = calculateAge(currentDate, birthday);
        if (calculatedAge !== null) {
          _.set(new_stat_data, '主角._年龄', calculatedAge);
          console.info(`[只读字段保护] 计算年龄: 当前日期=${currentDate}, 生日=${birthday}, 年龄=${calculatedAge}`);
        } else {
          console.warn(`[只读字段保护] 年龄计算失败: 当前日期=${currentDate}, 生日=${birthday}`);
        }
      }

      // 计算并保护 公司账户._现金
      const old_current_date = _.get(old_stat_data, '世界.当前日期');
      const new_current_date = _.get(new_stat_data, '世界.当前日期');
      const old_company_cash = _.get(old_stat_data, '公司账户._现金');
      const oneTimeChange = _.get(new_stat_data, '公司账户.公账一次性变动');
      const old_fixed_costs = _.get(old_stat_data, '公司账户.固定成本');
      const old_running_projects = _.get(old_stat_data, '公司账户.运行项目');

      if (
        old_current_date &&
        new_current_date &&
        old_current_date !== '待定' &&
        new_current_date !== '待定' &&
        old_company_cash !== undefined
      ) {
        // 计算跨月数
        const monthCrossing = calculateMonthCrossing(old_current_date, new_current_date);
        console.info(
          `[只读字段保护] 计算跨月数: 旧日期=${old_current_date}, 新日期=${new_current_date}, 跨月数=${monthCrossing}`,
        );

        // 计算固定成本和月毛利（用于日志）
        const humanCost = Number(_.get(old_fixed_costs, '人力成本')) || 0;
        const rentCost = Number(_.get(old_fixed_costs, '房租')) || 0;
        const totalFixedCost = humanCost + rentCost;

        let totalMonthlyProfit = 0;
        const projectProfits: Record<string, number> = {};
        if (old_running_projects && typeof old_running_projects === 'object') {
          for (const project_name in old_running_projects) {
            const project = old_running_projects[project_name];
            if (project && typeof project === 'object' && '_月毛利' in project) {
              const monthlyProfit = Number(project._月毛利) || 0;
              totalMonthlyProfit += monthlyProfit;
              projectProfits[project_name] = monthlyProfit;
            }
          }
        }

        // 计算新的现金值
        const calculatedCash = calculateCompanyCash(
          old_company_cash,
          oneTimeChange,
          monthCrossing,
          old_fixed_costs,
          old_running_projects,
        );

        _.set(new_stat_data, '公司账户._现金', calculatedCash);

        // 记录现金计算详情
        if (monthCrossing === 0) {
          console.info(
            `[只读字段保护] 计算公司现金(未跨月): 旧现金=${old_company_cash}, 一次性变动=${oneTimeChange}, 新现金=${calculatedCash}`,
          );
        } else {
          console.info(
            `[只读字段保护] 计算公司现金(跨${monthCrossing}个月): 旧现金=${old_company_cash}, 一次性变动=${oneTimeChange}, 固定成本=${totalFixedCost}(${humanCost}+${rentCost}), 月毛利总和=${totalMonthlyProfit}, 新现金=${calculatedCash}`,
          );
          if (Object.keys(projectProfits).length > 0) {
            console.info(
              `[只读字段保护] 各项目月毛利详情: ${Object.entries(projectProfits)
                .map(([name, profit]) => `${name}=${profit}`)
                .join(', ')}`,
            );
          }
        }
      } else if (old_company_cash !== undefined) {
        // 如果日期信息不完整，保持旧值
        _.set(new_stat_data, '公司账户._现金', old_company_cash);
        console.warn(
          `[只读字段保护] 公司现金计算跳过(日期信息不完整): 旧日期=${old_current_date}, 新日期=${new_current_date}, 保持旧值=${old_company_cash}`,
        );
      }

      // 计算并保护 公司账户.运行项目.${项目名}._月毛利
      const new_running_projects = _.get(new_stat_data, '公司账户.运行项目');
      if (new_running_projects && typeof new_running_projects === 'object') {
        // 遍历新项目中的所有项目
        for (const project_name in new_running_projects) {
          const new_project = new_running_projects[project_name];
          if (new_project && typeof new_project === 'object') {
            const monthlySales = new_project.月销量;
            const unitPrice = new_project.单价;
            const marginalCostRate = new_project.边际成本率;

            // 计算月毛利：月销量 * 单价 * (1 - 边际成本率)
            const calculatedProfit = calculateMonthlyProfit(monthlySales, unitPrice, marginalCostRate);
            _.set(new_stat_data, `公司账户.运行项目.${project_name}._月毛利`, calculatedProfit);

            console.info(
              `[只读字段保护] 计算项目月毛利: 项目=${project_name}, 月销量=${monthlySales}, 单价=${unitPrice}, 边际成本率=${marginalCostRate}, 月毛利=${calculatedProfit}`,
            );
          }
        }
      }

      console.info('[只读字段保护] ===== 变量更新处理完成 =====');
    });

    console.info('[只读字段保护] 脚本已加载，开始监听变量更新事件');
  })();
});
