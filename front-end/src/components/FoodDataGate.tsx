import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button, Card } from '@/components/kit'
import { migrateLegacyFoodStorage } from '@/lib/food'

export default function FoodDataGate() {
  const [attempt, setAttempt] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void migrateLegacyFoodStorage()
      .then(() => {
        if (active) setReady(true)
      })
      .catch((migrationError: unknown) => {
        if (active) {
          setError(
            migrationError instanceof Error
              ? migrationError.message
              : 'Food data migration failed',
          )
        }
      })
    return () => {
      active = false
    }
  }, [attempt])

  if (error) {
    return (
      <div role="alert">
        <Card>
          <p className="font-semibold">Food data could not be prepared.</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            className="mt-3"
            onClick={() => {
              setError(null)
              setReady(false)
              setAttempt((current) => current + 1)
            }}
          >
            Retry
          </Button>
        </Card>
      </div>
    )
  }

  return ready ? <Outlet /> : <p className="text-muted-foreground">Preparing Food data…</p>
}
