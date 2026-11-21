/** What a back button calls the screen it returns to. */
const LABELS: [RegExp, string][] = [
  [/^\/money\/home$/, 'Home'],
  [/^\/money\/transactions$/, 'Transactions'],
  [/^\/money\/transactions\/[^/]+$/, 'Transaction'],
  [/^\/money\/expenses\/new$/, 'Add transaction'],
  [/^\/money\/insights$/, 'Insights'],
  [/^\/money\/budgets$/, 'Budgets'],
  [/^\/money\/budgets\/categories\/[^/]+$/, 'Category'],
  [/^\/money\/settings$/, 'Settings'],
  [/^\/money\/settings\/accounts$/, 'Payment Account'],
  [/^\/money\/settings\/categories$/, 'Categories'],
  [/^\/money\/settings\/currency$/, 'Currency'],
  [/^\/money\/accounts\/[^/]+$/, 'Account'],
  [/^\/money\/groups$/, 'Groups'],
  [/^\/money\/groups\/[^/]+$/, 'Group'],
  [/^\/food\/home$/, 'Today'],
  [/^\/food\/diary$/, 'Diary'],
  [/^\/food\/add$/, 'Log Meal'],
  [/^\/food\/insights$/, 'Insights'],
  [/^\/food\/profile$/, 'Profile'],
  [/^\/plate\/today$/, 'Today'],
  [/^\/plate\/plan$/, 'Plan'],
  [/^\/plate\/cravings$/, 'Cravings'],
  [/^\/plate\/cart$/, 'Cart'],
  [/^\/plate\/kitchens$/, 'Kitchens'],
  [/^\/plate\/kitchens\/[^/]+$/, 'Kitchen'],
  [/^\/personal$/, 'Personal'],
  [/^\/personal\/feedback$/, 'Feedback'],
  [/^\/personal\/dashboard$/, 'Owner dashboard'],
]

export function routeLabel(path: string): string {
  const pathname = path.split(/[?#]/)[0]
  return LABELS.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Back'
}
