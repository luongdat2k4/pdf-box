import type { RenderedSlide } from './presentation-protocol'

interface Waiter { resolve(value: RenderedSlide): void; reject(error: unknown): void; clean(): void }
interface Job { index: number; priority: boolean; waiters: Set<Waiter> }
const cancelled = () => new DOMException('Cancelled', 'AbortError')

/** One render at a time. Current slide precedes thumbnails; scrolling away cancels queued thumbnail work. */
export function createSlideCache(load: (index: number) => Promise<RenderedSlide>) {
  const cache = new Map<number, RenderedSlide>()
  const jobs = new Map<number, Job>()
  let active: Job | undefined
  let closed = false
  let bytes = 0
  const size = (slide: RenderedSlide) => 2 * (slide.svg.length + slide.text.length + slide.notes.length)

  function finish(job: Job, value?: RenderedSlide, error?: unknown) {
    for (const waiter of job.waiters) {
      waiter.clean()
      if (value) waiter.resolve(value)
      else waiter.reject(error)
    }
    job.waiters.clear()
  }
  async function pump() {
    if (closed || active || !jobs.size) return
    const job = [...jobs.values()].find((j) => j.priority) ?? jobs.values().next().value!
    active = job
    try {
      const value = await load(job.index)
      if (!closed) {
        cache.set(job.index, value); bytes += size(value)
        // Keep at most six slides / four MiB of serialized markup, including thumbnail requests.
        while (cache.size > 6 || bytes > 4 * 1024 * 1024) {
          const first = cache.entries().next().value!
          cache.delete(first[0]); bytes -= size(first[1])
        }
        finish(job, value)
      }
    } catch (error) { finish(job, undefined, error) }
    finally { jobs.delete(job.index); active = undefined; void pump() }
  }

  return {
    get(index: number, signal?: AbortSignal, priority = true): Promise<RenderedSlide> {
      if (closed || signal?.aborted) return Promise.reject(cancelled())
      const hit = cache.get(index)
      if (hit) { cache.delete(index); cache.set(index, hit); return Promise.resolve(hit) }
      let job = jobs.get(index)
      if (!job) { job = { index, priority, waiters: new Set() }; jobs.set(index, job) }
      if (priority) job.priority = true
      const target = job
      return new Promise((resolve, reject) => {
        const abort = () => {
          target.waiters.delete(waiter); waiter.clean(); reject(cancelled())
          if (!target.waiters.size && active !== target) jobs.delete(index)
        }
        const waiter: Waiter = { resolve, reject, clean: () => signal?.removeEventListener('abort', abort) }
        target.waiters.add(waiter)
        signal?.addEventListener('abort', abort, { once: true })
        void pump()
      })
    },
    dispose(error: unknown = cancelled()) {
      closed = true
      for (const job of jobs.values()) finish(job, undefined, error)
      jobs.clear(); cache.clear(); bytes = 0
    },
  }
}
