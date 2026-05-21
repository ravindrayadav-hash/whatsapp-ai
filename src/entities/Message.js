import { EntitySchema } from "typeorm";

export const Message = new EntitySchema({
  name: "Message",
  tableName: "messages",
  columns: {
    id: {
      type: "bigint",
      primary: true,
      generated: true,
    },
    group_name: {
      type: "varchar",
      length: 150,
      nullable: false,
    },
    sender: {
      type: "varchar",
      length: 100,
      nullable: false,
    },
    message: {
      type: "text",
      nullable: false,
    },
    // Image source — base64 data URL (data:image/jpeg;base64,...) or hosted URL.
    // Null for text-only messages.
    image_url: {
      type: "longtext",
      nullable: true,
    },
    // Categorises what the message contains:
    //   'text'  — plain text, no image
    //   'image' — image only (no caption)
    //   'mixed' — image with caption text
    message_type: {
      type: "varchar",
      length: 10,
      nullable: false,
      default: "text",
    },
    message_time: {
      type: "datetime",
      nullable: false,
    },
    // MD5 hash of message text — used in the unique constraint so that
    // two different messages from the same sender in the same minute
    // are both stored, while exact duplicates are rejected.
    message_hash: {
      type: "varchar",
      length: 32,
      nullable: false,
      default: "",
    },
    createdAt: {
      type: "timestamp",
      createDate: true,
    },
  },
  indices: [
    {
      // Unique per group+sender+minute+content — allows multiple messages
      // in the same minute from the same sender as long as text differs.
      name: "UQ_MESSAGE_GROUP_SENDER_TIME_HASH",
      columns: ["group_name", "sender", "message_time", "message_hash"],
      unique: true,
    },
    {
      name: "IDX_MESSAGE_GROUP_TIME",
      columns: ["group_name", "message_time"],
    },
    {
      name: "IDX_MESSAGE_TIME",
      columns: ["message_time"],
    },
  ],
});
