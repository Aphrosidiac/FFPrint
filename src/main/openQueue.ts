// Files to open that arrive before the window is listening (launch arguments, an early
// second-instance or open-file). The renderer takes them once its 'open-files' listener is
// registered; from then on files are sent straight away. A reload starts the wait again.

let pending: string[] = []
let listening = false

export function queueOpen(files: string[], send: (files: string[]) => void): void {
  if (!files.length) return
  if (listening) send(files)
  else pending.push(...files)
}

export function takePendingOpens(): string[] {
  listening = true
  const files = pending
  pending = []
  return files
}

export function stopListening(): void {
  listening = false
}
