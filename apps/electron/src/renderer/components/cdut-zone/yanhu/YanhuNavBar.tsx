/**
 * YanhuNavBar —— 问渠学堂导航控制栏
 *
 * 组成：前进 / 后退 / 刷新 + 加载进度指示。
 * 地址栏、校内书签快捷入口、诊断控制台入口已移除。
 */

import * as React from 'react'
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react'

interface YanhuNavBarProps {
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
}

export function YanhuNavBar({
  canGoBack,
  canGoForward,
  loading,
  onBack,
  onForward,
  onReload,
}: YanhuNavBarProps): React.ReactElement {
  return (
    <div className="relative flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/60 px-3 py-1.5 backdrop-blur-sm titlebar-no-drag">
      <div className="flex shrink-0 items-center gap-0.5">
        <NavButton disabled={!canGoBack} onClick={onBack} title="后退">
          <ArrowLeft size={15} />
        </NavButton>
        <NavButton disabled={!canGoForward} onClick={onForward} title="前进">
          <ArrowRight size={15} />
        </NavButton>
        <NavButton onClick={onReload} title="刷新">
          <RotateCw size={15} className={loading ? 'animate-spin' : undefined} />
        </NavButton>
      </div>

      {/* 加载进度指示：位于导航栏底边（DOM 层，不被原生页面视图遮挡） */}
      {loading ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/20">
          <div className="h-full w-full animate-pulse bg-primary" />
        </div>
      ) : null}
    </div>
  )
}

function NavButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  title: string
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  )
}
