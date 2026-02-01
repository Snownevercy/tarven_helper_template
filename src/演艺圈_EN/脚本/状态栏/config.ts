/**
 * 状态栏配置：存储键、位置、样式、模板、常量
 */

declare global {
  interface Window {
    FATE_CONFIG?: {
      storagePosIndex: string;
      storageCollapse: string;
      storageTab: string;
    };
  }
}

export const FATE_CONFIG = {
  storagePosIndex: 'fate_phone_pos_index_v9',
  storageCollapse: 'fate_phone_collapsed',
  storageTab: 'fate_phone_tab',
};

export const POSITIONS = [
  { name: 'TL', css: { top: '60px', left: '10px', bottom: 'auto', right: 'auto' } },
  { name: 'TR', css: { top: '60px', right: '10px', bottom: 'auto', left: 'auto' } },
] as const;

export type FateState = {
  currentTab: string;
  isCollapsed: boolean;
  posIndex: number;
};

export function getInitialFateState(): FateState {
  const cfg = window.FATE_CONFIG ?? FATE_CONFIG;
  const posIndex = Math.min(parseInt(localStorage.getItem(cfg.storagePosIndex) || '0') || 0, POSITIONS.length - 1);
  return {
    currentTab: localStorage.getItem(cfg.storageTab) || 'home',
    isCollapsed: localStorage.getItem(cfg.storageCollapse) === 'true',
    posIndex,
  };
}

/** 事件命名空间，便于 pagehide 时一次 off */
export const EVENTS_NS = 'fatephone';

/** 防抖延迟（ms） */
export const DEBOUNCE_MS = 500;

/** 初次渲染轮询间隔（ms） */
export const INIT_RENDER_INTERVAL_MS = 300;

/** 初次渲染最多轮询次数 */
export const INIT_RENDER_MAX = 3;

/** 时钟点击防抖（ms） */
export const CLOCK_DEBOUNCE_MS = 150;

/** 等待 $ 就绪的轮询间隔（ms） */
export const CHECK_READY_INTERVAL_MS = 200;

export const fateStyles = `
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

export const fateTemplate = `
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
