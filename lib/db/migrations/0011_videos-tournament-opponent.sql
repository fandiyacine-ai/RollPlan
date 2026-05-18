ALTER TABLE "videos" ADD COLUMN "tournament_opponent_id" uuid REFERENCES "tournament_opponents"("id") ON DELETE SET NULL;
