'use strict';

const {
  SelectQuery,
  InsertQuery,
  UpdateQuery,
  buildWhere,
} = require('./query');
const { Pool } = require('pg');

const buildSystemQuery = (type, fields, ...conditions) => {
  const names = fields[0] === '*' ? '*' : `"${fields.join('", "')}"`;

  const args = [];
  const sql = [`SELECT ${names} FROM INFORMATION_SCHEMA.${type}`];

  if (conditions.length !== 0) {
    const cond = buildWhere(conditions, 1, false);
    sql.push('WHERE ' + cond.clause);
    args.push(...cond.args);
  }

  return { sql: sql.join(' '), args };
};

class Database {
  constructor(config) {
    this.pool = new Pool(config);
    this.logger = config.logger;
  }

  query(sql, values) {
    const data = values ? values.join(',') : '';
    this.logger.debug(`${sql}\t[${data}]`);
    return this.pool.query(sql, values);
  }

  insert(table, record) {
    return new InsertQuery(this, table, record);
  }

  select(table, fields = ['*'], ...conditions) {
    if (Array.isArray(fields)) {
      return new SelectQuery(this, table, fields, ...conditions);
    }
    return new SelectQuery(this, table, ['*'], fields, ...conditions);
  }

  async row(table, fields, ...conditions) {
    const rows = await this.select(table, fields, ...conditions);
    if (rows.length < 1) return null;
    return rows[0];
  }

  async scalar(table, field, ...conditions) {
    const row = await this.row(table, [field], ...conditions);
    const values = Object.values(row);
    if (values.length < 1) return undefined;
    return values[0];
  }

  async col(table, field, ...conditions) {
    const column = [];
    const rows = await this.select(table, [field], ...conditions);
    for (const row of rows) column.push(row[field]);
    return column;
  }

  async count(table, ...conditions) {
    const { clause, args } = buildWhere(conditions);
    const sql = [
      `SELECT count(*) FROM "${table}"`,
      clause ? `WHERE ${clause}` : '',
    ];

    const {
      rows: [{ count }],
    } = await this.query(sql.join(' '), args);

    return parseInt(count);
  }

  async dict(table, fields, ...conditions) {
    const [keyField, valField] = fields;
    const obj = Object.create(null);
    const rows = await this.select(table, fields, ...conditions);
    for (const row of rows) obj[row[keyField]] = row[valField];
    return obj;
  }

  delete(table, ...conditions) {
    const { clause, args } = buildWhere(conditions);
    const sql = `DELETE FROM "${table}" WHERE ${clause}`;
    return this.query(sql, args);
  }

  update(table, delta = null, ...conditions) {
    return new UpdateQuery(this, table, delta, ...conditions);
  }

  async upsert(table, record, constraint) {
    const count = await this.count(table, constraint);
    if (count) return this.update(table, record, constraint);
    return this.insert(table, record);
  }

  async fields(table) {
    const { sql, args } = buildSystemQuery('COLUMNS', ['column_name'], {
      'columns.table_name': table,
    });
    const result = await this.query(sql, args);
    return result.rows.map(({ column_name: name }) => name);
  }

  async tables() {
    const { sql, args } = buildSystemQuery('TABLES', ['table_name'], {
      'tables.table_schema': `public`,
    });
    const result = await this.query(sql, args);
    return result.rows.map(({ table_name: name }) => name);
  }

  close() {
    this.pool.end();
  }
}

module.exports = { Database, SelectQuery };
