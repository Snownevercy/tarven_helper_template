/**
 * 档案风新状态栏脚本
 *
 * - UI：采用类似 archive-system.html 的左侧纵向标签 + 档案夹内容区布局
 * - 功能：复用原「状态栏」脚本的 MVU 读写、商业账户增删改、重算现金等逻辑
 *
 * 依赖：
 * - ../../schema           — MVU 变量结构定义
 * - ../状态栏_共用/calc    — 现金重算相关计算函数
 * - ../状态栏_共用/data    — getMvuDataSafe / getVal
 * - ../状态栏_共用/readonlyFields — 只读字段保护
 *
 * 注意：
 * - 为避免污染酒馆全局样式，CSS 全部用 #archive-status-root 前缀做作用域限制
 * - 与旧状态栏脚本可以并存，彼此 DOM id / CSS 不冲突
 */

import { waitUntil } from 'async-wait-until';
import { Schema } from '../../schema';
import {
  calculateMonthCrossing,
  calculatePersonalCash,
  getCrossedMonths,
  processCompanyCashWithReceivables,
} from '../状态栏_共用/calc';
import { getMvuDataSafe, getVal } from '../状态栏_共用/data';
import { setupReadonlyFields } from '../状态栏_共用/readonlyFields';

const EVENTS_NS = 'archiveStatus';
const STORAGE_TAB_KEY = 'archive_status_tab_v1';
const STORAGE_COLLAPSE_KEY = 'archive_status_collapsed_v1';

// ===== 样式：档案夹外壳 + 复用原卡片元素 =====

