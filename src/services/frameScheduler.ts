type FrameTask = () => void

const FAST_FRAME_MS = 1000 / 60
const SLOW_FRAME_MS = 1000 / 30
let frameIntervalMs = FAST_FRAME_MS
let nextTaskId = 1
let timer: number | undefined
let lastFlushAt = 0
const pendingTasks = new Map<number, FrameTask>()

const scheduleFlush = () => {
  if (timer !== undefined || !pendingTasks.size || document.visibilityState === 'hidden') return
  // Keep a shared adaptive 30–60 Hz maximum, without creating a new 50 ms delay after
  // every expensive flush. This reduces timing drift when many vehicles move.
  const wait = Math.max(0, frameIntervalMs - (performance.now() - lastFlushAt))
  timer = window.setTimeout(flush, wait)
}

const flush = () => {
  timer = undefined
  if (document.visibilityState === 'hidden') return
  const startedAt = performance.now()
  lastFlushAt = startedAt

  // Snapshot the queue: tasks scheduling their next frame cannot run twice
  // in this flush. Other tasks continue even if one animation throws.
  const tasks = [...pendingTasks.values()]
  pendingTasks.clear()
  for (const task of tasks) {
    try {
      task()
    } catch (error) {
      console.error('[WorldFront] Map animation task failed:', error)
    }
  }
  const elapsed = performance.now() - startedAt
  frameIntervalMs = elapsed > FAST_FRAME_MS ? SLOW_FRAME_MS : FAST_FRAME_MS
  scheduleFlush()
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Do not wake a suspended mobile tab just to attempt a map update.
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  } else {
    lastFlushAt = performance.now()
    scheduleFlush()
  }
})

/** Queue one-shot live-map work behind the shared adaptive clock. */
export const scheduleMapFrame = (task: FrameTask) => {
  const id = nextTaskId++
  pendingTasks.set(id, task)
  scheduleFlush()
  return id
}

export const cancelMapFrame = (id: number | undefined) => {
  if (id === undefined) return
  pendingTasks.delete(id)
  if (!pendingTasks.size && timer !== undefined) {
    window.clearTimeout(timer)
    timer = undefined
  }
}
