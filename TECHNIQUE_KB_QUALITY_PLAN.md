# Technique KB Quality Plan

## What has been completed

- Technique ingest now captures YouTube transcripts when available.
- Technique variants persist `transcript`, `searchText`, `sourceCategory`, and `embedding`.
- The KB agent can tag queued videos as `instructional` or `analysis` and request transcript ingestion.
- The extraction retrieval flow now prefers semantic search via embeddings, with keyword fallback.

## Concrete implementation steps

1. Instrument KB ingestion and retrieval
   - Add migration to persist new fields: `transcript`, `searchText`, `sourceCategory`, `embedding`.
   - Ensure `jobs/ingest-technique.ts` stores embeddings and source category.
   - Capture `sourceCategory` in `jobs/technique-kb-agent.ts` and queue videos accordingly.
   - Add retrieval logging in `lib/ai/technique-retrieval.ts` to capture which variants were selected and why.

2. Upgrade retrieval logic
   - Use semantic retrieval for first-pass extraction in `getTechniqueVariantsForExtraction()`.
   - Add format-aware retrieval for `gi` / `no_gi` and position-aware retrieval for `getTechniqueVariantsForPositions()`.
   - Keep a fallback path that returns active general + specific variants when embeddings are unavailable.

3. Expand KB diversity with analysis videos
   - Surface narrated match-analysis channels in the KB agent search results.
   - Treat `analysis` sources as additional context, not replacements for technique instructionals.
   - Preserve transcripts from analysis videos to improve search and retrieval quality.

4. Monitor and validate
   - Log retrieval signals: query, top-k variant IDs, similarity scores, and source categories.
   - Add admin or investigation queries to inspect whether analysis videos are contributing signal.
   - Track ingestion success rate and auto-approval outcomes.

## A/B test plan for KB quality

### Goal
Measure whether the new transcript/enriched KB retrieval path improves match analysis quality vs the current baseline.

### Experiment variants

- **Control**: Existing technique KB injection flow with general + position-specific variant fetch.
- **Treatment**: Enriched KB retrieval using transcript/embedding-driven semantic search plus analysis-sourced variants.

### Split

- Randomly split match analysis jobs by job ID or user session.
- Prefer a user-level experiment if match-level randomisation adds noise.
- Tag each analysis run with `kb_experiment: control` or `kb_experiment: treatment`.

### Metrics

1. **Technique detection coverage**
   - Number of extracted technique events per match.
   - Compare to expected coverage from a hand-labelled sample set.

2. **Analysis accuracy**
   - Precision of extracted events vs ground-truth labels.
   - False positive rate in the match summary and timeline.

3. **Completeness / insight relevance**
   - Fraction of matches with a complete set of major events detected.
   - Rate of user corrections or manual edits after analysis.

4. **Model cost and latency**
   - AI token usage and job duration for each analysis run.
   - Ensure treatment does not materially raise costs without benefit.

### Success criteria

- Treatment increases event recall by at least 10% on the sample set.
- Treatment maintains or improves precision by 0–5%.
- Treatment shows equal or better downstream insight relevance.
- Treatment cost uplift stays below 15%.

### Implementation details

- Add an experiment tag to `aiCallLogs` or a dedicated `analysis_experiments` table.
- Store retrieval metadata for each analysis request in a lightweight log.
- Run the experiment for a fixed window (e.g. 2–4 weeks or 50–100 matches).
- Evaluate on a labelled validation set first, then compare live outcomes.

### Next validation step

- If the treatment wins, roll out enriched KB retrieval and deprecate the old fallback path.
- If results are mixed, iterate on query construction, embedding quality, or transcript weighting.
- If the treatment loses, preserve the current control path and use the data to refine KB curation.