const ARCHIVE_STATUS_STYLES = `
<style id="archive-status-css">
  /* 与小手机 TL 一致：整体固定在左上角，初始为左上角按钮，点击展开后面板也从左上角展开 */
  #archive-status-root {
    position: fixed;
    top: 60px;
    left: 10px;
    bottom: auto;
    right: auto;
    z-index: 500;
    font-family: 'Songti SC', 'SimSun', serif;
    color: #1c1917;
  }

  #archive-status-root * {
    box-sizing: border-box;
  }

  /* 开关图标：展开时在侧边栏最上方，收起时固定在视口左上角（便于手机可见） */
  #archive-status-toggle {
    position: absolute;
    left: 0.25rem;
    top: 0.75rem;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: #111827;
    color: #f9fafb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.6);
    cursor: pointer;
    border: 2px solid #e5e7eb;
    z-index: 510;
  }

  #archive-status-root.collapsed .archive-container {
    display: none;
  }

  /* 收起时：开关固定到视口左上角，避免手机右上角被刘海/状态栏遮挡 */
  #archive-status-root.collapsed #archive-status-toggle {
    position: fixed;
    left: 10px;
    top: 60px;
    right: auto;
    background: #111827;
    color: #f9fafb;
  }

  #archive-status-root:not(.collapsed) #archive-status-toggle {
    background: #fbbf24;
    color: #78350f;
  }

  #archive-status-root .archive-container {
    width: min(700px, 95vw);
    height: min(700px, 70vh);
    position: relative;
  }

  #archive-status-root .folder-background {
    width: 100%;
    height: 100%;
    background: #d4a574;
    background-image:
      repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, transparent 1px, transparent 2px, rgba(0,0,0,0.03) 3px),
      repeating-linear-gradient(90deg, rgba(0,0,0,0.03) 0px, transparent 1px, transparent 2px, rgba(0,0,0,0.03) 3px);
    border-top: 4px solid #b8956a;
    border-radius: 1.5rem 1.5rem 0 0;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    display: flex;
    position: relative;
    overflow: hidden;
  }

  /* 左侧纵向标签栏：顶部留出开关按钮高度，避免与开关重叠 */
  #archive-status-root .tab-sidebar {
    width: 3.5rem;
    flex-shrink: 0;
    padding-top: 3.25rem;
    padding-bottom: 0.75rem;
    padding-left: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  #archive-status-root .tab-label {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3.1rem;
    background: #d4a574;
    background-image: repeating-linear-gradient(
      0deg,
      rgba(0,0,0,0.03) 0px,
      transparent 1px,
      transparent 2px,
      rgba(0,0,0,0.03) 3px
    );
    border-radius: 0 0.7rem 0.7rem 0;
    cursor: pointer;
    color: #5a5a5a;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  #archive-status-root .tab-label:hover {
    background: #c9a070;
    transform: translateX(0.2rem);
  }

  #archive-status-root .tab-label.active {
    color: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    transform: translateX(0.25rem);
  }

  /* 标签高亮配色参照 archive-system.html */
  #archive-status-root .tab-label[data-tab="protagonist"].active {
    background: #3b82f6; /* 个人档案 */
  }
  #archive-status-root .tab-label[data-tab="career"].active {
    background: #f59e0b; /* 职业履历 */
  }
  #archive-status-root .tab-label[data-tab="personal"].active {
    background: #10b981; /* 个人账户 */
  }
  #archive-status-root .tab-label[data-tab="company"].active {
    background: #059669; /* 公司账户 */
  }
  #archive-status-root .tab-label[data-tab="network"].active {
    background: #ec4899; /* 社交网络 */
  }
  #archive-status-root .tab-label[data-tab="world"].active {
    background: #06b6d4; /* 世界动态 */
  }
  #archive-status-root .tab-label[data-tab="butterfly"].active {
    background: #8b5cf6; /* 蝴蝶效应 */
  }

  #archive-status-root .tab-icon {
    font-size: 1.2rem;
  }

  /* 右侧内容区外壳：允许横向滚动，保证表格与操作列可见 */
  #archive-status-root .content-area {
    flex: 1;
    min-width: 0;
    background: #f5f1e8;
    background-image:
      repeating-linear-gradient(0deg, rgba(139,123,95,0.02) 0px, transparent 1px, transparent 2px, rgba(139,123,95,0.02) 3px),
      repeating-linear-gradient(90deg, rgba(139,123,95,0.02) 0px, transparent 1px, transparent 2px, rgba(139,123,95,0.02) 3px),
      radial-gradient(ellipse at top left, rgba(255,253,245,0.4) 0%, transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(245,235,220,0.3) 0%, transparent 50%);
    border-radius: 0 1.5rem 0 0;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.1);
    padding: 1.2rem 1.8rem 1.4rem 1.4rem;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  #archive-status-root .archive-content {
    flex: 1;
    margin-top: 0.4rem;
    padding: 0.75rem 0.25rem 0.25rem 0.25rem;
    overflow-y: auto;
    overflow-x: hidden;
  }

  #archive-status-root .archive-content::-webkit-scrollbar {
    width: 6px;
  }
  #archive-status-root .archive-content::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.15);
    border-radius: 999px;
  }

  /* ===== 个人档案样式：新标题栏（机密章 + 归档日期 + 个人档案标题） ===== */
  #archive-status-root .personal-doc-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    position: relative;
    padding-right: 3.5rem;
  }

  #archive-status-root .personal-doc-title-wrap {
    flex: 1;
  }

  #archive-status-root .personal-doc-title {
    font-size: 1.5rem;
    font-weight: bold;
    letter-spacing: 0.2em;
    color: #1c1917;
    margin: 0 0 0.25rem 0;
  }

  #archive-status-root .personal-doc-date {
    font-size: 0.75rem;
    font-family: monospace;
    color: #57534e;
  }

  #archive-status-root .personal-doc-title-bar .confidential-stamp {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%) rotate(12deg);
    width: 4rem;
    height: 4rem;
    border: 3px solid #dc2626;
    border-radius: 50%;
    background: rgba(254, 242, 242, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    flex-shrink: 0;
  }

  #archive-status-root .stamp-text {
    text-align: center;
    color: #dc2626;
    font-size: 0.625rem;
    font-weight: bold;
    line-height: 1.2;
  }

  /* 档案 Tab 通用标题（职业履历 / 社交网络 / 蝴蝶效应等统一格式） */
  #archive-status-root .archive-tab-header {
    text-align: center;
    border-bottom: 2px solid #292524;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
    position: relative;
  }

  #archive-status-root .archive-tab-title {
    font-size: 2.3rem;
    font-weight: bold;
    letter-spacing: 0.2em;
    color: #1c1917;
    margin-bottom: 0.5rem;
  }

  #archive-status-root .archive-tab-decoration {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    font-size: 2.5rem;
    opacity: 0.6;
  }

  #archive-status-root .doc-body {
    background: white;
    border: 2px solid #292524;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    position: relative;
  }

  #archive-status-root .doc-accent {
    position: absolute;
    left: -0.25rem;
    top: 25%;
    width: 0.5rem;
    height: 8rem;
    background: linear-gradient(to right, #dc2626, #991b1b);
    opacity: 0.3;
  }

  #archive-status-root .info-table {
    width: 100%;
    font-family: 'Songti SC', 'SimSun', serif;
  }

  #archive-status-root .info-table tr {
    border-bottom: 2px solid #d6d3d1;
  }

  #archive-status-root .info-table td {
    padding: 0.75rem 1rem;
  }

  #archive-status-root .info-label {
    font-weight: bold;
    color: #57534e;
    width: 8rem;
    white-space: nowrap;
  }

  #archive-status-root .info-value {
    color: #1c1917;
    word-break: keep-all;
  }

  #archive-status-root .signature-section {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #d6d3d1;
    display: flex;
    justify-content: flex-end;
    gap: 4rem;
    font-size: 0.75rem;
    color: #57534e;
  }

  /* ===== 职业履历样式（参考 archive-system.html career 部分） ===== */
  #archive-status-root .career-doc {
    background: white;
    border: 2px solid #92400e;
    padding: 2rem;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  }

  #archive-status-root .career-doc .archive-tab-header {
    border-bottom-color: #92400e;
  }
  #archive-status-root .doc-subtitle {
    font-size: 0.7rem;   /* 或你想要的 rem/px */
    letter-spacing: 0.1em;
    color: #57534e;
  }
  #archive-status-root .career-doc .archive-tab-title {
    color: #78350f;
  }

  #archive-status-root .assessment-box {
    background: linear-gradient(to right, #fef3c7, #fef9c3);
    border: 2px solid #fbbf24;
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  #archive-status-root .section-title {
    font-size: 1.125rem;
    font-weight: bold;
    color: #78350f;
    margin-bottom: 1rem;
  }

  #archive-status-root .assessment-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #fde68a;
  }

  #archive-status-root .assessment-item:last-child {
    border-bottom: none;
  }

  #archive-status-root .assessment-label {
    font-weight: bold;
    color: #57534e;
  }

  #archive-status-root .assessment-value {
    color: #1c1917;
  }

  #archive-status-root .works-section {
    margin-bottom: 2rem;
  }

  #archive-status-root .work-item {
    border-left: 4px solid #f59e0b;
    padding-left: 1rem;
    padding-top: 0.75rem;
    padding-bottom: 0.75rem;
    background: #fef3c7;
    margin-bottom: 0.75rem;
  }

  #archive-status-root .work-title {
    font-weight: 600;
    color: #1c1917;
  }

  #archive-status-root .awards-section {
    padding-top: 1.5rem;
    border-top: 2px solid #fbbf24;
  }

  #archive-status-root .empty-state {
    text-align: center;
    color: #78716c;
    font-size: 0.875rem;
    padding: 1rem;
  }

  /* ===== 个人账户样式（参考 archive-system.html personal 部分） ===== */
  #archive-status-root .account-doc {
    background: white;
    border: 1px solid #d4d4d4;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    font-family: monospace;
  }

  #archive-status-root .account-header {
    background: linear-gradient(to right, #065f46, #047857);
    color: white;
    padding: 1.5rem;
  }

  #archive-status-root .account-header-title {
    font-size: 0.625rem;
    opacity: 0.8;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .account-header-main {
    font-size: 1.5rem;
    font-weight: bold;
    letter-spacing: 0.05em;
  }

  #archive-status-root .account-number {
    font-size: 0.625rem;
    margin-top: 0.5rem;
  }

  #archive-status-root .balance-section {
    background: #d1fae5;
    border-bottom: 2px solid #6ee7b7;
    padding: 1.5rem;
  }

  #archive-status-root .balance-label {
    font-size: 0.625rem;
    color: #57534e;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .balance-amount {
    font-size: 1.5rem;
    font-weight: bold;
    color: #047857;
  }

  #archive-status-root .currency-info {
    font-size: 0.625rem;
    color: #57534e;
    margin-top: 0.5rem;
  }

  #archive-status-root .transaction-section {
    padding: 1rem 0.4rem;
  }

  #archive-status-root .transaction-table {
    width: 100%;
    font-size: 0.875rem;
    border-collapse: collapse;
  }

  #archive-status-root .transaction-table thead tr {
    border-bottom: 2px solid #292524;
  }

  #archive-status-root .transaction-table th {
    text-align: left;
    padding: 0.75rem;
    font-weight: bold;
    color: #57534e;
  }

  #archive-status-root .transaction-table th:not(:first-child) {
    text-align: right;
  }

  #archive-status-root .transaction-table td {
    padding: 0.75rem;
    border-bottom: 1px solid #e7e5e4;
  }

  #archive-status-root .transaction-table td:not(:first-child) {
    text-align: right;
  }

  /* ===== 公司账户：收入表与应收账款（参考 archive-system.html） ===== */
  #archive-status-root .company-header {
    background: linear-gradient(to right, #047857, #059669);
  }

  #archive-status-root .overview-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 1.5rem;
    background: #fafaf9;
    border-bottom: 1px solid #d6d3d1;
  }

  #archive-status-root .overview-card {
    background: white;
    border: 1px solid #d4d4d4;
    border-radius: 0.25rem;
    padding: 1rem;
  }

  #archive-status-root .overview-card-label {
    font-size: 0.625rem;
    color: #78716c;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .overview-card-value {
    font-size: 1.5rem;
    font-weight: bold;
  }

  #archive-status-root .value-green { color: #047857; }
  #archive-status-root .value-orange { color: #ea580c; }

  #archive-status-root .overview-card-caption {
    font-size: 0.625rem;
    color: #a8a29e;
    margin-top: 0.25rem;
  }

  #archive-status-root .section-header {
    font-weight: bold;
    color: #292524;
    border-bottom: 2px solid #292524;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  #archive-status-root .revenue-table {
    width: 100%;
    font-size: 0.875rem;
    border: 2px solid #292524;
    border-collapse: collapse;
  }

  #archive-status-root .transaction-section .revenue-table-wrap {
    overflow-x: auto;
    margin-bottom: 0.5rem;
  }

  #archive-status-root .revenue-table thead {
    background: #292524;
    color: white;
  }

  #archive-status-root .revenue-table th {
    padding: 0.75rem 1rem;
    border-right: 1px solid #57534e;
    font-weight: bold;
  }

  #archive-status-root .revenue-table th:last-child {
    border-right: none;
  }

  #archive-status-root .revenue-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e7e5e4;
    border-right: 1px solid #e7e5e4;
  }

  #archive-status-root .revenue-table td:last-child {
    border-right: none;
  }

  #archive-status-root .revenue-table tbody tr {
    background: white;
  }

  #archive-status-root .revenue-table tbody tr:hover {
    background: #d1fae5;
  }

  #archive-status-root .receivables-section {
    background: #dbeafe;
    border-top: 2px solid #93c5fd;
    padding: 1rem 0.4rem;
  }

  #archive-status-root .receivables-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  #archive-status-root .receivable-card {
    background: white;
    border: 1px solid #93c5fd;
    border-radius: 0.25rem;
    padding: 0.75rem;
  }

  #archive-status-root .receivable-month {
    font-size: 0.625rem;
    color: #78716c;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .receivable-amount {
    font-size: 1.125rem;
    font-weight: bold;
    color: #1e40af;
  }

  #archive-status-root .expenses-section {
    padding: 1rem 0.4rem;
    border-top: 2px solid #d6d3d1;
  }

  #archive-status-root .amount-positive {
    color: #047857;
    font-weight: 600;
  }

  #archive-status-root .amount-negative {
    color: #dc2626;
    font-weight: 600;
  }

  #archive-status-root .transaction-type {
    font-size: 0.625rem;
    color: #78716c;
  }

  #archive-status-root .contract-section {
    background: #dbeafe;
    border-top: 2px solid #93c5fd;
    padding: 1rem 0.4rem;
  }

  #archive-status-root .contract-title {
    font-size: 0.875rem;
    font-weight: bold;
    color: #57534e;
    margin-bottom: 0.5rem;
  }

  #archive-status-root .contract-text {
    font-size: 0.875rem;
    color: #292524;
  }

  #archive-status-root .assets-section {
    background: #fafaf9;
    border-top: 2px solid #d6d3d1;
    padding: 1rem 0.4rem;
  }

  #archive-status-root .asset-category {
    margin-bottom: 1rem;
  }

  #archive-status-root .asset-category:last-child {
    margin-bottom: 0;
  }

  #archive-status-root .asset-category-title {
    font-size: 0.625rem;
    color: #78716c;
    margin-bottom: 0.5rem;
  }

  #archive-status-root .asset-list {
    list-style: none;
  }

  #archive-status-root .asset-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #292524;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .asset-bullet {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  #archive-status-root .bullet-realestate { background: #10b981; }
  #archive-status-root .bullet-vehicle { background: #3b82f6; }
  #archive-status-root .bullet-stock { background: #8b5cf6; }

  #archive-status-root .disclaimer {
    background: #f5f5f4;
    padding: 1rem;
    border-top: 1px solid #d6d3d1;
    font-size: 0.625rem;
    color: #78716c;
  }

  /* ===== 世界动态样式（报纸版式：仅三条新闻，无当前状态） ===== */
  #archive-status-root .world-doc {
    background: #fff;
    border: 2px solid #292524;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    padding: 1.25rem 1.5rem;
    font-family: Georgia, "Times New Roman", serif;
    color: #1a1a1a;
    line-height: 1.5;
  }

  /* 报头 */
  #archive-status-root .world-masthead {
    padding: 0 0 0.75rem;
  }

  #archive-status-root .world-masthead-top {
    display: table;
    width: 100%;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    color: #000;
  }

  #archive-status-root .world-masthead-edition {
    display: table-cell;
    text-align: left;
  }

  #archive-status-root .world-masthead-date {
    display: table-cell;
    text-align: right;
  }

  #archive-status-root .world-masthead-rule {
    width: 100%;
    height: 1px;
    background: #000;
    margin: 0.5rem 0;
    border: 0;
  }

  #archive-status-root .world-masthead-title-line {
    width: 100%;
    height: 1px;
    background: #000;
    margin: 0.35rem 0;
  }

  #archive-status-root .world-doc .world-title {
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-align: center;
    margin: 0;
    color: #000;
  }

  /* 三条新闻（报纸文章块） */
  #archive-status-root .world-doc .news-section {
    margin-bottom: 1.25rem;
  }

  #archive-status-root .world-doc .news-section:last-of-type {
    margin-bottom: 0;
  }

  #archive-status-root .world-doc .news-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1c1917;
    margin: 0 0 0.35rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid #d6d3d1;
  }

  #archive-status-root .world-doc .news-content {
    padding: 0;
    background: transparent;
    border-left: none;
  }

  #archive-status-root .world-doc .news-text {
    color: #292524;
    line-height: 1.6;
    margin: 0;
    font-size: 0.95rem;
  }

  #archive-status-root .world-footer {
    margin-top: 1.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid #000;
    text-align: center;
    font-size: 0.625rem;
    color: #78716c;
  }

  /* ===== 社交网络样式（参考 archive-system.html） ===== */
  #archive-status-root .network-doc {
    background: #2a2a2a;
    border: 4px solid #1a1a1a;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    padding: 0.25rem;
    border-radius: 0.5rem;
  }

  #archive-status-root .network-inner {
    background: #fef9f3;
    background-image: repeating-linear-gradient(
      transparent,
      transparent 29px,
      rgba(139,123,95,0.15) 29px,
      rgba(139,123,95,0.15) 30px
    );
    border: 2px solid #a8a29e;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.1);
    padding: 2rem;
  }

  #archive-status-root .recent-interactions {
    background: #fef9c3;
    border: 2px solid #fde047;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 2rem;
  }

  #archive-status-root .recent-title {
    font-size: 1.125rem;
    font-weight: bold;
    color: #1c1917;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  #archive-status-root .interaction-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  #archive-status-root .interaction-tag {
    background: #fde047;
    color: #292524;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  #archive-status-root .relationships-section {
    margin-bottom: 2rem;
    padding: 1rem 0.25rem;
  }

  #archive-status-root .relationship-card {
    background: white;
    border: 2px solid #a8a29e;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    padding: 1.25rem;
    margin-bottom: 1rem;
    position: relative;
  }

  #archive-status-root .relationship-indicator {
    position: absolute;
    left: -0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  #archive-status-root .indicator-low { background: #8b5cf6; }
  #archive-status-root .indicator-mid { background: #3b82f6; }
  #archive-status-root .indicator-high { background: #dc2626; }

  #archive-status-root .relationship-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  #archive-status-root .relationship-name-box {
    flex: 1;
  }

  #archive-status-root .relationship-name {
    font-size: 1.25rem;
    font-weight: bold;
    color: #1c1917;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  #archive-status-root .recent-badge {
    background: #fde047;
    color: #713f12;
    font-size: 0.625rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }

  #archive-status-root .relationship-role {
    font-size: 0.875rem;
    color: #78716c;
  }

  #archive-status-root .relationship-score-box {
    text-align: right;
  }

  #archive-status-root .score-label {
    font-size: 0.625rem;
    color: #a8a29e;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .score-value {
    font-size: 1.5rem;
    font-weight: bold;
  }

  #archive-status-root .score-low { color: #8b5cf6; }
  #archive-status-root .score-mid { color: #3b82f6; }
  #archive-status-root .score-high { color: #16a34a; }

  #archive-status-root .social-map-section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 2px solid #292524;
  }

  #archive-status-root .map-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  #archive-status-root .map-tag {
    background: #e7e5e4;
    color: #292524;
    padding: 0.375rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    border: 1px solid #a8a29e;
  }

  /* ===== 蝴蝶效应样式（与职业履历等统一标题格式，无特殊格式） ===== */
  #archive-status-root .butterfly-doc {
    background: white;
    border: 2px solid #292524;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    padding: 2rem;
  }

  #archive-status-root .butterfly-inner {
    padding: 0;
    font-size: 0.875rem;
  }

  #archive-status-root .butterfly-inner .system-note {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #d6d3d1;
  }

  #archive-status-root .butterfly-inner .note-title {
    font-size: 0.75rem;
    color: #57534e;
    margin-bottom: 0.5rem;
    letter-spacing: 0.05em;
  }

  #archive-status-root .butterfly-inner .note-text {
    color: #292524;
    line-height: 1.6;
  }

  #archive-status-root .erased-section {
    margin-bottom: 1.5rem;
  }

  #archive-status-root .erased-card {
    background: #f5f5f4;
    border: 1px solid #d6d3d1;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
  }

  #archive-status-root .erased-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  #archive-status-root .erased-info {
    flex: 1;
  }

  #archive-status-root .erased-title {
    font-weight: bold;
    color: #1c1917;
    margin-bottom: 0.25rem;
  }

  #archive-status-root .erased-author {
    font-size: 0.625rem;
    color: #78716c;
  }

  #archive-status-root .erased-badge {
    background: #78716c;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: bold;
  }

  #archive-status-root .stable-state {
    background: #dcfce7;
    border: 2px solid #4ade80;
    border-radius: 0.5rem;
    padding: 1.5rem;
    text-align: center;
  }

  #archive-status-root .stable-icon {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }

  #archive-status-root .stable-title {
    font-weight: bold;
    color: #166534;
    margin-bottom: 0.5rem;
  }

  #archive-status-root .stable-text {
    font-size: 0.625rem;
    color: #78716c;
    margin-top: 0.5rem;
  }

  #archive-status-root .butterfly-footer {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid #d6d3d1;
    font-size: 0.75rem;
    color: #78716c;
  }

  /* 复用原脚本的 card / info-row 等结构，但改成纸质档案风 */
  #archive-status-root .card {
    background: #fff;
    border-radius: 0.6rem;
    padding: 0.6rem 0.75rem;
    margin-bottom: 0.6rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    border: 1px solid #e7e5e4;
  }

  #archive-status-root .card-title {
    font-size: 0.72rem;
    color: #57534e;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  #archive-status-root .card-title::before {
    content: '';
    display: block;
    width: 3px;
    height: 0.7rem;
    background: #991b1b;
    opacity: 0.6;
  }

  #archive-status-root .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.15rem 0;
    font-size: 0.78rem;
    border-bottom: 1px solid #f4f4f5;
  }

  #archive-status-root .info-row:last-child {
    border-bottom: none;
  }

  #archive-status-root .info-key {
    color: #78716c;
  }

  #archive-status-root .info-val {
    color: #1c1917;
    font-weight: 500;
    text-align: right;
  }

  #archive-status-root .info-block {
    font-size: 0.78rem;
    color: #292524;
    line-height: 1.5;
    margin-top: 0.25rem;
    padding: 0.35rem 0.45rem;
    background: #fefce8;
    border-radius: 0.4rem;
    border: 1px solid #facc15;
  }

  #archive-status-root .list-item {
    padding: 0.2rem 0;
    border-bottom: 1px solid #f4f4f5;
    font-size: 0.78rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  #archive-status-root .list-item:last-child {
    border-bottom: none;
  }

  #archive-status-root .hl-val {
    color: #1c1917;
    font-weight: 600;
  }

  #archive-status-root .dim-val {
    color: #a1a1aa;
    font-size: 0.72rem;
  }

  #archive-status-root .btn-small {
    cursor: pointer;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    background: #e5e7eb;
    border-radius: 999px;
    transition: background 0.15s ease;
  }

  #archive-status-root .btn-small:hover {
    background: #d4d4d8;
  }

  /* 月度收入来源表格：操作列编辑/删除按钮拉开间距，减少误触 */
  #archive-status-root .revenue-table-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  #archive-status-root .btn-add {
    cursor: pointer;
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
    background: #bbf7d0;
    border-radius: 999px;
    text-align: center;
    margin-top: 0.4rem;
    color: #166534;
  }

  #archive-status-root .btn-add:hover {
    background: #86efac;
  }

  #archive-status-root .receivables-detail-toggle {
    cursor: pointer;
    font-size: 0.72rem;
    color: #78716c;
    margin-top: 0.3rem;
  }

  #archive-status-root .receivables-detail-list {
    margin-top: 0.35rem;
  }

  /* 模态框：直接复用原状态栏脚本的语义样式，但作用域限制在父页面 body 上 */
  #project-modal {
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.7);
    z-index: 10000;
  }

  #project-modal.show {
    display: flex;
  }

  #project-modal .modal-content {
    background: #1f2933;
    border-radius: 0.8rem;
    padding: 1.1rem 1.1rem 1rem 1.1rem;
    max-width: 420px;
    width: 92vw;
    border: 1px solid rgba(255,255,255,0.1);
    color: #e5e7eb;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  #project-modal .modal-title {
    font-size: 0.95rem;
    font-weight: 700;
    margin-bottom: 0.7rem;
  }

  #project-modal .form-group {
    margin-bottom: 0.55rem;
  }

  #project-modal .form-label {
    font-size: 0.7rem;
    color: #9ca3af;
    margin-bottom: 0.15rem;
    display: block;
  }

  #project-modal .form-input {
    width: 100%;
    padding: 0.4rem 0.5rem;
    border-radius: 0.45rem;
    border: 1px solid rgba(156,163,175,0.8);
    background: #111827;
    color: #e5e7eb;
    font-size: 0.78rem;
  }

  #project-modal .form-input:focus {
    outline: none;
    border-color: #22c55e;
    box-shadow: 0 0 0 1px rgba(34,197,94,0.5);
  }

  #project-modal .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.45rem;
    margin-top: 0.7rem;
  }

  #project-modal .btn-modal {
    border-radius: 999px;
    padding: 0.35rem 0.9rem;
    font-size: 0.78rem;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  #project-modal .btn-modal-primary {
    background: #22c55e;
    color: #052e16;
  }

  #project-modal .btn-modal-primary:hover {
    background: #16a34a;
  }

  #project-modal .btn-modal-secondary {
    background: #374151;
    color: #e5e7eb;
  }

  #project-modal .btn-modal-secondary:hover {
    background: #4b5563;
  }

  /* 手机端：遮罩全屏；内容区顶部对齐、可滚动，避免居中时上半部分被裁到屏外 */
  @media (max-width: 768px) {
    #project-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100dvh;
      display: none;
      background: rgba(0,0,0,0.7);
      z-index: 2147483647;
    }
    #project-modal.show {
      display: block;
    }
    #project-modal .modal-content {
      position: fixed;
      left: 50%;
      top: 0.75rem;
      transform: translateX(-50%);
      margin: 0;
      max-height: calc(100dvh - 1.5rem);
      overflow-y: auto;
      width: 92vw;
      max-width: 420px;
      z-index: 2147483647;
      -webkit-overflow-scrolling: touch;
    }
  }

  /* 响应式：窄屏时整体仍在左上角，与小手机一致；文本不换行/缩小以免手机显示过大 */
  @media (max-width: 768px) {
    #archive-status-root {
      top: 120px;
      left: 12px;
    }
    #archive-status-root.collapsed #archive-status-toggle {
      left: 12px;
      top: 120px;
    }
    #archive-status-root .archive-container {
      width: 90vw;
      height: min(700px, 95vh);
    }
    #archive-status-root .content-area {
      padding: 0.8rem 0.5rem 0.9rem 0.5rem;
    }

    /* 左侧 Tab：图标缩小、不换行（若以后加文字也适用） */
    #archive-status-root .tab-sidebar {
      width: 3rem;
      padding-top: 3rem;
    }
    #archive-status-root .tab-label {
      width: 2.6rem;
      height: 2.6rem;
      white-space: nowrap;
      overflow: hidden;
    }
    #archive-status-root .tab-icon {
      font-size: 1rem;
    }

    /* 内容区大标题：缩小字号、不换行 */
    #archive-status-root .personal-doc-title {
      font-size: 1.3rem;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }
    #archive-status-root .archive-tab-title {
      font-size: 1.15rem;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }
    #archive-status-root .archive-tab-decoration {
      font-size: 1.5rem;
    }
    #archive-status-root .doc-body {
      padding: 1rem;
    }
    #archive-status-root .section-title {
      font-size: 0.95rem;
    }
    #archive-status-root .stamp-text {
      font-size: 0.5rem;
    }

    /* 手机端：商业概览与应收账款改为单列，表格字号与间距缩小以提升可读性 */
    #archive-status-root .overview-grid,
    #archive-status-root .receivables-grid {
      grid-template-columns: 1fr;
    }

    #archive-status-root .transaction-table,
    #archive-status-root .revenue-table {
      font-size: 0.7rem;
    }

    #archive-status-root .transaction-table th,
    #archive-status-root .transaction-table td,
    #archive-status-root .revenue-table th,
    #archive-status-root .revenue-table td {
      padding: 0.45rem 0.4rem;
    }
  }
</style>
`;

