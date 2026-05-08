export { POSITIONS, POSITION_IDS } from './positions'
export { EVENT_TYPES, EVENT_TYPE_IDS } from './events'
export { CONCEPTS, CONCEPT_IDS } from './concepts'
export type { TaxonomyItem } from './positions'

import { POSITIONS } from './positions'
import { EVENT_TYPES } from './events'
import { CONCEPTS } from './concepts'

export function buildTaxonomyPromptBlock(): string {
  return `## BJJ Taxonomy (use ONLY these identifiers — never invent new ones)

### Positions (position_id values)
${POSITIONS.map((p) => `- ${p.id}: ${p.name}${p.aliases ? ` (also called: ${p.aliases.join(', ')})` : ''}`).join('\n')}

### Event Types (event_type_id values)
${EVENT_TYPES.map((e) => `- ${e.id}: ${e.name}${e.aliases ? ` (also called: ${e.aliases.join(', ')})` : ''}`).join('\n')}

### Concept Tags (concept_tag values)
${CONCEPTS.map((c) => `- ${c.id}: ${c.name}`).join('\n')}
`
}
