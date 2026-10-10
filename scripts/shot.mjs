// Screenshot the notebook once Pyodide is ready and every cell has finished running (URL may be
// .../#example=signal to load an example, which is run with Run all).
// usage: node scripts/shot.mjs URL OUT.png [width] [height] [dark] [script]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [url, out, w = '1440', h = '960', dark, script] = process.argv.slice(2)
const chrome = spawn(process.env.CHROME ?? 'chromium', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9312', `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    target = await fetch('http://127.0.0.1:9312/json').then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null)
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) pending.get(m.id)(m.result ?? m.error)
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 })
  if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await send('Page.navigate', { url })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  let done = false
  for (let i = 0; i < 240 && !done; i++) {
    await sleep(500)
    done = (await ev("!!document.querySelector('.status.idle')")) === true
  }
  if (done && !script) {
    // Run all, then wait until no cell is running or queued.
    await ev("[...document.querySelectorAll('.toolbar button')].find((b) => b.textContent.includes('Run all') || b.textContent.includes('Запустити все')).click()")
    await sleep(1000)
    for (let i = 0; i < 240; i++) {
      await sleep(500)
      if ((await ev("!document.querySelector('.cell.running') && ![...document.querySelectorAll('.count')].some((c) => /[*…]/.test(c.textContent))")) === true) break
    }
  }
  if (script) await send('Runtime.evaluate', { expression: script })
  await sleep(800) // let the animation draw a frame or two
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(done ? 'notebook ready' : 'TIMED OUT waiting for Pyodide', '→', out)
  const cellErrors = await ev("[...document.querySelectorAll('.out-text.error')].map((e) => e.textContent)")
  if (cellErrors?.length) console.log('cell errors:\n' + cellErrors.join('\n---\n'))
  if (errors.length) console.log('page errors:\n' + errors.join('\n'))
  ws.close()
} finally {
  chrome.kill()
}
