// Turns a URL or a block of text into a draft recipe for the user to review.
//
// Nothing here writes to the database — the draft is handed back to the client,
// which pre-fills the normal Add Recipe form. A parse is a guess, so a person
// always gets to correct it before it is saved.

import { ApiError } from '../middleware/errorHandler.js'

export interface RecipeDraft {
  name: string
  description: string
  cuisine: string
  mealType: string
  difficulty: string
  prepTime: number
  cookTime: number
  servings: number
  calories: number | null
  imageUrl: string | null
  sourceUrl: string | null
  ingredients: { name: string; quantity: number; unit: string }[]
  instructions: { text: string }[]
  tags: string[]
  /** What the parser could not work out, so the UI can say so plainly. */
  warnings: string[]
}

const EMPTY: Omit<RecipeDraft, 'name'> = {
  description: '',
  cuisine: 'Other',
  mealType: 'dinner',
  difficulty: 'easy',
  prepTime: 0,
  cookTime: 0,
  servings: 2,
  calories: null,
  imageUrl: null,
  sourceUrl: null,
  ingredients: [],
  instructions: [],
  tags: [],
  warnings: [],
}

// ─── schema.org/Recipe ───────────────────────────────────────────────────────

/** Recipe JSON-LD hides in arrays, in @graph, or at the top level. */
function findRecipeNode(node: any): any {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipeNode(n)
      if (found) return found
    }
    return null
  }
  const type = node['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.includes('Recipe')) return node
  if (node['@graph']) return findRecipeNode(node['@graph'])
  return null
}

/** ISO-8601 durations ("PT1H15M") are what schema.org uses for times. */
function parseDuration(value: unknown): number {
  if (typeof value !== 'string') return 0
  const m = value.match(/^P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?)?/)
  if (!m) return 0
  const [, d, h, min] = m
  return Math.round((Number(d || 0) * 1440) + (Number(h || 0) * 60) + Number(min || 0))
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value
  // Numbers are common for recipeYield ("14"), and dropping them silently
  // defaulted every such recipe to 2 servings.
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return firstString(value[0])
  if (value && typeof value === 'object') {
    const o = value as any
    return firstString(o.url ?? o.text ?? o.name ?? '')
  }
  return ''
}

/** Instructions arrive as strings, HowToStep objects, or nested HowToSections. */
function flattenInstructions(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') {
    // Some sites dump the whole method into one string.
    return value
      .split(/\r?\n|(?<=\.)\s{2,}/)
      .map(s => stripHtml(s).trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) return value.flatMap(flattenInstructions)
  const o = value as any
  if (o['@type'] === 'HowToSection' && o.itemListElement) return flattenInstructions(o.itemListElement)
  const text = stripHtml(o.text ?? o.name ?? '')
  return text ? [text.trim()] : []
}

function stripHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseYield(value: unknown): number {
  const s = firstString(value)
  const m = s.match(/\d+/)
  const n = m ? parseInt(m[0], 10) : 0
  return n > 0 && n < 100 ? n : 2
}

/**
 * Splits "2 tbsp olive oil" into its parts.
 *
 * Deliberately forgiving: an unparsed amount is better than a dropped
 * ingredient, so anything unrecognised becomes quantity 1 / unit "" and keeps
 * its full text as the name.
 */
const UNITS = [
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs', 'cup', 'cups', 'tbsp', 'tsp',
  'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'clove', 'cloves',
  'can', 'cans', 'tin', 'tins', 'pinch', 'handful', 'slice', 'slices',
  'sprig', 'sprigs', 'stick', 'sticks', 'piece', 'pieces', 'whole', 'bunch',
]

