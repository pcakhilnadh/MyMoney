import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChartCard, Card } from '@/components/kit'
import {
  countForDate,
  currentStreak,
  getEntries,
  isoDate,
  longestStreak,
  recentTrend,
  trackedDates,
} from '@/lib/food'

export default function FoodInsights() {
  const entries = useLiveQuery(() => getEntries(), []) ?? []
  const data = recentTrend(entries)
  const totalTrackedDays = trackedDates(entries).length

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Insights</p>
        <h1 className="text-[28px] leading-tight font-bold">Your food rhythm</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Current streak</div>
          <div className="money mt-2 text-[32px] font-bold text-primary">{currentStreak(entries)}</div>
          <div className="text-sm text-muted-foreground">days</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Longest streak</div>
          <div className="money mt-2 text-[32px] font-bold text-primary">{longestStreak(entries)}</div>
          <div className="text-sm text-muted-foreground">days</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Tracked days</div>
          <div className="money text-2xl font-bold text-primary">{totalTrackedDays}</div>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {countForDate(isoDate(), entries)} items logged today
        </div>
      </Card>

      <BarChartCard title="Last 7 days" data={data} />

      <Link to="/food" className="surface flex items-center justify-center rounded-2xl px-4 py-3 font-medium">
        Back to today
      </Link>
    </div>
  )
}