// ===== DOM 模板：档案夹外壳 + 7 个标签 =====

const ARCHIVE_STATUS_TEMPLATE = `
<div id="archive-status-root">
  <div class="archive-container">
    <div class="folder-background">
      <div class="tab-sidebar">
        <div class="tab-label" data-tab="protagonist" title="个人档案">
          <span class="tab-icon">👤</span>
        </div>
        <div class="tab-label" data-tab="career" title="职业履历">
          <span class="tab-icon">🏆</span>
        </div>
        <div class="tab-label" data-tab="personal" title="个人账户">
          <span class="tab-icon">💰</span>
        </div>
        <div class="tab-label" data-tab="company" title="公司账户">
          <span class="tab-icon">🏢</span>
        </div>
        <div class="tab-label" data-tab="network" title="社交网络">
          <span class="tab-icon">👥</span>
        </div>
        <div class="tab-label" data-tab="world" title="世界动态">
          <span class="tab-icon">🌍</span>
        </div>
        <div class="tab-label" data-tab="butterfly" title="蝴蝶效应">
          <span class="tab-icon">🦋</span>
        </div>
      </div>
      <div class="content-area">
        <div id="archive-status-content" class="archive-content"></div>
      </div>
    </div>
  </div>
  <div id="archive-status-toggle" title="打开/收起档案状态栏">📁</div>
</div>
`;