const VULGAR: Record<string, number> = {
  '½': 0.5, '⅓': 0.333, '⅔': 0.667, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

export function parseIngredient(raw: string): { name: string; quantity: number; unit: string } {
  const line = stripHtml(raw).replace(/^[-*•]\s*/, '').trim()
  if (!line) return { name: '', quantity: 1, unit: '' }

  let rest = line
  let quantity = 0

  // Leading amount: "1", "1.5", "1/2", "1 1/2", "½", "1½"
  const amount = rest.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*/)
  if (amount) {
    quantity = parseAmount(amount[1])
    rest = rest.slice(amount[0].length)
  }

  // Unit directly after the amount.
  let unit = ''
  const unitMatch = rest.match(/^([a-zA-Z]+)\.?\s+/)
  if (unitMatch && UNITS.includes(unitMatch[1].toLowerCase())) {
    unit = unitMatch[1].toLowerCase()
    rest = rest.slice(unitMatch[0].length)
  }

  const name = rest.replace(/^of\s+/i, '').trim() || line
  return { name, quantity: quantity || 1, unit }
}

function parseAmount(s: string): number {
  const vulgar = Object.keys(VULGAR).find(v => s.includes(v))
  if (vulgar) {
    const whole = parseFloat(s.replace(vulgar, '')) || 0
    return Math.round((whole + VULGAR[vulgar]) * 100) / 100
  }
  if (s.includes('/')) {
    const [a, b] = s.split(/\s+/)
    if (b) {
      const [n, d] = b.split('/').map(Number)
      return Math.round((Number(a) + n / d) * 100) / 100
    }
    const [n, d] = s.split('/').map(Number)
    return Math.round((n / d) * 100) / 100
  }
  return parseFloat(s) || 0
}

// ─── URL import ──────────────────────────────────────────────────────────────

/**
 * Fetches a page and reads its schema.org/Recipe block.
 *
 * Many large recipe sites sit behind bot protection that refuses datacenter
 * IPs outright, so this fails on a fair share of them no matter how the request
 * is dressed up. The error says which, rather than pretending the page had no
 * recipe on it.
 */
export async function importFromUrl(rawUrl: string): Promise<RecipeDraft> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new ApiError(400, "That doesn't look like a web address")
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, 'Only http and https links can be imported')
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      redirect: 'follow',
      headers: {
        // Ask like a browser. It is not a disguise -- sites that fingerprint
        // TLS will still refuse, and that is reported honestly below.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new ApiError(502, "That site didn't respond. Try again, or paste the recipe as text.")
  }

  if (res.status === 403 || res.status === 401) {
    throw new ApiError(
      422,
      `${url.hostname} blocks automated readers. Copy the recipe text and use "Import from text" instead.`
    )
  }
  if (!res.ok) {
    throw new ApiError(422, `${url.hostname} returned ${res.status}. Try pasting the recipe as text.`)
  }

  const html = await res.text()
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]

  let node: any = null
  for (const [, body] of blocks) {
    try {
      node = findRecipeNode(JSON.parse(body))
      if (node) break
    } catch {
      // A malformed block on the page is not our problem; keep looking.
    }
  }

  if (!node) {
    throw new ApiError(
      422,
      `No recipe data found on ${url.hostname}. Copy the recipe text and use "Import from text".`
    )
  }

  return draftFromSchema(node, url.toString())
}

