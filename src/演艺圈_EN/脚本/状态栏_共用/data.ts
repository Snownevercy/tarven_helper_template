/**
 * 状态栏共用数据层：获取 MVU 数据、按路径取值、解析前规范化
 * 供「状态栏」「状态栏_档案」两版 UI 共用。
 */

import { Schema } from '../../schema';

export type SchemaData = z.infer<typeof Schema>;

/** 当前咖位合法枚举值，与 schema 中 professionalAssessment.currentTier 一致 */
const VALID_CURRENT_TIERS = ['待初始化', '素人', '十八线', '三线', '二线', '一线', '顶流', '天王巨星'] as const;

/**
 * 解析前规范化 stat_data：AI 或世界书可能写出不在 enum 内的值（如空串、空格、错别字），
 * 统一为合法值以免 Schema.parse 抛错。
 */
function normalizeStatDataBeforeParse(raw: Record<string, unknown>): Record<string, unknown> {
  const data = _.cloneDeep(raw);
  const tier = _.get(data, 'professionalAssessment.currentTier');
  if (
    tier !== undefined &&
    tier !== null &&
    !VALID_CURRENT_TIERS.includes(tier as (typeof VALID_CURRENT_TIERS)[number])
  ) {
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
