/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

const STORAGE_KEY = 'captionflow:history:v1';

beforeEach(() => {
  localStorage.clear();
});

describe('CaptionFlow 应用集成', () => {
  it('启动加载内置双人采访，并展示四类问题检查项', () => {
    render(<App />);
    expect(screen.getByText('CaptionFlow')).toBeTruthy();
    // 示例内置：1 处重叠、1 处空白、1 处翻译超时、至少 1 处发言人冲突
    expect(screen.getByText('时间重叠')).toBeTruthy();
    expect(screen.getByText('空白间隙')).toBeTruthy();
    expect(screen.getAllByText('翻译超时').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('发言人冲突').length).toBeGreaterThanOrEqual(1);
    // 初始无历史，撤销按钮禁用
    expect(screen.getByRole('button', { name: /撤销/ }).hasAttribute('disabled')).toBe(true);
  });

  it('一键修复重叠产生新版本，可撤销，且写入 localStorage 供刷新恢复', () => {
    const { unmount } = render(<App />);
    expect(screen.getAllByText('时间重叠')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /一键修复重叠/ }));

    // 修复后重叠检查项消失
    expect(screen.queryAllByText('时间重叠')).toHaveLength(0);
    // 撤销可用：新版本已入栈
    const undoButton = screen.getByRole('button', { name: /撤销/ });
    expect(undoButton.hasAttribute('disabled')).toBe(false);
    // 影响面板显示对比
    expect(screen.getByText(/调整影响/)).toBeTruthy();
    expect(screen.getAllByText(/修复重叠/).length).toBeGreaterThan(0);

    // 历史已持久化
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).history.past.length).toBe(1);

    // 撤销后重叠回来（同一会话内）
    fireEvent.click(undoButton);
    expect(screen.getAllByText('时间重叠')).toHaveLength(1);

    // 再次修复到 v2，然后模拟刷新：卸载后重新挂载，从 localStorage 恢复（撤销栈仍在）
    fireEvent.click(screen.getByRole('button', { name: /一键修复重叠/ }));
    expect(screen.queryAllByText('时间重叠')).toHaveLength(0);
    unmount();
    render(<App />);
    const restoredUndo = screen.getByRole('button', { name: /撤销/ });
    expect(restoredUndo.hasAttribute('disabled')).toBe(false);
    // 恢复后处于已修复状态；刷新后仍可撤销回带重叠的版本
    expect(screen.queryAllByText('时间重叠')).toHaveLength(0);
    fireEvent.click(restoredUndo);
    expect(screen.getAllByText('时间重叠')).toHaveLength(1);
  });

  it('语言切换后表格标题更新', () => {
    render(<App />);
    expect(screen.getByText(/当前语言 中文/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByText(/当前语言 English/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    expect(screen.getByText(/当前语言 Español/)).toBeTruthy();
  });
});
