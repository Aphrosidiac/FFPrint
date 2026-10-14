// Visual audit: launches the BUILT app (isolated data dir) once per theme x size and screenshots
// every page and state in order. Run `pnpm build` first.
//
//   node scripts/audit-shots.mjs <outDir> [--sizes 1920x1032,1100x680] [--themes light,dark] [--only name,name]

import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const outDir = resolve(args[0] ?? 'audit')
const opt = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const sizes = (opt('--sizes') ?? '1920x1032,1100x680').split(',').map((s) => s.split('x').map(Number))
const themes = (opt('--themes') ?? 'light,dark').split(',')
const only = opt('--only')?.split(',')
mkdirSync(outDir, { recursive: true })
const fx = (f) => resolve('tests/fixtures', f)

const ev = (page, js) => page.evaluate((code) => new Function('ff', `with (ff) { return (async () => { ${code} })() }`)(window.__ff), js)
const settle = (page, ms = 350) => page.waitForTimeout(ms)
async function canvasBox(page) {
  return page.evaluate(() => {
    const r = document.querySelector('.centre canvas').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
}
async function reset(page) {
  await page.keyboard.press('Escape')
  await ev(page, `app.page='workspace'; app.mode='prepare'; document.querySelectorAll('dialog[open]').forEach(d=>d.close())`)
  await page.mouse.click(5, 300).catch(() => {})
}
async function scrollShots(page, sel, base, shoot) {
  const h = await page.evaluate((s) => {
    const el = document.querySelector(s)
    return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null
  }, sel)
  if (!h) return shoot(base)
  let i = 0
  for (let y = 0; ; y += Math.floor(h.ch * 0.85)) {
    await page.evaluate(([s, y]) => (document.querySelector(s).scrollTop = y), [sel, y])
    await settle(page, 150)
    await shoot(i ? `${base}-s${i}` : base)
    i++
    if (y + h.ch >= h.sh || i > 6) break
  }
  await page.evaluate((s) => (document.querySelector(s).scrollTop = 0), sel)
}

const STEPS = [
  ['01-empty', async () => {}],
  ['02-loaded', async (p) => {
    await ev(p, `await openPaths([${JSON.stringify(fx('bracket.stl'))}, ${JSON.stringify(fx('cube20.stl'))}, ${JSON.stringify(fx('twist120.stl'))}])`)
    await p.waitForFunction(() => window.__ff.scene.objects.length >= 3, null, { timeout: 30000 })
    await settle(p, 800)
  }],
  ['03-selected', async (p) => {
    await ev(p, `scene.selection.splice(0, scene.selection.length, scene.objects[0].id)`)
  }],
  ['04-plate-menu', async (p) => {
    const b = await canvasBox(p)
    await p.mouse.click(b.x + 40, b.y + b.h - 40, { button: 'right' })
  }],
  ['05-object-menu', async (p) => {
    await p.keyboard.press('Escape')
    const b = await canvasBox(p)
    // aim at the selected object's projected centre
    const pt = await ev(p, `return objects.screenPoint ? objects.screenPoint(scene.objects[0].id) : null`).catch(() => null)
    const x = pt ? pt.x : b.x + b.w / 2, y = pt ? pt.y : b.y + b.h / 2
    await p.mouse.click(x, y, { button: 'right' })
  }],
  ['06-recent-menu', async (p) => {
    await p.keyboard.press('Escape')
    await p.click('.top .recent .tb')
  }],
  ['07-filament-picker', async (p) => {
    await p.click('.top .recent .tb')
    await p.click('.fp .current')
  }],
  ['08-more-settings', async (p) => {
    await p.click('.fp .current')
    await p.getByRole('button', { name: /More settings/i }).first().click()
    await settle(p, 400)
  }],
  ['09-more-settings-search', async (p) => {
    await p.fill('.ms .search input', 'speed')
  }],
  ['10-save-setup-dialog', async (p) => {
    await p.keyboard.press('Escape')
    await ev(p, `document.querySelectorAll('dialog[open]').forEach(d=>d.close())`)
    await settle(p, 200)
    await p.click('[aria-label="Save as new setup"]')
    await settle(p, 300)
  }],
  ['10b-multi-select', async (p) => {
    await ev(p, `document.querySelectorAll('dialog[open]').forEach(d=>d.close()); objects.selectAll()`)
  }],
  ['11-too-large', async (p) => {
    await ev(p, `document.querySelectorAll('dialog[open]').forEach(d=>d.close())`)
    await ev(p, `await openPaths([${JSON.stringify(fx('toolarge.stl'))}])`)
    await settle(p, 1200)
  }],
  ['12-slicing', async (p) => {
    await ev(p, `const big = scene.objects.find(o => /toolarge/.test(o.name)); if (big) objects.deleteObjects ? objects.deleteObjects([big.id]) : null`)
    await ev(p, `const big = scene.objects.find(o => /toolarge/.test(o.name)); if (big) { scene.selection.splice(0, 9, big.id) }`)
    await p.keyboard.press('Delete').catch(() => {})
    await settle(p, 300)
    await ev(p, `runSlice()`)
    await p.waitForFunction(() => window.__ff.app.sliceProgress.percent > 30 || window.__ff.app.slice.status !== 'slicing', null, { timeout: 120000 })
  }],
  ['13-preview', async (p) => {
    await p.waitForFunction(() => ['done', 'error'].includes(window.__ff.app.slice.status), null, { timeout: 180000 })
    await settle(p, 1500)
  }],
  ['14-preview-legend', async (p) => {
    const chip = await p.$('.chip')
    if (chip) await chip.click()
    await settle(p, 300)
  }],
  ['15-prepare-after-slice', async (p) => {
    await ev(p, `app.mode='prepare'`)
    await settle(p, 400)
  }],
  ['16-filaments', async (p) => {
    await ev(p, `app.page='filaments'`)
  }, 'SCROLL'],
  ['17-filament-editor', async (p) => {
    await p.locator('.page button', { hasText: /^Edit$/ }).first().click().catch(async () => {
      await p.locator('.page [title*="Edit"]').first().click()
    })
    await settle(p, 400)
  }],
  ['18-history', async (p) => {
    await ev(p, `document.querySelectorAll('dialog[open]').forEach(d=>d.close()); await recordJob('C:/fake/out.gcode', ''); app.page='history'`)
    await settle(p, 500)
  }, 'SCROLL'],
  ['18b-history-delete', async (p) => {
    await p.click('[aria-label="Delete from history"]')
    await settle(p, 300)
  }],
  ['18c-filament-add-menu', async (p) => {
    await ev(p, `document.querySelectorAll('dialog[open]').forEach(d=>d.close()); app.page='filaments'`)
    await settle(p, 200)
    await p.locator('.page button', { hasText: 'Add filament' }).click()
  }],
  ['18d-filament-delete', async (p) => {
    await p.keyboard.press('Escape')
    await p.mouse.click(5, 500)
    await p.locator('.page [aria-label="Delete"]').nth(2).click()
    await settle(p, 300)
  }],
  ['18e-history-empty', async (p) => {
    await ev(p, `document.querySelectorAll('dialog[open]').forEach(d=>d.close()); window.__savedHistory = app.history.splice(0); app.page='history'`)
  }],
  ['19-machine', async (p) => {
    await ev(p, `app.history.push(...(window.__savedHistory || [])); app.page='machine'`)
    await settle(p, 400)
  }, 'SCROLL'],
  ['20-toasts', async (p) => {
    await ev(p, `app.page='workspace'; app.toasts.push({id: 991, kind:'success', text:'Saved Bracket.gcode to E: SD card'}); app.toasts.push({id: 992, kind:'error', text:'The engine stopped: model is outside the printable area.'}); app.toasts.push({id: 993, kind:'info', text:'Opened 3 models'})`)
    await settle(p, 400)
  }],
  ['21-drop-overlay', async (p) => {
    await ev(p, `app.toasts.splice(0); const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.stl')); document.querySelector('.app').dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))`)
    await settle(p, 200)
  }]
]

for (const [w, h] of sizes) {
  for (const theme of themes) {
    const dataDir = mkdtempSync(join(tmpdir(), 'ffprint-audit-'))
    const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' } })
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }, s) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setMinimumSize(800, 600)
      win.setContentSize(s.w, s.h)
      win.center()
    }, { w, h })
    page.on('pageerror', (e) => console.log('[page error]', e.message))
    page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()))
    await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 30000 })
    await page.evaluate((t) => window.__ff.setTheme(t), theme)
    await settle(page, 1200)
    const tag = `${theme}-${w}`
    for (const [name, run, scrollSel] of STEPS) {
      try {
        await run(page)
        await settle(page)
        if (only && !only.some((o) => name.startsWith(o))) continue
        const shoot = (n) => page.screenshot({ path: join(outDir, `${n}-${tag}.png`) })
        if (scrollSel === 'SCROLL') {
          const sel = await page.evaluate(() => {
            const els = [...document.querySelectorAll('.page *')].filter((e) => e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
            if (!els[0]) return null
            els[0].setAttribute('data-audit-scroll', '1')
            return '[data-audit-scroll]'
          })
          if (sel) await scrollShots(page, sel, name, shoot)
          else await shoot(name)
        } else await shoot(name)
        console.log('ok', name, tag)
      } catch (e) {
        console.log('FAIL', name, tag, e.message.split('\n')[0])
      }
    }
    await app.close()
  }
}