// ===== 业务逻辑：状态、渲染、商业账户模态框与现金重算 =====

type SchemaData = ReturnType<typeof getMvuDataSafe>;

type ArchiveTabKey = 'protagonist' | 'career' | 'personal' | 'company' | 'network' | 'world' | 'butterfly';

type ArchiveState = {
  currentTab: ArchiveTabKey;
  isCollapsed: boolean;
};

const savedCollapse = localStorage.getItem(STORAGE_COLLAPSE_KEY);

const archiveState: ArchiveState = {
  currentTab: (localStorage.getItem(STORAGE_TAB_KEY) as ArchiveTabKey) || 'protagonist',
  // 首次没有记录时，默认折叠；之后尊重用户上一次的选择
  isCollapsed: savedCollapse !== null ? savedCollapse === 'true' : true,
};

// ===== 可复用模板：输出与现有 UI 一致的 HTML，便于维护 =====

/** 信息表单行：多组 label+value，可选 valueColSpan（如 3 表示该 value 占 3 列） */
function infoTableRow(cells: Array<{ label: string; value: string; valueColSpan?: number }>): string {
  return `<tr>${cells
    .map(
      c =>
        `<td class="info-label">${c.label}</td><td class="info-value"${c.valueColSpan != null ? ` colspan="${c.valueColSpan}"` : ''}>${c.value}</td>`,
    )
    .join('')}</tr>`;
}

function infoTable(rows: string[]): string {
  return `<table class="info-table">${rows.join('')}</table>`;
}

/** 个人档案新标题：机密章 + 归档日期 + 个人档案标题 */
function personalDocTitleBar(recordDate: string): string {
  return `
      <div class="personal-doc-title-bar">
        <div class="personal-doc-title-wrap">
          <h1 class="personal-doc-title">个 人 档 案</h1>
          <div class="personal-doc-date">归档日期: ${recordDate}</div>
        </div>
        <div class="confidential-stamp"><div class="stamp-text">机密<br>CONFIDENTIAL</div></div>
      </div>`;
}

/** 档案 Tab 通用标题（与职业履历一致的格式：居中标题 + 副标题 + 可选角标） */
function archiveTabHeader(title: string, subtitle: string, decoration?: string): string {
  return `
      <div class="archive-tab-header">
        <h2 class="archive-tab-title">${title}</h2>
        <div class="doc-subtitle">${subtitle}</div>
        ${decoration != null ? `<div class="archive-tab-decoration">${decoration}</div>` : ''}
      </div>`;
}

/** 职业履历：行业评估区块 */
function assessmentBox(title: string, items: Array<{ label: string; value: string }>): string {
  return `
      <div class="assessment-box">
        <h3 class="section-title">${title}</h3>
        ${items.map(i => `<div class="assessment-item"><span class="assessment-label">${i.label}</span><span class="assessment-value">${i.value}</span></div>`).join('')}
      </div>`;
}

/** 带标题的区块 + 列表内容（代表作品、荣誉记录等），sectionClass 默认 works-section */
function sectionWithList(
  title: string,
  items: string[],
  emptyText: string,
  itemToHtml: (item: string) => string,
  sectionClass = 'works-section',
): string {
  const content =
    Array.isArray(items) && items.length > 0
      ? items.map(itemToHtml).join('')
      : `<div class="empty-state">${emptyText}</div>`;
  return `
      <div class="${sectionClass}">
        <h3 class="section-title">${title}</h3>
        ${content}
      </div>`;
}

function workItem(text: string): string {
  return `
          <div class="work-item">
            <div class="work-title">${text}</div>
          </div>`;
}

/** 交易/对账表：表头 3 列，每行 label、金额串、类型，可选行样式与金额样式 */
function transactionTable(
  headers: readonly [string, string, string],
  rows: Array<{
    label: string;
    amount: string;
    type: string;
    positive: boolean;
    rowStyle?: string;
    amountStyle?: string;
  }>,
): string {
  const [h1, h2, h3] = headers;
  const tbody = rows
    .map(
      r =>
        `<tr${r.rowStyle != null ? ` style="${r.rowStyle}"` : ''}>
              <td>${r.label}</td>
              <td class="${r.positive ? 'amount-positive' : 'amount-negative'}"${r.amountStyle != null ? ` style="${r.amountStyle}"` : ''}>
                ${r.amount}
              </td>
              <td class="transaction-type">${r.type}</td>
            </tr>`,
    )
    .join('');
  return `
        <table class="transaction-table">
          <thead>
            <tr>
              <th>${h1}</th>
              <th>${h2}</th>
              <th>${h3}</th>
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
        </table>`;
}

