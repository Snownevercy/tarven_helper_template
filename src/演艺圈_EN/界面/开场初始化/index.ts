import { waitUntil } from 'async-wait-until';
import { Schema } from '../../schema';

import './index.scss';

function get(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return el?.value?.trim() ?? '';
}

/** 数字输入或纯数字文本 */
function parseNumber(text: string): number {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 从表单收集值并转为开场初始化用的部分 stat_data
 * 仅：艺人档案、世界/开机信息、个人账户（收入状况、当前存款）
 */
function collectFormData(): Record<string, unknown> {
  const dateRaw = get('world_currentDate');
  const dateStr = dateRaw ? dateRaw.replace('T', ' ') : '';
  const week = dateStr ? new Date(dateRaw).toLocaleDateString('zh-CN', { weekday: 'short' }) : '';
  const currentDateFormatted = dateStr && week ? `${dateStr} ${week}` : '待初始化';
  const openingScene = get('world_openingScene').trim();
  const eraNews = openingScene || '待初始化';

  return {
    world: {
      currentDate: currentDateFormatted,
      currentLocation: get('world_currentLocation') || '待初始化',
      eraNews,
      industryNews: '待初始化',
      gossipNews: '待初始化',
    },
    protagonist: {
      name: get('protagonist_name') || '待初始化',
      $birthday: get('protagonist_$birthday') || '待初始化',
      appearance: get('protagonist_appearance') || '待初始化',
      occupation: get('protagonist_occupation') || '待初始化',
      kink: get('protagonist_kink') || '无',
    },
    personalAccount: {
      monthlyFixedIncome: parseNumber(get('personalAccount_monthlyFixedIncome')),
      _cash: parseNumber(get('personalAccount__cash')),
    },
  };
}

/**
 * 深合并：只合并我们提供的部分，不覆盖未提供的嵌套对象
 */
function mergeStatData(base: Record<string, unknown>, partial: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(partial)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && _.isPlainObject(value)) {
      (out as Record<string, unknown>)[key] = mergeStatData(
        ((out[key] as Record<string, unknown>) ?? {}) as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

async function submit() {
  const btn = document.getElementById('btn') as HTMLButtonElement;
  if (btn.disabled) return;

  const messageId = getCurrentMessageId();
  const opt = { type: 'message' as const, message_id: messageId };

  let mvuData = Mvu.getMvuData(opt);
  const currentStat = (_.get(mvuData, 'stat_data', {}) ?? {}) as Record<string, unknown>;
  const partial = collectFormData();
  const merged = mergeStatData(currentStat, partial);
  const parsed = Schema.parse(merged);
  mvuData = { ...mvuData, stat_data: parsed };

  await Mvu.replaceMvuData(mvuData, opt);

  const world = parsed.world as { currentDate: string; currentLocation: string; eraNews: string };
  const instruction = `[OOC:
-时间锚点: ${world.currentDate},
-空间锚点: ${world.currentLocation},
-当前场景: ${world.eraNews},
请根据以上设定生成一段沉浸式开场。
]`;
  try {
    await triggerSlash(`/send ${instruction.replace(/\n/g, ' ')} | /trigger`);
  } catch (e) {
    console.warn('[开场初始化] 发送指令失败', e);
    toastr.warning('变量已写入，但发送指令失败，请手动发送一条消息请求生成开场');
  }

  btn.textContent = 'Cut!';
  btn.disabled = true;
  toastr.success('变量已写入当前楼层');
  console.info('[开场初始化] 变量已写入', { message_id: messageId });
}

$(async () => {
  await waitGlobalInitialized('Mvu');
  await waitUntil(() => _.has(getVariables({ type: 'message', message_id: getCurrentMessageId() }), 'stat_data'));

  const btn = document.getElementById('btn');
  if (btn) {
    btn.addEventListener('click', errorCatched(submit));
  }
});
