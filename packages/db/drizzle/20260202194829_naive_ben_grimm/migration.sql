CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION vector;--> statement-breakpoint
DROP INDEX "issue_title_search_idx";--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "search_text" text;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "issue_title_trgm_idx" ON "issue" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "issue_search_text_trgm_idx" ON "issue" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "issue_search_vector_idx" ON "issue" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "issue_embedding_hnsw_idx" ON "issue" USING hnsw ("embedding" vector_cosine_ops);