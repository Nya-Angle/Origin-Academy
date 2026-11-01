/**
 * 渲染层入口
 */

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles/globals.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 挂载点')

createRoot(container).render(<App />)