function draftFromSchema(node: any, sourceUrl: string): RecipeDraft {
  const warnings: string[] = []

  const ingredients = (node.recipeIngredient || node.ingredients || [])
    .map((i: unknown) => parseIngredient(String(i)))
    .filter((i: any) => i.name)

  const instructions = flattenInstructions(node.recipeInstructions).map(text => ({ text }))

  if (!ingredients.length) warnings.push('No ingredients found — add them yourself')
  if (!instructions.length) warnings.push('No steps found — add them yourself')

  const prepTime = parseDuration(node.prepTime)
  const cookTime = parseDuration(node.cookTime)
  const total = parseDuration(node.totalTime)
  if (!prepTime && !cookTime && !total) warnings.push('No timings given')

  const calRaw = firstString(node.nutrition?.calories).match(/\d+/)

  return {
    ...EMPTY,
    name: stripHtml(node.name) || 'Imported recipe',
    description: stripHtml(node.description).slice(0, 300),
    cuisine: matchCuisine(firstString(node.recipeCuisine)),
    mealType: matchMealType(firstString(node.recipeCategory)),
    // Total time is the only figure some sites publish; it belongs in cook.
    prepTime,
    cookTime: cookTime || (total && !prepTime ? total : Math.max(0, total - prepTime)),
    servings: parseYield(node.recipeYield),
    calories: calRaw ? Number(calRaw[0]) : null,
    imageUrl: firstString(node.image) || null,
    sourceUrl,
    ingredients,
    instructions,
    tags: (Array.isArray(node.keywords) ? node.keywords : String(node.keywords || '').split(','))
      .map((k: string) => stripHtml(k).toLowerCase().trim())
      .filter((k: string) => k && k.length < 24)
      .slice(0, 6),
    warnings,
  }
}

const CUISINES = ['Italian', 'Mexican', 'Asian', 'Indian', 'Mediterranean', 'American', 'French', 'Middle Eastern', 'Other']
function matchCuisine(raw: string): string {
  const s = stripHtml(raw).toLowerCase()
  return CUISINES.find(c => s.includes(c.toLowerCase())) || 'Other'
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
function matchMealType(raw: string): string {
  const s = stripHtml(raw).toLowerCase()
  return MEALS.find(m => s.includes(m)) || 'dinner'
}

// ─── Text import ─────────────────────────────────────────────────────────────

/**
 * Reads a pasted (or OCR'd) recipe.
 *
 * Free text has no structure to lean on, so this splits on the headings people
 * actually write, and falls back to a shape heuristic: short lines that start
 * with a number are ingredients, long prose lines are steps.
 */
export function importFromText(raw: string): RecipeDraft {
  const text = String(raw || '').replace(/\r/g, '')
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) throw new ApiError(400, "That's too short to read as a recipe")

  const warnings: string[] = []
  const name = lines[0].replace(/^#+\s*/, '').slice(0, 90)

  const ingHeading = lines.findIndex(l => /^(ingredients|you.?ll need|what you need)\b/i.test(l))
  const stepHeading = lines.findIndex(l =>
    /^(instructions|method|directions|steps|preparation|how to)\b/i.test(l)
  )

  let ingredientLines: string[] = []
  let stepLines: string[] = []

  if (ingHeading !== -1 || stepHeading !== -1) {
    // Headed layout: trust the author's own sections.
    const ingStart = ingHeading === -1 ? 1 : ingHeading + 1
    const ingEnd = stepHeading > ingStart ? stepHeading : lines.length
    ingredientLines = lines.slice(ingStart, ingEnd)
    stepLines = stepHeading === -1 ? [] : lines.slice(stepHeading + 1)
  } else {
    // No headings: guess from the shape of each line.
    warnings.push('No ingredient/step headings found — check the split below')
    for (const line of lines.slice(1)) {
      const looksLikeIngredient = line.length < 60 && /^[\d½⅓⅔¼¾⅛•\-*]/.test(line)
      if (looksLikeIngredient) ingredientLines.push(line)
      else if (line.length > 25) stepLines.push(line)
    }
  }

  const ingredients = ingredientLines
    .filter(l => !/^(instructions|method|directions|steps)\b/i.test(l))
    .map(parseIngredient)
    .filter(i => i.name)

  const instructions = stepLines
    .map(l => l.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, '').trim())
    .filter(l => l.length > 2)
    .map(text => ({ text }))

  if (!ingredients.length) warnings.push('No ingredients found — add them yourself')
  if (!instructions.length) warnings.push('No steps found — add them yourself')

  return { ...EMPTY, name: name || 'Imported recipe', ingredients, instructions, warnings }
}
