import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const techniqueVariants = pgTable('technique_variants', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Taxonomy references
  eventId: text('event_id').notNull(),       // 'armbar' | 'triangle' | 'kimura' etc.
  positionId: text('position_id'),            // 'mount' | 'closed_guard' | null = general

  // Human-readable identity
  name: text('name').notNull(),               // 'Armbar from Mount'
  format: text('format').notNull().default('both'), // 'gi' | 'no_gi' | 'both'

  // Knowledge content
  visualCues: text('visual_cues').notNull(),  // what Gemini should look for (from narration + vision)
  counters: text('counters'),                 // what to do when receiving — for gameplans + chat

  // Reference image (stored in R2, sent to Gemini as visual anchor)
  referenceImageUrl: text('reference_image_url'),

  // Provenance
  sourceUrl: text('source_url'),             // YouTube URL of the instructional
  sourceLabel: text('source_label'),          // 'Gordon Ryan armbar series', etc.
  extractedByModel: text('extracted_by_model'), // which model extracted the visual cues

  // Workflow
  status: text('status').notNull().default('draft'), // 'draft' | 'active' | 'rejected'
  adminNotes: text('admin_notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
