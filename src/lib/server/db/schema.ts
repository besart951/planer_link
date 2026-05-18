import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey(),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    versionHlc: text('version_hlc').notNull(),
    deviceId: text('device_id').notNull(),
    userId: uuid('user_id'),
    fieldVersionsJson: jsonb('field_versions_json').notNull()
  },
  (table) => ({
    updatedAtIdx: index('employees_updated_at_idx').on(table.updatedAt),
    userIdIdx: index('employees_user_id_idx').on(table.userId)
  })
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey(),
    employeeId: uuid('employee_id'),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    versionHlc: text('version_hlc').notNull(),
    deviceId: text('device_id').notNull(),
    userId: uuid('user_id'),
    fieldVersionsJson: jsonb('field_versions_json').notNull()
  },
  (table) => ({
    employeeIdIdx: index('appointments_employee_id_idx').on(table.employeeId),
    updatedAtIdx: index('appointments_updated_at_idx').on(table.updatedAt),
    userIdIdx: index('appointments_user_id_idx').on(table.userId)
  })
);

export const plannerSettings = pgTable('planner_settings', {
  id: uuid('id').primaryKey(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  versionHlc: text('version_hlc').notNull(),
  deviceId: text('device_id').notNull(),
  userId: uuid('user_id'),
  fieldVersionsJson: jsonb('field_versions_json').notNull()
});

export const syncRecords = pgTable(
  'sync_records',
  {
    entity: text('entity').notNull(),
    id: text('id').notNull(),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    versionHlc: text('version_hlc').notNull(),
    deviceId: text('device_id').notNull(),
    userId: text('user_id'),
    fieldVersionsJson: jsonb('field_versions_json').notNull()
  },
  (table) => ({
    pk: uniqueIndex('sync_records_entity_id_idx').on(table.entity, table.id),
    updatedAtIdx: index('sync_records_updated_at_idx').on(table.updatedAt),
    userIdIdx: index('sync_records_user_id_idx').on(table.userId)
  })
);

export const syncEvents = pgTable(
  'sync_events',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    entity: text('entity').notNull(),
    recordId: text('record_id').notNull(),
    deviceId: text('device_id').notNull(),
    opId: text('op_id').notNull(),
    record: jsonb('record').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    recordIdx: index('sync_events_record_idx').on(table.entity, table.recordId),
    opIdx: index('sync_events_op_idx').on(table.deviceId, table.opId)
  })
);

export const syncOperations = pgTable(
  'sync_operations',
  {
    deviceId: text('device_id').notNull(),
    opId: text('op_id').notNull(),
    status: text('status').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    pk: uniqueIndex('sync_operations_device_op_idx').on(table.deviceId, table.opId)
  })
);

export const syncConflicts = pgTable(
  'sync_conflicts',
  {
    id: text('id').primaryKey(),
    entity: text('entity').notNull(),
    recordId: text('record_id').notNull(),
    fieldName: text('field_name').notNull(),
    localValue: jsonb('local_value'),
    serverValue: jsonb('server_value'),
    chosenValue: jsonb('chosen_value'),
    strategy: text('strategy').notNull(),
    opId: text('op_id').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true })
  },
  (table) => ({
    statusIdx: index('sync_conflicts_status_idx').on(table.status),
    recordIdx: index('sync_conflicts_record_idx').on(table.entity, table.recordId)
  })
);
