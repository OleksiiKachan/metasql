import { QueryResult } from 'pg';

type ScalarValue = string | number | undefined;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  logger: { db: Function; debug: Function };
}

export class Database {
  constructor(config: DatabaseConfig);
  query(sql: string, values: Array<string | number>): Promise<QueryResult>;
  insert(table: string, record: object): InsertQuery;
  select(
    table: string,
    fields: Array<string>,
    ...conditions: Array<object>
  ): SelectQuery;
  row(
    table: string,
    fields: Array<string>,
    ...conditions: Array<object>
  ): Promise<Array<object>>;
  scalar(
    table: string,
    field: string,
    ...conditions: Array<object>
  ): Promise<ScalarValue>;
  col(
    table: string,
    field: string,
    ...conditions: Array<object>
  ): Promise<Array<ScalarValue>>;
  count(table: string, ...conditions: Array<object>): Promise<number>;
  dict(
    table: string,
    fields: Array<string>,
    ...conditions: Array<object>
  ): Promise<object>;
  delete(table: string, ...conditions: Array<object>): Promise<QueryResult>;
  update(
    table: string,
    delta: object,
    ...conditions: Array<object>
  ): UpdateQuery;
  upsert: (table: string, record: object, constraint: object) => UpsertQuery;
  fields: (table: string) => Promise<Array<string>>;
  tables: () => Promise<Array<string>>;
  close(): void;
}

export class SelectQuery {
  constructor(
    db: Database,
    table: string,
    fields: Array<string>,
    ...where: Array<object>
  );
  order(field: string | Array<string>): SelectQuery;
  desc(field: string | Array<string>): SelectQuery;
  limit(count: number): SelectQuery;
  offset(count: number): SelectQuery;
  then(resolve: (rows: Array<object>) => void, reject: Function): void;
  toObject(): QueryObject;
  static from(db: Database, metadata: QueryObject): SelectQuery;
}

export class UpsertQuery {
  constructor(db: Database, table: string);
  returning(fields: string | Array<string>): UpsertQuery;
}

export class InsertQuery extends UpsertQuery {
  constructor(db: Database, table: string, record: object);
  onConflict(fields: string | Array<string>): {
    doNothing(): InsertQuery;
    doUpdate(exclude?: string | Array<string>): InsertQuery;
  };
  then(resolve: (result: any) => void, reject: Function): void;
}

export class UpdateQuery extends UpsertQuery {
  constructor(
    db: Database,
    table: string,
    delta?: object,
    ...conditions: Array<object>
  );
  then(resolve: (result: any) => void, reject: Function): void;
}

interface QueryObject {
  table: string;
  fields: string | Array<string>;
  where?: Array<object>;
  options?: Array<object>;
}
