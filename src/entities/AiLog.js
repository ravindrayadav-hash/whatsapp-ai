import { EntitySchema } from "typeorm";

export const AiLog = new EntitySchema({
  name: "AiLog",
  tableName: "ai_logs",
  columns: {
    id: {
      type: "bigint",
      primary: true,
      generated: true,
    },
    group_name: {
      type: "varchar",
      length: 150,
      nullable: true,
    },
    action_type: {
      type: "varchar",
      length: 50,
      nullable: false,
    },
    messages: {
      type: "json",
      nullable: false,
    },
    response: {
      type: "json",
      nullable: false,
    },
    created_at: {
      type: "timestamp",
      createDate: true,
    },
  },
  indices: [
    {
      name: "IDX_AI_LOG_ACTION_CREATED",
      columns: ["action_type", "created_at"],
    },
    {
      name: "IDX_AI_LOG_GROUP_CREATED",
      columns: ["group_name", "created_at"],
    },
  ],
});
