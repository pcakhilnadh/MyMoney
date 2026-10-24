import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, PiggyBank, Tags } from 'lucide-react'
import { SectionTitle, Select } from '@/components/kit'
import { CURRENCIES, currencySymbol, isCurrencyCode } from '@/lib/currency'
import { useCurrency } from '@/money/CurrencyContext'

const MENU = [
  { to: '/money/settings/accounts', label: 'Payment Account', Icon: CreditCard },
  { to: '/money/settings/categories', label: 'Categories', Icon: Tags },
  { to: '/money/budgets', label: 'Budgets', Icon: PiggyBank },
]

export default function Settings() {
  const { currency, loading, loadError, saveCurrency } = useCurrency()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function changeCurrency(value: string) {
    if (!isCurrencyCode(value)) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveCurrency(value)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to update currency.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="surface space-y-3 rounded-2xl p-4">
        <div>
          <h2 className="font-semibold">Currency</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Used for amounts across My Money. Changing this relabels amounts; it does not convert
            their values.
          </p>
        </div>
        <Select
          aria-label="Preferred currency"
          value={currency}
          disabled={loading || saving}
          onChange={(event) => void changeCurrency(event.target.value)}
        >
          {CURRENCIES.map(({ code, name }) => (
            <option key={code} value={code}>
              {code} · {currencySymbol(code)} · {name}
            </option>
          ))}
        </Select>
        {saving && (
          <p role="status" className="text-sm text-muted-foreground">
            Saving currency…
          </p>
        )}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
      </section>
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
