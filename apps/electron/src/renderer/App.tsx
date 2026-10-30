/**
 * 应用外壳：轻量标题栏 + 问渠学堂浏览器容器
 */

import type { ReactElement } from 'react'
import { BookOpen } from 'lucide-react'
import { YanhuExpressView } from '@/components/cdut-zone/yanhu/YanhuExpressView'

export function App(): ReactElement {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="titlebar-drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-card/80 px-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight">CDUT Studio</span>
        <span className="text-xs text-muted-foreground">问渠学堂</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <YanhuExpressView scope="wqxt" />
      </main>
    </div>
  )
}
