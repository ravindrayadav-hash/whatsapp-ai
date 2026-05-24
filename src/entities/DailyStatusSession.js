// TypeORM entity for tracking daily status collection sessions.
//
// One row per (group_name, session_date). The UNIQUE constraint on that pair
// is the idempotency guard — if the reminder cron fires twice for the same
// day (e.g. server restart), the second INSERT is rejected and the job skips.
//
// Lifecycle of the `status` column:
//   pending    → initial state (not yet used — row is created with 'collecting')
//   collecting → reminder has been sent; waiting for user replies
//   processing → collection cron picked up the session; aggregation in progress
//   summarized → summary has been sent to the group; final state
//   failed     → any unrecoverable error; error_message column has details

import { EntitySchema } from "typeorm";

export const DailyStatusSession = new EntitySchema({
  name: "DailyStatusSession",
  tableName: "daily_status_sessions",
  columns: {
    id: {
      type: "int",
      primary: true,
      generated: true,
    },
    group_name: {
      type: "varchar",
      length: 150,
      nullable: false,
    },
    session_date: {
      // Date of the session in the configured timezone (YYYY-MM-DD string).
      // Stored as a DATE column so MySQL indexing on it stays efficient.
      type: "date",
      nullable: false,
    },
    status: {
      type: "enum",
      enum: ["pending", "collecting", "processing", "summarized", "failed"],
      default: "pending",
      nullable: false,
    },
    // The time window during which user replies are collected.
    // Populated when the reminder is sent; used by the collection cron to
    // filter the messages table — strictly between these two timestamps.
    collection_start: {
      type: "datetime",
      nullable: false,
    },
    collection_end: {
      type: "datetime",
      nullable: false,
    },
    // Set once the reminder message has been successfully sent to WA.
    reminder_sent_at: {
      type: "datetime",
      nullable: true,
    },
    // The fully formatted summary text that was (or will be) posted back.
    summary_text: {
      type: "text",
      nullable: true,
    },
    // Set once the summary message has been successfully sent to WA.
    summary_sent_at: {
      type: "datetime",
      nullable: true,
    },
    // Counts populated after collection — useful for the REST history endpoint.
    participant_count: {
      type: "int",
      nullable: true,
    },
    message_count: {
      type: "int",
      nullable: true,
    },
    // Non-null when status = 'failed'. Contains the caught error message.
    error_message: {
      type: "text",
      nullable: true,
    },
    createdAt: {
      type: "timestamp",
      createDate: true,
    },
    updatedAt: {
      type: "timestamp",
      updateDate: true,
    },
  },
  indices: [
    {
      // Primary idempotency guard — only one session allowed per group per day.
      name: "UQ_DAILY_STATUS_GROUP_DATE",
      columns: ["group_name", "session_date"],
      unique: true,
    },
    {
      // Fast lookup for the collection cron: find today's 'collecting' session.
      name: "IDX_DAILY_STATUS_GROUP_STATUS",
      columns: ["group_name", "status"],
    },
  ],
});
