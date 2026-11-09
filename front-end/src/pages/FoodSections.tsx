import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Plus,
  User,
  type LucideIcon,
} from 'lucide-react'

function FoodPlaceholder({
  title,
  description,
  Icon,
}: {
  title: string
  description: string
  Icon: LucideIcon
}) {
  return (
    <section
      aria-labelledby="food-section-title"
      className="flex min-h-[55vh] flex-col items-center justify-center text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Icon size={30} aria-hidden="true" />
      </div>
      <h1 id="food-section-title" className="text-2xl font-bold">
        {title}
      </h1>
      <p className="mt-2 text-sm font-medium text-primary">Coming Soon</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{description}</p>
    </section>
  )
}

export function FoodDiary() {
  return (
    <FoodPlaceholder
      title="Diary"
      description="Your meals and daily food log will live here."
      Icon={BookOpen}
    />
  )
}

export function FoodAdd() {
  return (
    <FoodPlaceholder
      title="Add a meal"
      description="Meal logging is on the way."
      Icon={Plus}
    />
  )
}

export function FoodInsights() {
  return (
    <FoodPlaceholder
      title="Insights"
      description="Food trends and nutrition insights will appear here."
      Icon={ChartNoAxesColumnIncreasing}
    />
  )
}

export function FoodProfile() {
  return (
    <FoodPlaceholder
      title="Profile"
      description="Your food preferences and goals will be available here."
      Icon={User}
    />
  )
}
