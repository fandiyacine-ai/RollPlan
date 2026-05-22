import { z } from 'zod'

export const TechniqueExtractionOutputSchema = z.object({
  name: z.string().describe('Short label, e.g. "Armbar from Mount"'),
  event_id: z.string().describe('Technique taxonomy ID, e.g. "armbar"'),
  position_id: z.string().nullable().describe('FROM position ID, e.g. "mount". Null if general.'),
  format: z.enum(['gi', 'no_gi', 'both']).describe('Applicable format'),
  visual_cues: z.string().describe(
    'Detailed description of what this technique looks like on video — body positions, grip details, key visual moments. Written so an AI model can recognise it when watching match footage. 150–300 words.'
  ),
  counters: z.string().nullable().describe(
    'What the defending athlete should do to counter or escape this technique. 50–150 words. Null if not covered in the source material.'
  ),
  key_moment_seconds: z.number().nullable().describe(
    'Timestamp in seconds of the clearest demonstration of the setup/execution in the source video. Null if not determinable.'
  ),
  source_quality: z.enum(['high', 'medium', 'low']).describe(
    'How clear and instructional the source video is: high = clear angles + narration, medium = partial, low = poor angle or no narration'
  ),
  extraction_notes: z.string().optional().describe(
    'Any caveats about the extraction — e.g. "gi grip details may differ for no-gi", "only partial demonstration visible"'
  ),
})
