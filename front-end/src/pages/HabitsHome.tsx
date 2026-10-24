import { Heart } from 'lucide-react'

export default function HabitsHome() {
  return (
    <section
      aria-labelledby="coming-soon-title"
      className="flex min-h-[55vh] flex-col items-center justify-center text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Heart size={30} aria-hidden="true" />
      </div>
      <h1 id="coming-soon-title" className="text-2xl font-bold">
        Today
      </h1>
      <p className="mt-2 text-sm font-medium text-primary">Coming Soon</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">Habit tracking is being rebuilt.</p>
    </section>
  )
}
