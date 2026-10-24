import { Utensils } from 'lucide-react'

export default function FoodHome() {
  return (
    <section
      aria-labelledby="food-coming-soon-title"
      className="flex min-h-[55vh] flex-col items-center justify-center text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Utensils size={30} aria-hidden="true" />
      </div>
      <h1 id="food-coming-soon-title" className="text-2xl font-bold">
        MyFood
      </h1>
      <p className="mt-2 text-sm font-medium text-primary">Coming Soon</p>
    </section>
  )
}
