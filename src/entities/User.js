import { EntitySchema } from 'typeorm';

export const User = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: true,
    },
    username: {
      type: 'varchar',
      length: 100,
      unique: true,
      nullable: false,
    },
    email: {
      type: 'varchar',
      length: 150,
      unique: true,
      nullable: false,
    },
    password: {
      type: 'varchar',
      length: 255,
      nullable: false,
    },
    // Legacy field kept nullable so existing rows aren't broken
    name: {
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    phone: {
      type: 'varchar',
      length: 20,
      unique: true,
      nullable: true,
    },
    createdAt: {
      type: 'timestamp',
      createDate: true,
    },
    updatedAt: {
      type: 'timestamp',
      updateDate: true,
    },
  },
});
