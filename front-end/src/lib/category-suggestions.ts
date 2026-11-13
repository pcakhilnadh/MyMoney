/**
 * Keyword hints used to guess a category from what the user typed as the
 * transaction title (e.g. "Lunch with the team" -> "Food & Dining").
 *
 * Suggestions are only a convenience: the category stays a normal dropdown the
 * user can change at any time. Unknown (user-created) categories are matched by
 * their own name, so custom names keep working without any extra setup.
 */
export const CATEGORY_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  'Food & Dining': [
    'food',
    'meal',
    'meals',
    'lunch',
    'dinner',
    'breakfast',
    'brunch',
    'snack',
    'snacks',
    'coffee',
    'tea',
    'juice',
    'restaurant',
    'cafe',
    'canteen',
    'dhaba',
    'pizza',
    'burger',
    'biryani',
    'dessert',
    'ice cream',
    'bakery',
    'swiggy',
    'zomato',
    'takeaway',
    'dining',
    'drinks',
    'kfc',
    'dominos',
    'pizza'
  ],
  Shopping: [
    'shopping',
    'clothes',
    'clothing',
    'shoes',
    'apparel',
    'electronics',
    'gadget',
    'gadgets',
    'mall',
    'myntra',
    'flipkart',
    'amazon',
    'purchase',
    'store',
    'groceries',
    'grocery',
    'zepto',
    'blinkit'
  ],
  'Entertainment & Recreation': [
    'entertainment',
    'movie',
    'movies',
    'cinema',
    'theatre',
    'theater',
    'concert',
    'game',
    'games',
    'gaming',
    'party',
    'club',
    'museum',
    'park',
    'picnic',
    'outing',
    'tickets',
  ],
  Subscriptions: [
    'subscription',
    'subscriptions',
    'membership',
    'netflix',
    'spotify',
    'youtube premium',
    'prime video',
    'hotstar',
    'icloud',
    'google one',
    'saas',
  ],
  'Health & Wellness': [
    'health',
    'doctor',
    'hospital',
    'clinic',
    'medicine',
    'medicines',
    'pharmacy',
    'medical',
    'dentist',
    'dental',
    'gym',
    'fitness',
    'yoga',
    'physio',
    'checkup',
    'therapy',
    'lab test',
  ],
  Transportation: [
    'transport',
    'transportation',
    'cab',
    'taxi',
    'uber',
    'rapido',
    'ola',
    'auto',
    'rickshaw',
    'bus',
    'metro',
    'fuel',
    'petrol',
    'diesel',
    'parking',
    'toll',
    'commute',
    'ride',
    'rides',
  ],
  'Travel & Trips': [
    'travel',
    'trip',
    'trips',
    'flight',
    'flights',
    'airline',
    'air ticket',
    'hotel',
    'hotels',
    'resort',
    'holiday',
    'vacation',
    'tour',
    'visa',
    'passport',
    'airport',
    'train ticket',
    'train',
    'airbnb',
    'homestay',
    'stay',
  ],
  Housing: ['rent', 'housing', 'house', 'home', 'landlord'],
  'Bills & Utilities': [
    'bill',
    'bills',
    'electricity',
    'electric bill',
    'water bill',
    'internet',
    'wifi',
    'broadband',
    'mobile recharge',
    'recharge',
    'dth',
    'utility',
    'utilities',
    'postpaid',
    'prepaid',
    'gas bill',
  ],
  'Repair & Maintenance': [
    'repair',
    'repairs',
    'maintenance',
    'plumber',
    'electrician',
    'carpenter',
    'mechanic',
    'servicing',
    'amc',
  ],
  'Loans & EMIs': [
    'emi',
    'emis',
    'loan',
    'loans',
    'mortgage',
    'installment',
    'instalment',
    'home loan',
    'car loan',
    'personal loan',
    'credit card bill',
    'credit card payment',
  ],
  'Education & Development': [
    'education',
    'school',
    'college',
    'tuition',
    'course',
    'courses',
    'class',
    'classes',
    'books',
    'book',
    'stationery',
    'exam',
    'certification',
    'training',
    'workshop',
    'seminar',
    'udemy',
    'coursera',
  ],
  'Donations & Gifts': [
    'donation',
    'donations',
    'donate',
    'charity',
    'gift',
    'gifts',
    'present',
    'temple',
    'church',
    'mosque',
    'birthday',
  ],
  'Insurance & Financial Charges': [
    'insurance',
    'premium',
    'policy',
    'bank charge',
    'bank charges',
    'penalty',
    'tax',
    'gst',
    'brokerage',
    'commission',
    'financial charges',
  ],
  Miscellaneous: ['misc', 'miscellaneous'],
  Salary: ['salary', 'payday', 'paycheck', 'payroll', 'wages', 'wage', 'stipend', 'bonus'],
  'Investment Income': [
    'investment income',
    'dividend',
    'dividends',
    'capital gains',
    'stock profit',
    'mutual fund',
    'sip',
    'stocks',
  ],
  'Profits & Interests': [
    'profit',
    'profits',
    'interest received',
    'bank interest',
    'fd interest',
    'returns',
  ],
  Gifts: ['gift', 'gifts', 'present', 'birthday money', 'wedding gift'],
  'Refund & Reimbursements': [
    'refund',
    'refunds',
    'reimbursement',
    'reimbursements',
    'cashback',
    'reversal',
    'returned',
  ],
  'Business Income': [
    'business',
    'client payment',
    'invoice',
    'freelance',
    'consulting',
    'consultancy',
    'sales',
    'revenue',
  ],
  'Rental Income': ['rental', 'rent received', 'rent income', 'tenant', 'lease'],
  'Pension & Benefits': ['pension', 'retirement', 'benefits', 'allowance', 'scholarship', 'grant'],
  'Self Transfer': ['self transfer', 'own account', 'move money', 'moving money'],
  'Savings & Investments': [
    'savings',
    'saving',
    'investment',
    'investments',
    'mutual fund',
    'sip',
    'fixed deposit',
    'emergency fund',
  ],
  'Money Lent': ['lent', 'lend', 'loaned'],
  'Money Borrow': ['borrow', 'borrowed', 'borrowing'],
  'Loan Repayment': ['loan repayment', 'repay', 'repayment', 'emi'],
  'Loan Collection': ['loan collection', 'collected', 'recovered', 'repayment received'],
  'Pocket Money': ['pocket money', 'allowance'],
  // `Other` intentionally has no hints: without any signal we prefer no guess.
  Other: [],
}

