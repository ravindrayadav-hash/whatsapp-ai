import { EntitySchema } from 'typeorm';

export const ProcessingLog = new EntitySchema({
  name: 'ProcessingLog',
  tableName: 'processing_logs',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: true,
    },
    group_name: {
      type: 'varchar',
      length: 150,
      nullable: false,
      unique: true,
    },
    last_processed_time: {
      type: 'datetime',
      nullable: false,
    },
    updatedAt: {
      type: 'timestamp',
      updateDate: true,
    },
  },
  indices: [
    {
      name: 'IDX_PROCESSING_LOG_GROUP',
      columns: ['group_name'],
      unique: true,
    },
  ],
});
