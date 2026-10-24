import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card, PageHeader, Select } from '@/components/kit'
import { CURRENCIES, currencySymbol, isCurrencyCode } from '@/lib/currency'
import { useCurrency } from '@/money/CurrencyContext'

export default function CurrencySettings() {
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
    <div className="space-y-4">
      <Link
        to="/money/settings"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={18} />
        My Money Settings
      </Link>
      <PageHeader title="Currency" subtitle="Choose your preferred currency" />
      <Card className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label">Preferred currency</span>
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
        </label>
        <p className="text-sm text-muted-foreground">
          This changes currency labels throughout My Money. Amounts are not converted.
        </p>
      </Card>
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
    </div>
  )
}
