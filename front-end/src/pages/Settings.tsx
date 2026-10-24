import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, PiggyBank, Tags } from 'lucide-react'
import { SectionTitle } from '@/components/kit'

const MENU = [
  { to: '/money/settings/accounts', label: 'Payment Account', Icon: CreditCard },
  { to: '/money/settings/categories', label: 'Categories', Icon: Tags },
  { to: '/money/budgets', label: 'Budgets', Icon: PiggyBank },
]

export default function Settings() {
  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <SectionTitle>My Money Settings</SectionTitle>
        {MENU.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="surface flex items-center gap-3 rounded-2xl px-4 py-3.5 font-medium"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon size={18} />
            </span>
            <span className="flex-1">{label}</span>
            <ChevronRight size={18} className="text-muted-foreground" />
          </Link>
        ))}
      </section>
    </div>
  )
}
