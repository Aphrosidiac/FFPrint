import { createApp } from 'vue'
import App from './App.vue'
import { app, openPaths, runSlice } from './stores/app'
import { scene } from './stores/scene'
import './styles/tokens.css'
import './styles/base.css'

// Test/automation handle used by scripts/shot.mjs and the e2e suite.
;(window as unknown as { __ff: unknown }).__ff = {
  app,
  scene,
  openPaths,
  runSlice,
  setTheme: (t: 'light' | 'dark' | 'system') => {
    if (app.prefs) app.prefs.theme = t
  }
}

createApp(App).mount('#app')
