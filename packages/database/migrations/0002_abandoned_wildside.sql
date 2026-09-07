CREATE TYPE "public"."eval_target" AS ENUM('retrieval', 'generation');--> statement-breakpoint
CREATE TABLE "dataset_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"label" text,
	"input" jsonb NOT NULL,
	"expected" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"target" "eval_target" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"dataset_case_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"scores" jsonb,
	"latency_ms" integer,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"target" "eval_target" NOT NULL,
	"scorers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"judge_model_id" uuid,
	"judge_rubric" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dataset_id" uuid NOT NULL,
	"eval_config_id" uuid NOT NULL,
	"target" "eval_target" NOT NULL,
	"subject" jsonb NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"aggregate" jsonb,
	"latency_ms" integer,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dataset_cases" ADD CONSTRAINT "dataset_cases_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_dataset_case_id_dataset_cases_id_fk" FOREIGN KEY ("dataset_case_id") REFERENCES "public"."dataset_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_configs" ADD CONSTRAINT "eval_configs_judge_model_id_models_id_fk" FOREIGN KEY ("judge_model_id") REFERENCES "public"."models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_eval_config_id_eval_configs_id_fk" FOREIGN KEY ("eval_config_id") REFERENCES "public"."eval_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_cases_dataset_id_idx" ON "dataset_cases" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "eval_case_results_eval_run_id_idx" ON "eval_case_results" USING btree ("eval_run_id");--> statement-breakpoint
CREATE INDEX "eval_runs_dataset_id_idx" ON "eval_runs" USING btree ("dataset_id");