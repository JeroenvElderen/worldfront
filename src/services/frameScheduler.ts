type FrameTask = () => void

const FRAME_INTERVAL_MS = 50
let nextTaskId = 1
let timer: number | undefined
const pendingTasks = new Map<number, FrameTask>()

const flush = () => {
  timer = undefined
  if (document.visibilityState === 'hidden') return

  const tasks = [...pendingTasks.entries()]
  pendingTasks.clear()
  tasks.forEach(([, task]) => task())

  if (pendingTasks.size) scheduleFlush()
}

const scheduleFlush = () => {
  if (timer !== undefined || !pendingTasks.size || document.visibilityState === 'hidden') return
  timer = window.setTimeout(flush, FRAME_INTERVAL_MS)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleFlush()
})

/**
 * Queue all live-map movement work behind one shared clock. A task is one-shot;
 * journeys that are still active queue their next frame from inside the task.
 */
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
