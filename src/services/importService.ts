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
// An unrecognised unit is not dropped -- it gets glued into the name instead
// ("2 pints tomato" became quantity 2 of "pints tomato"), so this list wants to
// be generous.
const UNITS = [
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs', 'cup', 'cups', 'tbsp', 'tsp',
  'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'clove', 'cloves',
  'can', 'cans', 'tin', 'tins', 'pinch', 'pinches', 'handful', 'handfuls',
  'slice', 'slices', 'sprig', 'sprigs', 'stick', 'sticks', 'piece', 'pieces',
  'whole', 'bunch', 'bunches', 'pint', 'pints', 'quart', 'quarts',
  'gallon', 'gallons', 'litre', 'litres', 'liter', 'liters',
  'dash', 'dashes', 'knob', 'knobs', 'bag', 'bags', 'jar', 'jars',
  'packet', 'packets', 'pack', 'packs', 'head', 'heads', 'stalk', 'stalks',
  'fillet', 'fillets', 'rasher', 'rashers', 'sheet', 'sheets', 'cube', 'cubes',
  'block', 'blocks', 'drop', 'drops', 'strip', 'strips', 'wedge', 'wedges',
]

const VULGAR: Record<string, number> = {
  '½': 0.5, '⅓': 0.333, '⅔': 0.667, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

/** One amount: "1", "1.5", "1/2", "1 1/2", "½", "1½". */
const AMOUNT_SRC = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?`

/**
 * Splits a whole ingredient list that arrived as one line.
 *
 * TikTok hands captions over with their newlines stripped, so a list writes
 * itself out as "2 pints tomato 1 shallot 3 cloves garlic 1/2 cup olive oil".
 * Each fresh amount starts a new ingredient, so that is where this cuts.
 *
 * Only a line that *begins* with an amount and carries at least two of them is
 * a candidate, which keeps ordinary prose ("Bake at 400 for 40 min") and single
 * ingredients out of it. Amounts inside brackets ("1 can (400 g) tomatoes"),
 * ranges ("2 to 3 cloves") and multipliers ("2 x 400 g tins") are not cuts
 * either -- they belong to the amount before them.
 *
 * An item with no amount of its own cannot be told from the previous
 * ingredient's name, so a trailing "Salt Thyme" stays attached. The review
 * screen is there to fix the remainder.
 */
export function splitRunOnIngredients(raw: string): string[] {
  const line = stripHtml(raw).trim()
  if (!line || !new RegExp(`^(?:${AMOUNT_SRC})`).test(line)) return [line]

  const re = new RegExp(AMOUNT_SRC, 'g')
  const cuts: number[] = []
  let depth = 0
  let scanned = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(line))) {
    // Track bracket depth up to this match so bracketed amounts are skipped.
    for (; scanned < m.index; scanned++) {
      const ch = line[scanned]
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    }
    if (depth > 0) continue
    if (m.index === 0) { cuts.push(0); continue }
    if (!/\s/.test(line[m.index - 1])) continue
    // The word before decides whether this amount opens a new ingredient.
    const before = line.slice(0, m.index).trim().split(/\s+/).pop() || ''
    if (/^(to|or|and|x|×|\+|-|–|—)$/i.test(before)) continue
    cuts.push(m.index)
  }

  if (cuts.length < 2) return [line]
  return cuts
    .map((start, i) => line.slice(start, cuts[i + 1] ?? line.length).trim())
    .filter(Boolean)
}

/** A line that is nothing but hashtags — social captions end with a blob. */
export function isHashtagLine(l: string): boolean {
  const toks = l.trim().split(/\s+/)
  return toks.length > 0 && toks.every(t => /^#[\p{L}\p{N}_]+$/u.test(t))
}

/** Strip a trailing "#foo #bar" run tacked onto a content line. */
export function stripTrailingHashtags(l: string): string {
  return l.replace(/(?:\s+#[\p{L}\p{N}_]+)+\s*$/u, '').trim()
}

// Social-caption chatter that is never a recipe title.
const CHATTY = /\b(haha+|lol|omg|everybody|you guys|guys|y'?all|link in bio|follow|check (?:this|it) out|comment|save this|did you know|so good|obsessed|trust me|game ?changer|must try|you have to try)\b/i

/**
 * True if a line is caption blurb rather than a cooking instruction, so it
 * should not be filed as a step. Only used in the heading-less guess path --
 * a headed recipe's own "Instructions" section is trusted as-is.
 *
 * Targets the announcement/marketing lines that sit between the title and the
 * method ("This is the best pasta recipe ever, so easy!"), while leaving real
 * imperative steps alone ("This is the tricky part: fold gently" does not
 * match -- no recipe/best/so-good tell).
 */
function isCaptionChatter(l: string): boolean {
  return CHATTY.test(l)
    || /^(?:this is|here'?s|here is)\b.*\b(?:recipe|dish|the best|so (?:good|easy|creamy|delicious|yummy))\b/i.test(l)
    || /\bbest\b[^.]*\bever\b/i.test(l)
}

// Cooking imperatives that open a step. Deliberately excludes words that are
// also common ingredient nouns (salt, butter, oil, flour, cream…) so a bare
// ingredient isn't mistaken for a step. The trailing \b means a participle
// like "Sliced almonds" won't match `slice` -- only the imperative "Slice …".
const STEP_VERB = /^(?:preheat|heat|cook|bake|roast|grill|fry|saut[eé]|sear|boil|simmer|poach|steam|braise|stir|mix|combine|whisk|beat|fold|blend|knead|add|pour|drizzle|sprinkle|season|taste|drain|strain|rinse|peel|chop|slice|dice|mince|grate|crush|mash|melt|dissolve|reduce|bring|remove|transfer|place|cover|flip|turn|toss|marinate|rub|spread|layer|arrange|assemble|garnish|serve|divide|squeeze|baste|deglaze|skim|whip|sift|grease|brush|repeat|return|reserve|enjoy|cut|cool|chill|let|leave|rest|set|top|scoop|press|wrap|dip)\b/i

/**
 * A short line the length test would drop is still a step if it reads as an
 * instruction -- "Bake for 30 minutes.", "Serve hot." Requires a leading
 * cooking verb *and* a second word, so a one-word ingredient ("Salt") stays
 * out.
 */
function looksLikeStep(line: string): boolean {
  return /\s/.test(line) && STEP_VERB.test(line)
}

/**
 * A leftover short line that reads as an ingredient rather than a step or
 * blurb -- a bare "Salt", "Thyme", "Fresh parsley" with no leading amount.
 * Only reached after step/chatter checks, so it stays conservative: a short
 * noun phrase (≤4 words), no sentence punctuation (a step ends "…smooth."),
 * and not a one-word imperative ("Serve").
 */
function looksLikeBareIngredient(line: string): boolean {
  if (line.length > 35 || /[.!?]$/.test(line) || !/[a-zA-Z]/.test(line)) return false
  const words = line.split(/\s+/)
  if (words.length > 4) return false
  if (words.length === 1 && STEP_VERB.test(line)) return false
  return true
}

const HEADING_RE = /^(ingredients|you.?ll need|what you need|instructions|method|directions|steps|preparation|how to)\b/i

/** True if a line opens with an amount or a bullet, i.e. it is an ingredient. */
function looksLikeIngredientStart(l: string): boolean {
  return new RegExp(`^(?:${AMOUNT_SRC})`).test(l) || /^[•\-*]/.test(l)
}

/**
 * Picks a recipe title out of the top of a caption.
 *
 * A pasted TikTok/Instagram caption opens with chatter ("Did you knowuh….
 * Everybody does recipes like this hahaha") long before it says what the dish
 * is, so line 1 is a poor title. This skips hashtag, heading, ingredient and
 * chatty lines, and prefers a short, title-shaped line -- trimming social
 * scaffolding like a leading "This is " and a trailing "— super easy recipe!".
 * Returns the line's index too, so the caller can keep it out of the steps.
 */
export function pickTitle(lines: string[]): { name: string; index: number } {
  const clean = (l: string) =>
    stripTrailingHashtags(l)
      .replace(/^#+\s*/, '')
      .replace(/^(?:this is|here'?s|recipe:|today'?s recipe:?|how to make)\s+/i, '')
      // Drop a spaced "— super easy recipe" style tag clause (spaced dash only,
      // so hyphenated words like "One-Pan" are safe).
      .replace(/\s+[-–—]\s+.*\brecipe\b.*$/i, '')
      .replace(/:\s+.*\brecipe\b.*$/i, '')
      .replace(/[.!…]+$/, '')
      .trim()

  const cand: { i: number; raw: string }[] = []
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const l = lines[i]
    if (isHashtagLine(l) || HEADING_RE.test(l) || looksLikeIngredientStart(l)) continue
    cand.push({ i, raw: l })
  }

  const title = cand.find(c => {
    const t = clean(c.raw)
    return t && t.length <= 60 && t.split(/\s+/).length <= 8 && !CHATTY.test(c.raw)
  })
  if (title) return { name: clean(title.raw).slice(0, 90) || 'Imported recipe', index: title.i }

  const first = cand[0]
  const name = (first ? clean(first.raw) : (lines[0] || '').replace(/^#+\s*/, '')).slice(0, 90)
  return { name: name || 'Imported recipe', index: first ? first.i : 0 }
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
/**
 * People routinely paste URLs with no scheme -- "www.tiktok.com/..." or
 * "allrecipes.com/recipe/...". new URL() rejects those outright, which is what
 * surfaced as "That doesn't look like a web address" for perfectly good links.
 * Prepend https:// when there's no scheme, then validate.
 */
function toUrl(rawUrl: string): URL {
  const raw = rawUrl.trim()
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new ApiError(400, "That doesn't look like a web address")
  }
  // A bare word ("hello") becomes a technically-valid URL with no dot in the
  // host -- not a real site, so reject it rather than fetching nothing.
  if (!url.hostname.includes('.')) {
    throw new ApiError(400, "That doesn't look like a web address")
  }
  return url
}

export async function importFromUrl(rawUrl: string): Promise<RecipeDraft> {
  const url = toUrl(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, 'Only http and https links can be imported')
  }

  // Social posts keep the recipe in the caption rather than in structured
  // data, so they go through fetchSocialCaption instead of this page reader.
  if (/(^|\.)(tiktok|instagram|facebook)\.com$/.test(url.hostname)) {
    throw new ApiError(400, 'Use "Import from social media" for that link')
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

  // Bot protection answers with whatever it likes: 403 and 401, but also 402
  // and 429. Observed live from this server, allrecipes gives 403 or 402 on
  // different days and seriouseats gives 402 — none of which mean what their
  // names suggest, so they all get the one message a person can act on rather
  // than "returned 402".
  if ([401, 402, 403, 429].includes(res.status)) {
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

export interface SocialCaption {
  caption: string
  imageUrl: string | null
  sourceUrl: string
  author: string | null
}

/**
 * Fetches a TikTok post's caption through its public oEmbed endpoint.
 *
 * Returns the caption rather than a parsed recipe, because oEmbed flattens the
 * caption's line breaks: paragraph breaks survive as runs of spaces, but the
 * single newlines between ingredients come back as ordinary spaces, which no
 * amount of guessing can tell from the gaps between words. Splitting
 * "2 pints tomato 1 shallot 1/2 cup olive oil Salt Thyme" back apart produces
 * junk — "1/" and "2 cup olive oil Salt Thyme" — so the caption goes to the
 * person to lay out, and the parser runs on what they hand back.
 *
 * Instagram and Facebook have no equivalent open endpoint, so only TikTok is
 * here.
 */
export async function fetchSocialCaption(rawUrl: string): Promise<SocialCaption> {
  const url = toUrl(rawUrl)

  if (/(^|\.)instagram\.com$/.test(url.hostname)) {
    throw new ApiError(
      422,
      'Instagram only gives captions to apps it has approved, so its links cannot be read automatically. Copy the caption and use "Import from text".'
    )
  }
  if (/(^|\.)facebook\.com$/.test(url.hostname)) {
    throw new ApiError(
      422,
      'Facebook only gives posts to apps it has approved, so its links cannot be read automatically. Copy the post and use "Import from text".'
    )
  }
  if (!/(^|\.)tiktok\.com$/.test(url.hostname)) {
    throw new ApiError(400, 'Paste a TikTok link, or use "Import from web" for a recipe page')
  }

  let res: Response
  try {
    res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url.toString())}`, {
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw new ApiError(502, "TikTok didn't respond. Try again, or use \"Import from text\".")
  }
  if (!res.ok) {
    throw new ApiError(
      422,
      'TikTok would not share that post — it may be private or removed. Copy the caption and use "Import from text".'
    )
  }

  const data = (await res.json().catch(() => ({}))) as any
  // Only collapse the runs oEmbed left behind, and put a line break where each
  // one was — that is the last of the caption's shape still standing.
  const caption = String(data.title || '')
    .split(/\s{2,}/)
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n')

  if (!caption) {
    throw new ApiError(422, 'That post has no caption to read. Use "Import from text" instead.')
  }

  return {
    caption,
    imageUrl: data.thumbnail_url ? String(data.thumbnail_url) : null,
    sourceUrl: url.toString(),
    author: data.author_name ? String(data.author_name) : null,
  }
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
  // Not just line 1 -- a caption buries the dish name under chatter.
  const { name, index: titleIdx } = pickTitle(lines)

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
    // A headed list can still run on to one line (a pasted TikTok caption).
    ingredientLines = lines.slice(ingStart, ingEnd).filter(l => !isHashtagLine(l)).flatMap(splitRunOnIngredients)
    stepLines = stepHeading === -1 ? [] : lines.slice(stepHeading + 1).filter(l => !isHashtagLine(l))
  } else {
    // No headings: guess from the shape of each line.
    warnings.push('No ingredient/step headings found — check the split below')
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (i === titleIdx) continue        // the title is not also a step
      if (isHashtagLine(line)) continue   // "#recipe #food" is neither
      // A run-on list is long, so the length test below would read it as prose
      // and file the whole ingredient list under steps. Check it first.
      const parts = splitRunOnIngredients(line)
      if (parts.length > 1) {
        ingredientLines.push(...parts)
        continue
      }
      const looksLikeIngredient = line.length < 60 && /^[\d½⅓⅔¼¾⅛•\-*]/.test(line)
      if (looksLikeIngredient) ingredientLines.push(line)
      else if (isCaptionChatter(line)) { /* caption blurb, not a step */ }
      // A verb-led line is a step even when short; otherwise fall back to length.
      else if (looksLikeStep(line) || line.length > 25) stepLines.push(line)
      // A short leftover noun phrase is most likely a bare ingredient.
      else if (looksLikeBareIngredient(line)) ingredientLines.push(line)
    }
  }

  const ingredients = ingredientLines
    .filter(l => !/^(instructions|method|directions|steps)\b/i.test(l) && !isHashtagLine(l))
    .map(parseIngredient)
    .filter(i => i.name)

  const instructions = stepLines
    // Strip "1." / "Step 2)" and bullet markers, plus any trailing hashtags a
    // caption tacked onto the line. Ingredients already lost their bullets in
    // parseIngredient; steps kept theirs, so a bulleted method came through as
    // "- Whisk the mustard…".
    .map(l => stripTrailingHashtags(l).replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, '').replace(/^\s*[-*•–—]\s*/, '').trim())
    .filter(l => l.length > 2 && !isHashtagLine(l))
    .map(text => ({ text }))

  if (!ingredients.length) warnings.push('No ingredients found — add them yourself')
  if (!instructions.length) warnings.push('No steps found — add them yourself')

  return { ...EMPTY, name: name || 'Imported recipe', ingredients, instructions, warnings }
}
