import { createApp } from 'vue'
import App from './App.vue'
import { initAutomation } from './automation'
import { app, openPaths, recordJob, reprint, runSlice } from './stores/app'
import { addMesh, addObject, scene, worldBox } from './stores/scene'
import { parseModel } from './lib/loaders'
import * as settingsActions from './stores/settingsActions'
import * as outputActions from './stores/outputActions'
import * as previewActions from './preview/actions'
import * as viewportActions from './viewport/actions'
import './styles/tokens.css'
import './styles/base.css'

// Test/automation handle used by scripts/shot.mjs and the e2e suite.
;(window as unknown as { __ff: unknown }).__ff = {
  app,
  scene,
  openPaths,
  runSlice,
  recordJob,
  reprint,
  settings: settingsActions,
  output: outputActions,
  preview: previewActions,
  objects: viewportActions,
  debug: { parseModel, addMesh, addObject, worldBox },
  setTheme: (t: 'light' | 'dark' | 'system') => {
    if (app.prefs) app.prefs.theme = t
  }
}

initAutomation()
createApp(App).mount('#app')
