import { EntitySchema } from "typeorm";

export const Summary = new EntitySchema({
  name: "Summary",
  tableName: "summaries",
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
    topic: {
      type: "varchar",
      length: 255,
      nullable: true, // null for legacy rows created before grouped processing
    },
    summary_text: {
      type: "text",
      nullable: false,
    },
    requirements: {
      type: "json",
      nullable: true,
    },
    issues: {
      type: "json",
      nullable: true,
    },
    action_items: {
      type: "json",
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
      name: "IDX_SUMMARY_GROUP_CREATED",
      columns: ["group_name", "createdAt"],
    },
  ],
});
