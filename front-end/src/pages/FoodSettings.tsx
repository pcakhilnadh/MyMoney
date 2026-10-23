import { Link } from 'react-router-dom'
import { Database, Utensils } from 'lucide-react'
import { Card } from '@/components/kit'
import { getFoodLibrary } from '@/lib/food'

export default function FoodSettings() {
  const totalFoods = getFoodLibrary().length

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="text-[28px] leading-tight font-bold">Food settings</h1>
      </div>

      <Link to="/food/settings/database" className="block">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Utensils size={20} />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Food Database</span>
            <span className="text-sm text-muted-foreground">{totalFoods} saved items</span>
          </span>
          <Database size={18} className="text-muted-foreground" />
        </Card>
      </Link>
    </div>
  )
}