const MIN_PHRASE_LENGTH = 3
const MIN_NAME_WORD_LENGTH = 4

/** Lowercase, drop punctuation and collapse whitespace so words can be compared. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function containsPhrase(normalizedTitle: string, phrase: string): boolean {
  const needle = normalize(phrase)
  return needle.length > 0 && ` ${normalizedTitle} `.includes(` ${needle} `)
}

/**
 * Score how strongly a category matches the title. Longer matches win, so
 * "mobile recharge" beats a bare "mobile", and ties are broken by the number of
 * matching hints.
 */
function scoreCategory(normalizedTitle: string, name: string): number {
  const normalizedName = normalize(name)
  let longest = 0
  let matches = 0
  const consider = (phrase: string) => {
    const needle = normalize(phrase)
    if (needle.length < MIN_PHRASE_LENGTH || !containsPhrase(normalizedTitle, needle)) return
    longest = Math.max(longest, needle.length)
    matches += 1
  }

  const keywords = CATEGORY_KEYWORDS[name]
  if (keywords) {
    for (const keyword of keywords) consider(keyword)
  } else {
    // User-created category: match its full name, or a meaningful word in it.
    consider(normalizedName)
    for (const word of normalizedName.split(' ')) {
      if (word.length >= MIN_NAME_WORD_LENGTH) consider(word)
    }
  }

  return longest > 0 ? longest * 10 + matches : 0
}

/**
 * Guess a category from the transaction title, restricted to the categories the
 * user can currently pick. Returns `null` when nothing (or the generic "Other")
 * matches, so the form simply stays as it was.
 */
export function suggestCategory(title: string, options: readonly string[]): string | null {
  const normalizedTitle = normalize(title)
  if (!normalizedTitle) return null

  let best: { name: string; score: number } | null = null
  for (const name of options) {
    const score = scoreCategory(normalizedTitle, name)
    if (score === 0) continue
    if (
      !best ||
      score > best.score ||
      (score === best.score && name.localeCompare(best.name) < 0)
    ) {
      best = { name, score }
    }
  }
  return best?.name ?? null
}