/** 成本表：表头 3 列（如 成本项目、月度支出、占比），行无 amount 正负 */
function transactionTableCosts(
  headers: readonly [string, string, string],
  rows: Array<{ label: string; amount: string; type: string }>,
  footer?: { label: string; amount: string; type: string },
): string {
  const [h1, h2, h3] = headers;
  const tbody =
    rows
      .map(
        r =>
          `<tr>
          <td>${r.label}</td>
          <td class="amount-negative">${r.amount}</td>
          <td class="transaction-type">${r.type}</td>
        </tr>`,
      )
      .join('') +
    (footer != null
      ? `
        <tr style="background: #fafaf9; font-weight: bold;">
          <td>${footer.label}</td>
          <td class="amount-negative">${footer.amount}</td>
          <td class="transaction-type">${footer.type}</td>
        </tr>`
      : '');
  return `
    <table class="transaction-table">
      <thead>
        <tr>
          <th>${h1}</th>
          <th>${h2}</th>
          <th>${h3}</th>
        </tr>
      </thead>
      <tbody>
        ${tbody}
      </tbody>
    </table>`;
}

/** 收入来源表：固定 6 列表头，每行 名称、规模、单价、成本率、月毛利、操作按钮 */
function revenueTable(
  rows: Array<{
    name: string;
    scale: string;
    unitPrice: string;
    costRate: string;
    gross: string;
    projectId: string;
  }>,
): string {
  const safe = (s: string) => s.replace(/"/g, '&quot;');
  const tbody =
    rows.length > 0
      ? rows
          .map(
            r =>
              `
              <tr>
                <td>${r.name}</td>
                <td>${r.scale}</td>
                <td>${r.unitPrice}</td>
                <td>${r.costRate}</td>
                <td class="amount-positive">+${r.gross}</td>
                <td class="revenue-table-actions">
                  <span class="btn-small btn-edit-project" data-project-id="${safe(r.projectId)}" title="编辑">✏️</span>
                  <span class="btn-small btn-delete-project" data-project-id="${safe(r.projectId)}" title="删除">🗑️</span>
                </td>
              </tr>
            `,
          )
          .join('')
      : `
      <tr>
        <td colspan="6" style="text-align:center; padding:0.75rem 1rem; font-size:0.875rem; color:#78716c;">
          暂无月度收入来源
        </td>
      </tr>
    `;
  return `
          <table class="revenue-table">
            <thead>
              <tr>
                <th>业务名称</th>
                <th>规模</th>
                <th>单价 (¥)</th>
                <th>成本率</th>
                <th>月毛利 (¥)</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${tbody}
            </tbody>
          </table>`;
}

function renderProtagonistTab(sd: SchemaData): string {
  const name = getVal(sd, 'protagonist.name', '待初始化');
  const age = getVal(sd, 'protagonist._age', 0);
  const ageStr = age > 0 ? `${age}岁` : '待初始化';
  const birthday = getVal(sd, 'protagonist.$birthday', '待初始化');
  const occupation = getVal(sd, 'protagonist.occupation', '待初始化');
  const appearance = getVal(sd, 'protagonist.appearance', '待初始化');
  const location = getVal(sd, 'world.currentLocation', '待初始化');
  const kink = getVal(sd, 'protagonist.kink', '无');

  const recordDate = getVal(sd, 'world.currentDate', 'XXXX-XX-XX');

  const tableRows = [
    infoTableRow([
      { label: '姓名', value: name },
      { label: '年龄', value: ageStr },
    ]),
    infoTableRow([{ label: '出生', value: birthday, valueColSpan: 3 }]),
    infoTableRow([{ label: '职业', value: occupation, valueColSpan: 3 }]),
    infoTableRow([{ label: '外貌', value: appearance, valueColSpan: 3 }]),
    infoTableRow([{ label: '位置', value: location, valueColSpan: 3 }]),
    infoTableRow([{ label: '标注', value: kink, valueColSpan: 3 }]),
  ];

  return `
    <div>
      ${personalDocTitleBar(String(recordDate))}
      <div class="doc-body">
        <div class="doc-accent"></div>
        ${infoTable(tableRows)}
        <div class="signature-section">
          <div>归档人：_____________</div>
          <div>日期：_____________</div>
        </div>
        <div style="margin-top: 0.5rem; font-size: 0.7rem; color: #a8a29e; text-align: right;">
          版本：1.0
        </div>
      </div>
    </div>
  `;
}

function renderCareerTab(sd: SchemaData): string {
  const works = getVal(sd, 'career.works', [] as string[]);
  const awards = getVal(sd, 'career.industryAwards', [] as string[]);
  const tier = getVal(sd, 'professionalAssessment.currentTier', '待初始化');
  const media = getVal(sd, 'professionalAssessment.mediaSentiment', '待初始化');
  const rep = getVal(sd, 'professionalAssessment.publicReputation', '待初始化');
  const fans = getVal(sd, 'professionalAssessment.fanbase', '待初始化');

  const worksSection = sectionWithList(
    '🎬 代表作品',
    Array.isArray(works) ? works : [],
    '暂无代表作品',
    w => workItem(w),
    'works-section',
  );
  const awardsSection = sectionWithList(
    '🏆 荣誉记录',
    Array.isArray(awards) ? awards : [],
    '暂无荣誉记录',
    a => workItem(a),
    'awards-section',
  );

  return `
    <div class="career-doc">
      ${archiveTabHeader('职 业 履 历 档 案', 'CAREER PORTFOLIO', '⭐')}

      ${assessmentBox('行业评估', [
        { label: '当前咖位', value: String(tier) },
        { label: '媒体情绪', value: String(media) },
        { label: '公众声誉', value: String(rep) },
        { label: '粉丝基础', value: String(fans) },
      ])}

      ${worksSection}
      ${awardsSection}
    </div>
  `;
}

function renderPersonalTab(sd: SchemaData): string {
  const cash = getVal(sd, 'personalAccount._cash', 0);
  const income = getVal(sd, 'personalAccount.monthlyFixedIncome', 0);
  const expense = getVal(sd, 'personalAccount.monthlyFixedExpense', 0);
  const oneTime = getVal(sd, 'personalAccount.oneTimePersonalChange', 0);
  const contract = getVal(sd, 'personalAccount.contractStatus', '待初始化');
  const assets = getVal(sd, 'personalAccount.assets', {} as Record<string, unknown>);

  const net = income - expense + oneTime;

  const renderAssets = (assetsObj: Record<string, unknown>): string => {
    if (!assetsObj || typeof assetsObj !== 'object') return '无';
    const categories = ['realEstate', 'vehicles', 'stocks'];
    const items: string[] = [];
    for (const cat of categories) {
      const arr = (assetsObj as Record<string, unknown>)[cat];
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

  const transactionRows = [
    {
      label: '月固定收入',
      amount: `+${Number(income).toLocaleString()}`,
      type: '收入',
      positive: true,
    },
    {
      label: '月固定支出',
      amount: `-${Number(expense).toLocaleString()}`,
      type: '支出',
      positive: false,
    },
    {
      label: '本轮一次性变动',
      amount: `${oneTime >= 0 ? '+' : ''}${Number(oneTime).toLocaleString()}`,
      type: '特殊',
      positive: oneTime >= 0,
    },
    {
      label: '月度净收入',
      amount: `${net >= 0 ? '+' : ''}${Number(net).toLocaleString()}`,
      type: '结余',
      positive: net >= 0,
      rowStyle: 'background: #fafaf9; font-weight: bold;',
      amountStyle: 'font-size: 1.125rem;',
    },
  ];

  const assetsListHtml =
    assetsList === '无'
      ? '<li class="asset-item"><span class="asset-bullet bullet-stock"></span><span>暂无资产记录</span></li>'
      : `<li class="asset-item">
                     <span class="asset-bullet bullet-stock"></span>
                     <span>${assetsList}</span>
                   </li>`;

  return `
    <div class="account-doc">
      <div class="account-header">
        <div class="account-header-title">PERSONAL ACCOUNT STATEMENT</div>
        <div class="account-header-main">个人账户对账单</div>
        <div class="account-number">
          <div>账户编号: 6228 **** **** 1234</div>
          <div>对账日期: ${String(getVal(sd, 'world.currentDate', 'XXXX-XX-XX'))}</div>
        </div>
      </div>

      <div class="balance-section">
        <div class="balance-label">CURRENT BALANCE</div>
        <div class="balance-amount">¥${Number(cash).toLocaleString()}</div>
        <div class="currency-info">币种: CNY 人民币</div>
      </div>

      <div class="transaction-section">
        ${transactionTable(['项目', '金额 (CNY)', '类型'] as const, transactionRows)}
      </div>

      <div class="contract-section">
        <div class="contract-title">当前合约状态</div>
        <div class="contract-text">${contract}</div>
      </div>

      <div class="assets-section">
        <div class="contract-title">持有资产清单</div>
        <div class="asset-category">
          <div class="asset-category-title">综合资产</div>
          <ul class="asset-list">
            ${assetsListHtml}
          </ul>
        </div>
      </div>

      <div class="disclaimer">
        本对账单仅供参考，如有疑问请及时联系相关部门核对。
      </div>
    </div>
  `;
}

function renderCompanyTab(sd: SchemaData): string {
  const companyCash = getVal(sd, 'companyAccount._cash', 0);
  const fixedCosts = getVal(sd, 'companyAccount.monthlyFixedExpenses', {} as Record<string, number>);
  const runningProjects = getVal(
    sd,
    'companyAccount.monthlyRevenueSources',
    {} as Record<string, Record<string, unknown>>,
  );
  const receivablesByDueMonth = getVal(sd, 'companyAccount.$receivablesByDueMonth', {} as Record<string, number>);

  const receivablesObj =
    receivablesByDueMonth && typeof receivablesByDueMonth === 'object' ? receivablesByDueMonth : {};
  const totalReceivables = Object.values(receivablesObj).reduce((s, v) => s + Number(v || 0), 0);

  const currentDateStr = String(getVal(sd, 'world.currentDate', ''));

  const fixedCostEntries: Array<{ key: string; label: string }> = [
    { key: 'payroll', label: '人力成本' },
    { key: 'facilityCost', label: '场地成本' },
    { key: 'marketingBudget', label: '营销预算' },
    { key: 'other', label: '其他支出' },
  ];

  const totalFixedCost = fixedCostEntries.reduce((sum, { key }) => {
    const value = (fixedCosts as Record<string, unknown>)?.[key];
    return sum + (typeof value === 'number' ? value : parseFloat(String(value)) || 0);
  }, 0);

  const revenueRows: Array<{
    name: string;
    scale: string;
    unitPrice: string;
    costRate: string;
    gross: string;
    projectId: string;
  }> =
    runningProjects && typeof runningProjects === 'object'
      ? Object.keys(runningProjects)
          .sort((a, b) => {
            const numA = parseInt(a.replace(/^id_/, ''), 10) || 0;
            const numB = parseInt(b.replace(/^id_/, ''), 10) || 0;
            return numA - numB;
          })
          .map(projectId => {
            const project = runningProjects[projectId];
            if (!project || typeof project !== 'object')
              return { name: '', scale: '0', unitPrice: '0', costRate: '0%', gross: '0', projectId };
            const name = (project.name as string) ?? projectId;
            const monthlyVolume = Number(project.monthlyVolume ?? 0);
            const unitPrice = Number(project.unitPrice ?? 0);
            const costRate = Number(project.variableCostRate ?? 0.3);
            const gross = Number(project._monthlyGrossProfit ?? monthlyVolume * unitPrice * (1 - costRate));
            return {
              name,
              scale: monthlyVolume.toLocaleString(),
              unitPrice: unitPrice.toLocaleString(),
              costRate: `${(costRate * 100).toFixed(0)}%`,
              gross: gross.toLocaleString(),
              projectId,
            };
          })
      : [];

  // 应收账款：取最近三个月做卡片，所有月份汇总为一行文本
  const allMonths = Object.keys(receivablesObj)
    .filter(k => /^\d{4}-\d{2}$/.test(k))
    .sort();

  const topMonths = allMonths.slice(0, 3);

  const receivableCards = topMonths
    .map(
      ym => `
        <div class="receivable-card">
          <div class="receivable-month">${ym}到期</div>
          <div class="receivable-amount">¥${Number(receivablesObj[ym]).toLocaleString()}</div>
        </div>
      `,
    )
    .join('');

  const receivableGrid = receivableCards || `<div style="font-size:0.75rem; color:#4b5563;">暂无应收账款记录</div>`;

  const receivablesListText =
    allMonths.length === 0
      ? '全部应收账款：无'
      : '全部应收账款：' + allMonths.map(ym => `${ym} ¥${Number(receivablesObj[ym]).toLocaleString()}`).join('； ');

  const fixedCostsRows = fixedCostEntries.map(({ key, label }) => {
    const value = (fixedCosts as Record<string, unknown>)?.[key];
    const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    const ratio = totalFixedCost > 0 ? `${((numValue / totalFixedCost) * 100).toFixed(1)}%` : '';
    return { label, amount: numValue.toLocaleString(), type: ratio };
  });
  const fixedCostsTable = transactionTableCosts(['成本项目', '月度支出 (¥)', '占比'] as const, fixedCostsRows, {
    label: '合计',
    amount: totalFixedCost.toLocaleString(),
    type: '100%',
  });

  return `
    <div class="account-doc">
      <div class="account-header company-header">
        <div class="account-header-title">BUSINESS & FINANCIAL REPORT</div>
        <div class="account-header-main">商业项目财务报告</div>
        <div class="account-number">
          <div>报告编号: BUS-XXXX-Q1</div>
          <div>报告日期: ${currentDateStr || 'XXXX-XX-XX'} <span class="btn-small btn-recalculate-cash" style="margin-left:8px; cursor:pointer;">🔄 重算现金</span></div>
        </div>
      </div>

      <div class="overview-grid">
        <div class="overview-card">
          <div class="overview-card-label">BUSINESS ACCOUNT</div>
          <div class="overview-card-value value-green">¥${Number(companyCash).toLocaleString()}</div>
          <div class="overview-card-caption">商业账户余额</div>
        </div>
        <div class="overview-card">
          <div class="overview-card-label">RECEIVABLES</div>
          <div class="overview-card-value value-orange">¥${Number(totalReceivables).toLocaleString()}</div>
          <div class="overview-card-caption">应收账款总额</div>
        </div>
      </div>

      <div class="transaction-section">
        <div class="section-header">【月度收入来源】</div>
        <div class="revenue-table-wrap">
          ${revenueTable(revenueRows)}
        </div>
        <div class="btn-add btn-add-project">+ 新增收入来源</div>
      </div>

      <div class="receivables-section">
        <div class="contract-title">【应收账款明细】</div>
        <div class="receivables-grid">
          ${receivableGrid}
        </div>
        <div style="margin-top:0.75rem; font-size:0.75rem; color:#4b5563;">
          ${receivablesListText}
        </div>
      </div>

      <div class="expenses-section">
        <div class="section-header">【月度固定支出】</div>
        ${fixedCostsTable}
      </div>

      <div class="audit-section">
        <div>本报告由财务部门编制，数据截至报告日期。</div>
        <div class="audit-signature">
          <div class="audit-line">财务主管签字：__________</div>
          <div class="audit-line">日期：__________</div>
        </div>
      </div>
    </div>
  `;
}

function renderNetworkTab(sd: SchemaData): string {
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
  const interactionTagsHtml =
    Array.isArray(interactions) && interactions.length > 0 && interactions[0] !== '无'
      ? interactions
          .map(i => `<span class="interaction-tag">${String(i).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`)
          .join('')
      : '<span class="interaction-tag" style="opacity:0.7;">无</span>';
  const relationshipCardsHtml = relationList
    .sort((a, b) => b.v - a.v)
    .map(r => {
      const indicatorClass = r.v < -30 ? 'indicator-high' : r.v <= 30 ? 'indicator-mid' : 'indicator-low';
      const scoreClass = r.v < -30 ? 'score-low' : r.v <= 30 ? 'score-mid' : 'score-high';
      const roleLabel = r.v > 30 ? '核心盟友' : r.v < -30 ? '潜在敌对' : '关系网成员';
      return `
        <div class="relationship-card">
          <div class="relationship-indicator ${indicatorClass}"></div>
          <div class="relationship-header">
            <div class="relationship-name-box">
              <div class="relationship-name">${String(r.name).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              <div class="relationship-role">${roleLabel}</div>
            </div>
            <div class="relationship-score-box">
              <div class="score-label">好感度</div>
              <div class="score-value ${scoreClass}">${r.v}</div>
            </div>
          </div>
        </div>`;
    })
    .join('');
  const mapTagsHtml =
    Array.isArray(circles) && circles.length > 0 && circles[0] !== '无'
      ? circles
          .map(c => `<span class="map-tag">${String(c).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`)
          .join('')
      : '<span class="map-tag" style="opacity:0.7;">无</span>';

  return `
    <div class="network-doc">
      <div class="network-inner">
        ${archiveTabHeader('通 讯 录', 'SOCIAL NETWORK DIRECTORY', '📇')}

        <div class="recent-interactions">
          <h3 class="recent-title"><span>⚡</span>最近关键互动</h3>
          <div class="interaction-tags">
            ${interactionTagsHtml}
          </div>
        </div>

        <div class="relationships-section">
          <h3 class="recent-title"><span>👥</span>人脉关系簿</h3>
          ${relationshipCardsHtml || '<div style="font-size:0.875rem; color:#78716c;">暂无关系记录</div>'}
        </div>

        <div class="social-map-section">
          <h3 class="recent-title"><span>🗺️</span>社交地图</h3>
          <div class="map-tags">
            ${mapTagsHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWorldTab(sd: SchemaData): string {
  const date = getVal(sd, 'world.currentDate', '待初始化');
  const n1 = getVal(sd, 'world.eraNews', '待初始化');
  const n2 = getVal(sd, 'world.industryNews', '待初始化');
  const n3 = getVal(sd, 'world.gossipNews', '待初始化');

  return `
    <div class="world-doc">
      <header class="world-masthead">
        <div class="world-masthead-top">
          <span class="world-masthead-edition">简报</span>
          <span class="world-masthead-date">${String(date)}</span>
        </div>
        <hr class="world-masthead-rule" aria-hidden="true">
        <h2 class="world-title">世 界 动 态 简 报</h2>
        <div class="world-masthead-title-line" aria-hidden="true"></div>
      </header>

      <div class="news-section">
        <h3 class="news-title">时代新闻</h3>
        <div class="news-content">
          <p class="news-text">${n1}</p>
        </div>
      </div>

      <div class="news-section">
        <h3 class="news-title">行业新闻</h3>
        <div class="news-content">
          <p class="news-text">${n2}</p>
        </div>
      </div>

      <div class="news-section">
        <h3 class="news-title">八卦新闻</h3>
        <div class="news-content">
          <p class="news-text">${n3}</p>
        </div>
      </div>

      <footer class="world-footer">
        本简报由情报部门整理，内容仅供参考
      </footer>
    </div>
  `;
}

function renderButterflyTab(sd: SchemaData): string {
  const erased = getVal(sd, 'butterflyEffect.erasedList', {} as Record<string, string>);
  const entries = erased && typeof erased === 'object' ? Object.entries(erased as Record<string, string>) : [];
  const currentDate = getVal(sd, 'world.currentDate', '');

  const erasedCardsHtml =
    entries.length === 0
      ? '<div style="font-size:0.875rem; color:#78716c;">暂无抹除记录</div>'
      : entries
          .map(
            ([title, author]) => `
        <div class="erased-card">
          <div class="erased-header">
            <div class="erased-info">
              <div class="erased-title">${String(title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              <div class="erased-author">原作者: ${String(author).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            <div class="erased-badge">已抹除</div>
          </div>
        </div>`,
          )
          .join('');

  return `
    <div class="butterfly-doc">
      ${archiveTabHeader('蝴 蝶 效 应 档 案', 'BUTTERFLY EFFECT ARCHIVE', '🦋')}

      <div class="butterfly-inner">
        <div class="system-note">
          <div class="note-title">【系统说明】</div>
          <p class="note-text">
            蝴蝶效应系统记录了因玩家行为导致的时间线变化。
            当某个原本存在的人物或事件被改变或抹除时，将被记录在此档案中。
          </p>
        </div>

        <div class="erased-section">
          <div class="note-title">【已抹除记录】</div>
          ${erasedCardsHtml}
        </div>

        <div class="butterfly-footer">
          更新: ${String(currentDate)}
        </div>
      </div>
    </div>
  `;
}

function renderTabContent(tab: ArchiveTabKey, sd: SchemaData): string {
  switch (tab) {
    case 'protagonist':
      return renderProtagonistTab(sd);
    case 'career':
      return renderCareerTab(sd);
    case 'personal':
      return renderPersonalTab(sd);
    case 'company':
      return renderCompanyTab(sd);
    case 'network':
      return renderNetworkTab(sd);
    case 'world':
      return renderWorldTab(sd);
    case 'butterfly':
      return renderButterflyTab(sd);
    default:
      return renderProtagonistTab(sd);
  }
}

const MODAL_HTML = `
  <div id="project-modal">
    <div class="modal-content">
      <div class="modal-title" id="modal-title">新增收入来源</div>
      <div class="form-group">
        <label class="form-label">业务显示名称</label>
        <input type="text" id="modal-project-name" class="form-input" placeholder="如：影视制作、代言商务" />
      </div>
      <div class="form-group">
        <label class="form-label">业务范围 (_scope)</label>
        <input type="text" id="modal-scope" class="form-input" placeholder="该业务线涵盖的范围与定义，如：影视制作、代言商务" />
      </div>
      <div class="form-group">
        <label class="form-label">账期月数 ($paymentTermMonths)</label>
        <input type="number" id="modal-payment-term-months" class="form-input" placeholder="0" min="0" step="1" title="0=当月到账" />
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

function renderArchive(): void {
  let sd: ReturnType<typeof getMvuDataSafe>;
  try {
    sd = getMvuDataSafe();
  } catch (e) {
    console.warn('档案状态栏获取数据失败:', e);
    $('#archive-status-content').html(
      '<div class="card"><div style="font-size:11px; color:#78716c; padding:8px;">数据加载失败，请确保已选择角色卡并存在最新楼层。</div></div>',
    );
    return;
  }

  const tab: ArchiveTabKey = archiveState.currentTab || 'protagonist';

  try {
    $('#archive-status-content').html(renderTabContent(tab, sd));
  } catch (e) {
    console.warn('档案状态栏渲染失败:', e);
    $('#archive-status-content').html(
      '<div class="card"><div style="font-size:11px; color:#78716c; padding:8px;">当前页渲染出错。</div></div>',
    );
  }

  // 更新侧边栏激活态
  $('#archive-status-root .tab-label').removeClass('active');
  $(`#archive-status-root .tab-label[data-tab="${tab}"]`).addClass('active');
}

function initArchiveStatus(): void {
  // 清理旧实例
  $('#archive-status-root, #archive-status-css, #project-modal').remove();
  $(document).off(`.${EVENTS_NS}`);
  $(window).off(`.${EVENTS_NS}`);

  // 注入样式与 DOM
  $('head').append(ARCHIVE_STATUS_STYLES);
  $('body').append(ARCHIVE_STATUS_TEMPLATE);
  $('body').append(MODAL_HTML);

  const container = $('#archive-status-root');
  const toggle = $('#archive-status-toggle');
  const content = $('#archive-status-content');

  // 根据状态初始化展开/收起
  if (archiveState.isCollapsed) {
    container.addClass('collapsed');
  } else {
    container.removeClass('collapsed');
  }

  toggle.on(`click.${EVENTS_NS}`, e => {
    e.stopPropagation();
    archiveState.isCollapsed = !archiveState.isCollapsed;
    container.toggleClass('collapsed', archiveState.isCollapsed);
    localStorage.setItem(STORAGE_COLLAPSE_KEY, String(archiveState.isCollapsed));
  });

  // ===== Tab 切换 =====
  container.on(`click.${EVENTS_NS}`, '.tab-label', function (e) {
    e.stopPropagation();
    const tab = String($(this).data('tab') || 'home') as ArchiveTabKey;
    archiveState.currentTab = tab;
    localStorage.setItem(STORAGE_TAB_KEY, tab);
    renderArchive();
  });

  // ===== 商业账户：新增 / 编辑 / 删除 / 重算现金 =====

  /** 是否为「新增」模式（否则为「编辑」）。存放在模态框 data 上，避免闭包问题 */
  const getIsAddMode = (): boolean => $('#project-modal').data('modal-is-add-mode') === true;
  const setIsAddMode = (isAdd: boolean) => {
    $('#project-modal').data('modal-is-add-mode', isAdd);
  };

  /** 编辑时的 projectId（仅编辑模式有效） */
  const getEditingProjectId = (): string | null => $('#project-modal').data('editing-project-id') ?? null;
  const setEditingProjectId = (id: string | null) => {
    if (id === null) {
      $('#project-modal').removeData('editing-project-id');
    } else {
      $('#project-modal').data('editing-project-id', id);
    }
  };

  const openProjectModal = (projectId?: string) => {
    const modal = $('#project-modal');
    const isEdit = !!projectId;
    setIsAddMode(!isEdit);
    setEditingProjectId(isEdit ? (projectId ?? null) : null);
    $('#modal-title').text(isEdit ? '编辑收入来源' : '新增收入来源');
    $('#modal-project-name').prop('disabled', false);

    if (isEdit && projectId) {
      try {
        const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
        const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));
        const sources = stat_data.companyAccount?.monthlyRevenueSources;
        if (sources && typeof sources === 'object' && sources[projectId]) {
          const project = sources[projectId] as {
            name?: string;
            _scope?: string;
            $paymentTermMonths?: number;
            monthlyVolume?: number;
            unitPrice?: number;
            variableCostRate?: number;
          };
          $('#modal-project-name').val(project.name ?? '');
          $('#modal-scope').val(project._scope ?? '待初始化');
          $('#modal-payment-term-months').val(project.$paymentTermMonths ?? 0);
          $('#modal-monthly-sales').val(project.monthlyVolume ?? 0);
          $('#modal-price').val(project.unitPrice ?? 0);
          $('#modal-cost-rate').val(project.variableCostRate ?? 0.3);
        }
      } catch (e) {
        console.warn('获取项目数据失败:', e);
      }
    } else {
      $('#modal-project-name').val('');
      $('#modal-scope').val('待初始化');
      $('#modal-payment-term-months').val('0');
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
    const scope = String($('#modal-scope').val() || '').trim() || '待初始化';
    const paymentTermMonths = parseFloat(String($('#modal-payment-term-months').val() || '0'));

    if (isNaN(monthlyVolume) || isNaN(unitPrice) || isNaN(costRate)) {
      toastr.warning('请输入有效的数值');
      return;
    }
    if (costRate < 0 || costRate > 1) {
      toastr.warning('可变成本率必须在0-1之间');
      return;
    }
    if (isNaN(paymentTermMonths) || paymentTermMonths < 0) {
      toastr.warning('账期月数不能为负数');
      return;
    }

    try {
      const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));

      if (!stat_data.companyAccount) {
        stat_data.companyAccount = {
          monthlyRevenueSources: {},
          $receivablesByDueMonth: {},
          monthlyFixedExpenses: { payroll: 0, facilityCost: 0, marketingBudget: 0, other: 0 },
          oneTimeCompanyChange: 0,
          _cash: 0,
        };
      }

      if (!stat_data.companyAccount.monthlyRevenueSources) {
        stat_data.companyAccount.monthlyRevenueSources = {};
      }

      const sources = stat_data.companyAccount.monthlyRevenueSources;
      const projectId = getIsAddMode()
        ? nextRevenueSourceId(sources)
        : (getEditingProjectId() ?? nextRevenueSourceId(sources));

      const _monthlyGrossProfit = monthlyVolume * unitPrice * (1 - _.clamp(costRate, 0, 1));
      const existing = sources[projectId] as { _scope?: string; $paymentTermMonths?: number } | undefined;

      sources[projectId] = {
        name,
        _scope: scope || existing?._scope || '待初始化',
        monthlyVolume,
        unitPrice,
        variableCostRate: _.clamp(costRate, 0, 1),
        $paymentTermMonths: Math.max(0, Math.floor(paymentTermMonths)),
        _monthlyGrossProfit,
      };

      _.set(variables, 'stat_data', stat_data);
      await Mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });

      setIsAddMode(false);
      setEditingProjectId(null);
      closeProjectModal();
      renderArchive();
      toastr.success('保存成功');
    } catch (e) {
      console.error('保存项目失败:', e);
      toastr.error('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const deleteProject = async (projectId: string) => {
    const variables = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
    const stat_data = Schema.parse(_.get(variables, 'stat_data', {}));
    const name =
      (stat_data.companyAccount?.monthlyRevenueSources as Record<string, { name?: string }>)?.[projectId]?.name ??
      projectId;
    if (!confirm(`确定要删除「${name}」吗？`)) return;

    try {
      if (
        stat_data.companyAccount?.monthlyRevenueSources &&
        projectId in stat_data.companyAccount.monthlyRevenueSources
      ) {
        delete stat_data.companyAccount.monthlyRevenueSources[projectId];
        _.set(variables, 'stat_data', stat_data);
        await Mvu.replaceMvuData(variables, { type: 'message', message_id: 'latest' });
        renderArchive();
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
      const oldReceivables = _.get(oldStatData, 'companyAccount.$receivablesByDueMonth', {}) as Record<string, number>;

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
        const crossedMonths = getCrossedMonths(oldCurrentDate, newCurrentDate);
        const currentYMMatch = String(newCurrentDate).match(/(\d{4})-(\d{2})/);
        const currentYM = currentYMMatch ? `${currentYMMatch[1]}-${currentYMMatch[2]}` : '';

        const { cash: calculatedCompanyCash, receivablesByDueMonth: newReceivables } =
          processCompanyCashWithReceivables(
            oldCompanyCash,
            companyOneTimeChange,
            crossedMonths,
            currentYM,
            oldFixedCosts,
            oldRunningProjects,
            oldReceivables,
          );

        const calculatedPersonalCash = calculatePersonalCash(
          oldPersonalCash,
          personalOneTimeChange,
          monthCrossing,
          oldMonthlyIncome,
          oldMonthlyExpense,
        );

        _.set(currentStatData, 'companyAccount._cash', calculatedCompanyCash);
        _.set(currentStatData, 'companyAccount.$receivablesByDueMonth', newReceivables);
        _.set(currentStatData, 'personalAccount._cash', calculatedPersonalCash);
        _.set(currentStatData, 'personalAccount.oneTimePersonalChange', 0);
        _.set(currentStatData, 'companyAccount.oneTimeCompanyChange', 0);
        _.set(currentVariables, 'stat_data', currentStatData);

        await Mvu.replaceMvuData(currentVariables, { type: 'message', message_id: 'latest' });

        const payrollCost = Number(_.get(oldFixedCosts, 'payroll')) || 0;
        const facilityCost = Number(_.get(oldFixedCosts, 'facilityCost')) || 0;
        const marketingCost = Number(_.get(oldFixedCosts, 'marketingBudget')) || 0;
        const otherOps = Number(_.get(oldFixedCosts, 'other')) || 0;
        const totalFixedCost = payrollCost + facilityCost + marketingCost + otherOps;

        let totalMonthlyProfit = 0;
        if (oldRunningProjects && typeof oldRunningProjects === 'object') {
          for (const pid in oldRunningProjects as Record<string, { _monthlyGrossProfit?: number }>) {
            const p = (oldRunningProjects as Record<string, { _monthlyGrossProfit?: number }>)[pid];
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
        _.set(currentStatData, 'personalAccount.oneTimePersonalChange', 0);
        _.set(currentStatData, 'companyAccount.oneTimeCompanyChange', 0);
        _.set(currentVariables, 'stat_data', currentStatData);

        await Mvu.replaceMvuData(currentVariables, { type: 'message', message_id: 'latest' });

        const msg = `现金重算完成（简化模式）！\n\n【公司账户】\n当前: ¥${Number(currentCompanyCash).toLocaleString()}\n变动: ${
          companyOneTimeChange >= 0 ? '+' : ''
        }¥${Number(companyOneTimeChange).toLocaleString()}\n新值: ¥${newCompanyCash.toLocaleString()}\n\n【个人账户】\n当前: ¥${Number(
          currentPersonalCash,
        ).toLocaleString()}\n变动: ${personalOneTimeChange >= 0 ? '+' : ''}¥${Number(
          personalOneTimeChange,
        ).toLocaleString()}\n新值: ¥${newPersonalCash.toLocaleString()}`;
        toastr.success(msg, '重算现金', { timeOut: 8000 });
      }

      renderArchive();
    } catch (e) {
      console.error('重算现金失败:', e);
      toastr.error('重算现金失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // 绑定公司收入相关按钮
  container.on(`click.${EVENTS_NS}`, '.btn-add-project', e => {
    e.stopPropagation();
    openProjectModal();
  });

  container.on(`click.${EVENTS_NS}`, '.btn-edit-project', function (e) {
    e.stopPropagation();
    const projectId = $(this).data('project-id');
    if (projectId) openProjectModal(String(projectId));
  });

  container.on(`click.${EVENTS_NS}`, '.btn-delete-project', function (e) {
    e.stopPropagation();
    const projectId = $(this).data('project-id');
    if (projectId) deleteProject(String(projectId));
  });

  container.on(`click.${EVENTS_NS}`, '.btn-recalculate-cash', e => {
    e.stopPropagation();
    recalculateCash();
  });

  container.on(`click.${EVENTS_NS}`, '.receivables-detail-toggle', function (e) {
    e.stopPropagation();
    const $list = $(this).next('.receivables-detail-list');
    const visible = $list.is(':visible');
    $list.toggle();
    $(this).text(visible ? '▼ 查看明细' : '▲ 收起明细');
  });

  // 模态框：绑定在父页 document 上，保证脚本 iframe 中也能操作
  const $parentDoc = $(window.parent.document);
  $parentDoc.on(`click.${EVENTS_NS}`, '#modal-cancel, #project-modal', function (e) {
    if (e.target === this) closeProjectModal();
  });
  $parentDoc.on(`click.${EVENTS_NS}`, '#modal-save', e => {
    e.stopPropagation();
    saveProject();
  });
  $parentDoc.on(`keydown.${EVENTS_NS}`, '#project-modal input', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveProject();
    }
  });

  // 内容区拖拽滚动（保持与原状态栏体验一致）
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

  content.on(`mousedown.${EVENTS_NS}`, e => startDrag(e.pageY));
  content.on(`mouseleave.${EVENTS_NS}`, stopDrag);
  content.on(`mouseup.${EVENTS_NS}`, stopDrag);
  content.on(`mousemove.${EVENTS_NS}`, e => {
    if (isDown) {
      e.preventDefault();
      doDrag(e.pageY);
    }
  });

  content.on(`touchstart.${EVENTS_NS}`, e => {
    if (e.originalEvent?.touches?.[0]) startDrag(e.originalEvent.touches[0].pageY);
  });
  content.on(`touchend.${EVENTS_NS}`, stopDrag);
  content.on(`touchmove.${EVENTS_NS}`, e => {
    if (isDown && e.originalEvent?.touches?.[0]) doDrag(e.originalEvent.touches[0].pageY);
  });

  // 初次渲染 + 若干轮重渲染，保证在角色卡刚载入时也能拿到数据
  renderArchive();
  let initCount = 0;
  initIntervalId = setInterval(() => {
    renderArchive();
    initCount++;
    if (initCount >= 3 && initIntervalId) {
      clearInterval(initIntervalId);
      initIntervalId = null;
    }
  }, 300);

  // 监听酒馆事件：消息更新 / MVU 变量变化时刷新档案
  const debouncedUpdate = () => {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      renderArchive();
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
      const parent = window.parent as Window & { eventOn?: typeof eventOn; Mvu?: typeof Mvu };
      if (parent?.eventOn && parent?.Mvu?.events) {
        parent.eventOn(parent.Mvu.events.VARIABLE_UPDATE_ENDED, debouncedUpdate);
      }
    } catch {
      // 可能跨域，忽略
    }
  }

  // 设置只读字段保护
  setupReadonlyFields();
}

// ===== 启动：等待 Mvu / stat_data 就绪后再初始化 =====

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
        initArchiveStatus();
      }
    }, 200);
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
  $('#archive-status-root, #archive-status-css, #project-modal').remove();
  $(document).off(`.${EVENTS_NS}`);
  $(window.parent.document).off(`.${EVENTS_NS}`);
});
