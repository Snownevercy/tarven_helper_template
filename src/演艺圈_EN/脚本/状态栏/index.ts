/**
 * 状态栏脚本入口：悬浮手机界面 + 只读字段逻辑
 * 模块：calc（计算）、config（配置/样式/模板）、render（渲染）、readonlyFields（只读字段保护）
 */

import { waitUntil } from 'async-wait-until';
import { Schema } from '../../schema';
import {
  calculateCompanyCash,
  calculateMonthCrossing,
  calculatePersonalCash,
} from './calc';
import {
  CHECK_READY_INTERVAL_MS,
  CLOCK_DEBOUNCE_MS,
  DEBOUNCE_MS,
  EVENTS_NS,
  FATE_CONFIG,
  fateStyles,
  fateTemplate,
  getInitialFateState,
  INIT_RENDER_INTERVAL_MS,
  INIT_RENDER_MAX,
  POSITIONS,
} from './config';
import { getMvuDataSafe, getVal, renderModules } from './render';
import { setupReadonlyFields } from './readonlyFields';

$('#fate-phone-container, #fate-phone-css').remove();
$(document).off(`.${EVENTS_NS}`);

window.FATE_CONFIG = FATE_CONFIG;

const fateState = getInitialFateState();

const MODAL_HTML = `
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

function nextRevenueSourceId(sources: Record<string, unknown>): string {
  const ids = Object.keys(sources).filter(k => /^id_\d+$/.test(k));
  const max = ids.reduce((m, k) => Math.max(m, parseInt(k.replace(/^id_/, ''), 10) || 0), 0);
  return `id_${max + 1}`;
}

let initIntervalId: ReturnType<typeof setInterval> | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;

function initFatePhone(): void {
  $('head').append(fateStyles);
  $('body').prepend(fateTemplate);
  $('body').append(MODAL_HTML);

  const container = $('#fate-phone-container');
  const content = $('#fp-content');
  /** 是否为「新增」模式（否则为「编辑」）。存在模态框 data 上，避免父页点击保存时闭包拿不到 */
  const getIsAddMode = (): boolean =>
    $('#project-modal').data('modal-is-add-mode') === true;
  const setIsAddMode = (isAdd: boolean) => {
    $('#project-modal').data('modal-is-add-mode', isAdd);
  };
  /** 编辑时的 projectId（仅编辑模式有效） */
  const getEditingProjectId = (): string | null =>
    $('#project-modal').data('editing-project-id') ?? null;
  const setEditingProjectId = (id: string | null) => {
    $('#project-modal').data('editing-project-id', id ?? undefined);
  };

  const applyPosition = () => {
    const pos = POSITIONS[fateState.posIndex];
    container.css({ top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' });
    container.css(pos.css);
  };
  applyPosition();

  const render = () => {
    let sd: ReturnType<typeof getMvuDataSafe>;
    try {
      sd = getMvuDataSafe();
    } catch (e) {
      console.warn('状态栏获取数据失败:', e);
      $('#fp-content').html(
        '<div class="card"><div style="font-size:11px; color:#888; padding:8px;">数据加载失败，请确保已选择角色卡并存在最新楼层。</div></div>',
      );
      $('#fp-title').text('逐梦演艺圈');
      $('#fp-quote').text('在娱乐圈的浮沉中寻找自己的位置');
      $('.nav-item').removeClass('active');
      $(`.nav-item[data-tab="${fateState.currentTab}"]`).addClass('active');
      return;
    }
    $('#fp-title').text('逐梦演艺圈');
    $('#fp-quote').text('在娱乐圈的浮沉中寻找自己的位置');
    const timeStr = getVal(sd, 'world.currentDate', '待初始化');
    const timeMatch = String(timeStr).match(/(\d{2}:\d{2})/);
    $('#fp-clock').text(timeMatch ? timeMatch[1] : '12:00');
    if (fateState.isCollapsed) container.addClass('collapsed');
    else container.removeClass('collapsed');
    const tab = fateState.currentTab as keyof typeof renderModules;
    const renderer = renderModules[tab] ?? renderModules.home;
    try {
      $('#fp-content').html(renderer(sd));
    } catch (e) {
      console.warn('状态栏渲染失败:', e);
      $('#fp-content').html(
        '<div class="card"><div style="font-size:11px; color:#888; padding:8px;">当前 Tab 渲染出错。</div></div>',
      );
    }
    $('.nav-item').removeClass('active');
    $(`.nav-item[data-tab="${fateState.currentTab}"]`).addClass('active');
  };

  container.on(`click.${EVENTS_NS}`, '.nav-item', function (e) {
    e.stopPropagation();
    fateState.currentTab = $(this).data('tab');
    localStorage.setItem(window.FATE_CONFIG?.storageTab ?? '', fateState.currentTab);
    render();
  });

  const toggleCollapse = (e: JQuery.Event) => {
    e.stopPropagation();
    fateState.isCollapsed = !fateState.isCollapsed;
    localStorage.setItem(window.FATE_CONFIG?.storageCollapse ?? '', String(fateState.isCollapsed));
    render();
  };
  container.on(`click.${EVENTS_NS}`, '#btn-collapse, .icon-placeholder', toggleCollapse);

  let clockClickTimer: ReturnType<typeof setTimeout> | null = null;
  const handleClockClick = (e: JQuery.Event) => {
    e.stopPropagation();
    e.preventDefault();
    if (clockClickTimer) clearTimeout(clockClickTimer);
    clockClickTimer = setTimeout(() => {
      fateState.posIndex = (fateState.posIndex + 1) % POSITIONS.length;
      localStorage.setItem(window.FATE_CONFIG?.storagePosIndex ?? '', String(fateState.posIndex));
      applyPosition();
      clockClickTimer = null;
    }, CLOCK_DEBOUNCE_MS);
  };
  container.on(`click.${EVENTS_NS}`, '#fp-clock', handleClockClick);
  container.on(`touchstart.${EVENTS_NS}`, '#fp-clock', (e) => e.stopPropagation());
  container.on(`touchend.${EVENTS_NS}`, '#fp-clock', (e) => {
    e.stopPropagation();
    handleClockClick(e);
  });

  const openProjectModal = (projectId?: string) => {
    const modal = $('#project-modal');
    const isEdit = !!projectId;
    setIsAddMode(!isEdit);
    setEditingProjectId(isEdit ? projectId ?? null : null);
    $('#modal-title').text(isEdit ? '编辑收入来源' : '新增收入来源');
    $('#modal-project-name').prop('disabled', false);
    if (isEdit && projectId) {
      try {
        const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
        const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));
        const sources = stat_data.companyAccount?.monthlyRevenueSources;
        if (sources && typeof sources === 'object' && sources[projectId]) {
          const project = sources[projectId] as { name?: string; monthlyVolume?: number; unitPrice?: number; variableCostRate?: number };
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
      const projectId = getIsAddMode() ? nextRevenueSourceId(sources) : (getEditingProjectId() ?? nextRevenueSourceId(sources));
      const _monthlyGrossProfit = monthlyVolume * unitPrice * (1 - _.clamp(costRate, 0, 1));
      const existing = sources[projectId] as { _scope?: string } | undefined;
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
      setIsAddMode(false);
      setEditingProjectId(null);
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
    const name = (stat_data.companyAccount?.monthlyRevenueSources as Record<string, { name?: string }>)?.[projectId]?.name ?? projectId;
    if (!confirm(`确定要删除「${name}」吗？`)) return;
    try {
      if (
        stat_data.companyAccount?.monthlyRevenueSources &&
        projectId in stat_data.companyAccount.monthlyRevenueSources
      ) {
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

  const recalculateCash = async () => {
    try {
      const currentVariables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      const currentStatData = Schema.parse(_.get(currentVariables, 'stat_data', {}));
      let oldVariables: Record<string, unknown>;
      try {
        oldVariables = Mvu.getMvuData({ type: 'message', message_id: -2 });
      } catch {
        oldVariables = currentVariables;
      }
      const oldStatData = _.get(oldVariables, 'stat_data', {});
      const oldCurrentDate = _.get(oldStatData, 'world.currentDate');
      const newCurrentDate = _.get(currentStatData, 'world.currentDate');
      const oldCompanyCash = _.get(oldStatData, 'companyAccount._cash', 0);
      const companyOneTimeChange = _.get(currentStatData, 'companyAccount.oneTimeCompanyChange', 0);
      const oldFixedCosts = _.get(oldStatData, 'companyAccount.monthlyFixedExpenses', {});
      const oldRunningProjects = _.get(oldStatData, 'companyAccount.monthlyRevenueSources', {});
      const oldPersonalCash = _.get(oldStatData, 'personalAccount._cash', 0);
      const personalOneTimeChange = _.get(currentStatData, 'personalAccount.oneTimePersonalChange', 0);
      const oldMonthlyIncome = _.get(oldStatData, 'personalAccount.monthlyFixedIncome', 0);
      const oldMonthlyExpense = _.get(oldStatData, 'personalAccount.monthlyFixedExpense', 0);

      const datesValid =
        oldCurrentDate &&
        newCurrentDate &&
        oldCurrentDate !== '待定' &&
        oldCurrentDate !== '待初始化' &&
        newCurrentDate !== '待定' &&
        newCurrentDate !== '待初始化';

      if (datesValid) {
        const monthCrossing = calculateMonthCrossing(oldCurrentDate, newCurrentDate);
        const calculatedCompanyCash = calculateCompanyCash(
          oldCompanyCash,
          companyOneTimeChange,
          monthCrossing,
          oldFixedCosts,
          oldRunningProjects,
        );
        const calculatedPersonalCash = calculatePersonalCash(
          oldPersonalCash,
          personalOneTimeChange,
          monthCrossing,
          oldMonthlyIncome,
          oldMonthlyExpense,
        );
        _.set(currentStatData, 'companyAccount._cash', calculatedCompanyCash);
        _.set(currentStatData, 'personalAccount._cash', calculatedPersonalCash);
        _.set(currentVariables, 'stat_data', currentStatData);
        await Mvu.replaceMvuData(currentVariables, { type: 'message', message_id: 'latest' });
        const payrollCost = Number(_.get(oldFixedCosts, 'payroll')) || 0;
        const facilityCost = Number(_.get(oldFixedCosts, 'facilityCost')) || 0;
        const marketingCost = Number(_.get(oldFixedCosts, 'marketingBudget')) || 0;
        const otherOps = Number(_.get(oldFixedCosts, 'other')) || 0;
        const totalFixedCost = payrollCost + facilityCost + marketingCost + otherOps;
        let totalMonthlyProfit = 0;
        if (oldRunningProjects && typeof oldRunningProjects === 'object') {
          for (const pid in oldRunningProjects) {
            const p = oldRunningProjects[pid];
            if (p && typeof p === 'object' && '_monthlyGrossProfit' in p) {
              totalMonthlyProfit += Number((p as { _monthlyGrossProfit?: number })._monthlyGrossProfit) || 0;
            }
          }
        }
        const monthlyNet = (Number(oldMonthlyIncome) || 0) - (Number(oldMonthlyExpense) || 0);
        let msg = `现金重算完成！\n\n【公司账户】\n旧现金: ¥${Number(oldCompanyCash).toLocaleString()}\n新现金: ¥${calculatedCompanyCash.toLocaleString()}\n\n【个人账户】\n旧现金: ¥${Number(oldPersonalCash).toLocaleString()}\n新现金: ¥${calculatedPersonalCash.toLocaleString()}`;
        if (monthCrossing > 0) {
          msg += `\n\n【跨月计算】\n跨月数: ${monthCrossing}\n公司月度固定支出: ¥${totalFixedCost.toLocaleString()}/月\n公司月毛利: ¥${totalMonthlyProfit.toLocaleString()}/月\n个人月净收入: ¥${monthlyNet.toLocaleString()}/月`;
        }
        toastr.success(msg, '重算现金', { timeOut: 8000 });
      } else {
        const currentCompanyCash = _.get(currentStatData, 'companyAccount._cash', 0);
        const currentPersonalCash = _.get(currentStatData, 'personalAccount._cash', 0);
        const newCompanyCash = Number(currentCompanyCash) + Number(companyOneTimeChange);
        const newPersonalCash = Number(currentPersonalCash) + Number(personalOneTimeChange);
        _.set(currentStatData, 'companyAccount._cash', newCompanyCash);
        _.set(currentStatData, 'personalAccount._cash', newPersonalCash);
        _.set(currentVariables, 'stat_data', currentStatData);
        await Mvu.replaceMvuData(currentVariables, { type: 'message', message_id: 'latest' });
        let msg = `现金重算完成（简化模式）！\n\n【公司账户】\n当前: ¥${Number(currentCompanyCash).toLocaleString()}\n变动: ${companyOneTimeChange >= 0 ? '+' : ''}¥${Number(companyOneTimeChange).toLocaleString()}\n新值: ¥${newCompanyCash.toLocaleString()}\n\n【个人账户】\n当前: ¥${Number(currentPersonalCash).toLocaleString()}\n变动: ${personalOneTimeChange >= 0 ? '+' : ''}¥${Number(personalOneTimeChange).toLocaleString()}\n新值: ¥${newPersonalCash.toLocaleString()}`;
        toastr.success(msg, '重算现金', { timeOut: 8000 });
      }
      render();
    } catch (e) {
      console.error('重算现金失败:', e);
      toastr.error('重算现金失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  container.on(`click.${EVENTS_NS}`, '.btn-add-project', (e) => {
    e.stopPropagation();
    openProjectModal();
  });
  container.on(`click.${EVENTS_NS}`, '.btn-edit-project', function (e) {
    e.stopPropagation();
    const projectId = $(this).data('project-id');
    if (projectId) openProjectModal(projectId);
  });
  container.on(`click.${EVENTS_NS}`, '.btn-delete-project', function (e) {
    e.stopPropagation();
    const projectId = $(this).data('project-id');
    if (projectId) deleteProject(projectId);
  });
  container.on(`click.${EVENTS_NS}`, '.btn-recalculate-cash', (e) => {
    e.stopPropagation();
    recalculateCash();
  });

  // 模态框在父页 body 上，须在父页 document 上绑定事件，否则 iframe 内 document 收不到点击
  const $parentDoc = $(window.parent.document);
  $parentDoc.on(`click.${EVENTS_NS}`, '#modal-cancel, #project-modal', function (e) {
    if (e.target === this) closeProjectModal();
  });
  $parentDoc.on(`click.${EVENTS_NS}`, '#modal-save', (e) => {
    e.stopPropagation();
    saveProject();
  });
  $parentDoc.on(`keydown.${EVENTS_NS}`, '#project-modal input', function (e) {
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
    startY = y - (content.offset()?.top ?? 0);
    scrollTop = content.scrollTop() ?? 0;
  };
  const doDrag = (y: number) => {
    if (!isDown) return;
    const yPos = y - (content.offset()?.top ?? 0);
    content.scrollTop(scrollTop - (yPos - startY) * 1.5);
  };
  const stopDrag = () => {
    isDown = false;
    content.removeClass('grabbing');
  };
  content.on(`mousedown.${EVENTS_NS}`, (e) => startDrag(e.pageY));
  content.on(`mouseleave.${EVENTS_NS}`, stopDrag);
  content.on(`mouseup.${EVENTS_NS}`, stopDrag);
  content.on(`mousemove.${EVENTS_NS}`, (e) => {
    if (isDown) {
      e.preventDefault();
      doDrag(e.pageY);
    }
  });
  content.on(`touchstart.${EVENTS_NS}`, (e) => {
    if (e.originalEvent?.touches?.[0]) startDrag(e.originalEvent.touches[0].pageY);
  });
  content.on(`touchend.${EVENTS_NS}`, stopDrag);
  content.on(`touchmove.${EVENTS_NS}`, (e) => {
    if (isDown && e.originalEvent?.touches?.[0]) doDrag(e.originalEvent.touches[0].pageY);
  });

  render();
  let initCount = 0;
  initIntervalId = setInterval(() => {
    render();
    initCount++;
    if (initCount >= INIT_RENDER_MAX && initIntervalId) {
      clearInterval(initIntervalId);
      initIntervalId = null;
    }
  }, INIT_RENDER_INTERVAL_MS);

  const debouncedUpdate = () => {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      render();
      updateTimer = null;
    }, DEBOUNCE_MS);
  };
  if (typeof eventOn === 'function') {
    if (typeof tavern_events !== 'undefined') {
      eventOn(tavern_events.MESSAGE_RECEIVED, debouncedUpdate);
    }
    if (typeof Mvu !== 'undefined' && Mvu.events) {
      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, debouncedUpdate);
    }
    try {
      const parent = window.parent as Window & { eventOn?: typeof eventOn; Mvu?: typeof Mvu };
      if (parent?.eventOn && parent?.Mvu?.events) {
        parent.eventOn(parent.Mvu.events.VARIABLE_UPDATE_ENDED, debouncedUpdate);
      }
    } catch {
      // 忽略跨域
    }
  }

  setupReadonlyFields();
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
      } catch {
        return false;
      }
      return false;
    });
    const checkReady = setInterval(() => {
      if (typeof $ !== 'undefined') {
        clearInterval(checkReady);
        initFatePhone();
      }
    }, CHECK_READY_INTERVAL_MS);
  }),
);

$(window).on('pagehide', () => {
  if (initIntervalId) {
    clearInterval(initIntervalId);
    initIntervalId = null;
  }
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  $('#fate-phone-container, #fate-phone-css, #project-modal').remove();
  $(document).off(`.${EVENTS_NS}`);
  $(window.parent.document).off(`.${EVENTS_NS}`);
});
