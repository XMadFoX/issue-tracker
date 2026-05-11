CREATE TYPE "public"."attribute_entity" AS ENUM('user', 'workspace', 'team', 'resource');--> statement-breakpoint
CREATE TYPE "public"."policy_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."role_scope_level" AS ENUM('workspace', 'team');--> statement-breakpoint
CREATE TABLE "entity_attributes" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "attribute_entity" NOT NULL,
	"entity_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"team_id" text,
	CONSTRAINT "entity_attributes_polymorphic_check" CHECK (num_nonnulls("entity_attributes"."user_id", "entity_attributes"."workspace_id", "entity_attributes"."team_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "permissions_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"resource_type" text NOT NULL,
	"action" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_catalog_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "policy_constraints" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"scope_level" "role_scope_level" NOT NULL,
	"description" text,
	"predicate_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"assigned_by" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"scope_level" "role_scope_level" NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"effect" "policy_effect" DEFAULT 'allow' NOT NULL,
	"constraint_id" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_membership" RENAME COLUMN "role" TO "role_id";--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attributes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attributes_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attributes_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_constraints" ADD CONSTRAINT "policy_constraints_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_definitions" ADD CONSTRAINT "role_definitions_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_definitions" ADD CONSTRAINT "role_definitions_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_definitions" ADD CONSTRAINT "role_definitions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_catalog_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_constraint_id_policy_constraints_id_fk" FOREIGN KEY ("constraint_id") REFERENCES "public"."policy_constraints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_attributes_type_id_key_idx" ON "entity_attributes" USING btree ("entity_type","entity_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_catalog_resource_action_idx" ON "permissions_catalog" USING btree ("resource_type","action");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_user_role_team_idx" ON "role_assignments" USING btree ("user_id","role_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_workspace_scope_team_name_idx" ON "role_definitions" USING btree ("workspace_id","scope_level","team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_pk" ON "role_permissions" USING btree ("role_id","permission_id","constraint_id");--> statement-breakpoint
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;