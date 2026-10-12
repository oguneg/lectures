CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" serial PRIMARY KEY NOT NULL,
	"university_id" text NOT NULL,
	"code" text NOT NULL,
	"title_sv" text,
	"title_en" text,
	"description_sv" text,
	"description_en" text,
	"eligibility_sv" text,
	"eligibility_en" text,
	"credits" real,
	"level" text,
	"url_sv" text,
	"url_en" text,
	"source_edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lecturer" (
	"id" serial PRIMARY KEY NOT NULL,
	"university_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lecturer_rating" (
	"review_id" integer NOT NULL,
	"lecturer_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	CONSTRAINT "lecturer_rating_review_id_lecturer_id_pk" PRIMARY KEY("review_id","lecturer_id"),
	CONSTRAINT "lecturer_rating_range" CHECK ("lecturer_rating"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "occasion" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"semester" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"pace_percent" integer,
	"location" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"distance" boolean DEFAULT false NOT NULL,
	"application_code" text,
	"only_in_programme" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" integer NOT NULL,
	"semester" text NOT NULL,
	"overall" integer NOT NULL,
	"difficulty" integer NOT NULL,
	"workload" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"show_name" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_overall_range" CHECK ("review"."overall" between 1 and 5),
	CONSTRAINT "review_difficulty_range" CHECK ("review"."difficulty" between 1 and 5),
	CONSTRAINT "review_workload_range" CHECK ("review"."workload" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "teaching" (
	"course_id" integer NOT NULL,
	"lecturer_id" integer NOT NULL,
	"semester" text NOT NULL,
	"role" text NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teaching_course_id_lecturer_id_semester_role_pk" PRIMARY KEY("course_id","lecturer_id","semester","role")
);
--> statement-breakpoint
CREATE TABLE "university" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"name_sv" text NOT NULL,
	"name_en" text NOT NULL,
	"url" text,
	CONSTRAINT "university_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturer" ADD CONSTRAINT "lecturer_university_id_university_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."university"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturer_rating" ADD CONSTRAINT "lecturer_rating_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecturer_rating" ADD CONSTRAINT "lecturer_rating_lecturer_id_lecturer_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."lecturer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasion" ADD CONSTRAINT "occasion_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching" ADD CONSTRAINT "teaching_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching" ADD CONSTRAINT "teaching_lecturer_id_lecturer_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."lecturer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_university_code_uidx" ON "course" USING btree ("university_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "lecturer_university_name_uidx" ON "lecturer" USING btree ("university_id","name_key");--> statement-breakpoint
CREATE INDEX "lecturer_rating_lecturer_idx" ON "lecturer_rating" USING btree ("lecturer_id");--> statement-breakpoint
CREATE INDEX "occasion_course_idx" ON "occasion" USING btree ("course_id","semester");--> statement-breakpoint
CREATE UNIQUE INDEX "review_user_course_semester_uidx" ON "review" USING btree ("user_id","course_id","semester");--> statement-breakpoint
CREATE INDEX "review_course_idx" ON "review" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teaching_lecturer_idx" ON "teaching" USING btree ("lecturer_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");