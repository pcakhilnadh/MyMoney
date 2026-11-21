import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PlateContext, tabFromPath, usePlate, type PlateSheet } from './context'
import { useKitchens, usePlateAutoSync, useSettings } from './hooks'
import type { KitchenSelection } from './types'
import { MealSheet } from './sheets/MealSheet'
import { LiveShoppingPill } from './shopping'
import { Toaster } from './toast'
import { CreateSheet, IdeaSheet, ImportSheet, ItemSheet } from './sheets/CreateSheets'
import { InviteSheet, JoinSheet, NewKitchenSheet, SwitcherSheet } from './sheets/KitchenSheets'

/** Per device, so MyPlate reopens on the kitchen you left it on. */
const SELECTION_KEY = 'myplate.selectedKitchen'

function readStored(): KitchenSelection | null {
  try {
    return localStorage.getItem(SELECTION_KEY)
  } catch {
    return null
  }
}

export function PlateProvider({ children }: { children: ReactNode }) {
  usePlateAutoSync()
  const kitchens = useKitchens().data
  const settings = useSettings().data
  const [chosen, setChosen] = useState<KitchenSelection | null>(readStored)
  const [sheet, setSheet] = useState<PlateSheet | null>(null)

  const personalId = kitchens?.find((k) => k.is_personal)?.id
  // Last choice on this device, else the default kitchen (null default = All). With only
  // My Kitchen there's nothing to merge, so it opens on My Kitchen.
  const fallback = kitchens && kitchens.length <= 1 ? (personalId ?? 'all') : 'all'
  const wanted = chosen ?? (settings ? (settings.default_group_id ?? fallback) : null)
  const selection: KitchenSelection =
    wanted === 'all' || (wanted && kitchens?.some((k) => k.id === wanted))
      ? wanted
      : (personalId ?? 'all')

  const select = useCallback((next: KitchenSelection) => {
    setChosen(next)
    try {
      localStorage.setItem(SELECTION_KEY, next)
    } catch {
      // Remembering the kitchen is a convenience; it's fine if storage is unavailable.
    }
  }, [])

  const value = useMemo(
    () => ({
      selection,
      select,
      personalId,
      sheet,
      open: setSheet,
      close: () => setSheet(null),
    }),
    [selection, select, personalId, sheet],
  )

  return (
    <PlateContext.Provider value={value}>
      {children}
      <LiveShoppingPill />
      <Toaster />
      {sheet && <ActiveSheet key={sheetKey(sheet)} sheet={sheet} />}
    </PlateContext.Provider>
  )
}

const sheetKey = (sheet: PlateSheet) =>
  `${sheet.kind}-${'meal' in sheet ? (sheet.meal?.id ?? '') : ''}-${'kitchenId' in sheet ? sheet.kitchenId : ''}`

function ActiveSheet({ sheet }: { sheet: PlateSheet }) {
  switch (sheet.kind) {
    case 'create':
      return <CreateSheet tab={sheet.tab} />
    case 'switcher':
      return <SwitcherSheet mode={sheet.mode} />
    case 'meal':
      return <MealSheet {...sheet} />
    case 'item':
      return <ItemSheet kitchenId={sheet.kitchenId} />
    case 'idea':
      return <IdeaSheet kitchenId={sheet.kitchenId} />
    case 'import':
      return <ImportSheet kitchenId={sheet.kitchenId} />
    case 'invite':
      return <InviteSheet kitchenId={sheet.kitchenId} />
    case 'newKitchen':
      return <NewKitchenSheet />
    case 'join':
      return <JoinSheet />
  }
}

/** The centre + in MyPlate's bottom bar: opens the create sheet for the current tab. */
export function PlateAddButton() {
  const { open, sheet } = usePlate()
  const { pathname } = useLocation()
  return (
    <button
      type="button"
      aria-label="Create"
      aria-haspopup="dialog"
      aria-expanded={sheet?.kind === 'create'}
      onClick={() => open({ kind: 'create', tab: tabFromPath(pathname) })}
      className="gloss flex size-12 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95"
    >
      <Plus size={23} strokeWidth={2.5} />
    </button>
  )
}
