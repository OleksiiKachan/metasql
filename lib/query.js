'use strict';

const OPERATORS = ['>=', '<=', '<>', '>', '<'];

const whereValue = (value) => {
  if (typeof value === 'string') {
    for (const op of OPERATORS) {
      const len = op.length;
      if (value.startsWith(op)) {
        return [op, value.substring(len)];
      }
    }
    if (value.includes('*') || value.includes('?')) {
      const mask = value.replace(/\*/g, '%').replace(/\?/g, '_');
      return ['LIKE', mask];
    }
  }
  return ['=', value];
};

const buildWhere = (conditions, firstArgIndex = 1, withQuotes = true) => {
  const disjunction = [];
  const args = [];
  let i = firstArgIndex;
  for (const where of conditions) {
    const conjunction = [];
    const keys = Object.keys(where);
    for (const key of keys) {
      const [operator, value] = whereValue(where[key]);
      const columnName = withQuotes ? `"${key}"` : key;
      conjunction.push(`${columnName} ${operator} $${i++}`);
      args.push(value);
    }
    disjunction.push(conjunction.join(' AND '));
  }
  return { clause: disjunction.join(' OR '), args };
};

const updates = (delta, firstArgIndex = 1) => {
  const clause = [];
  const args = [];
  let i = firstArgIndex;
  const keys = Object.keys(delta);
  for (const key of keys) {
    const value = delta[key].toString();
    clause.push(`"${key}" = $${i++}`);
    args.push(value);
  }
  return { clause: clause.join(', '), args };
};

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
  }
}

class SelectQuery extends Query {
  constructor(db, table, fields, ...where) {
    super(db, table);
    this.fields = fields;
    this.where = where;
    this.options = {};
  }

  order(field) {
    if (this.options.desc) Reflect.deleteProperty(this.options, 'desc');
    this.options.order = typeof field === 'string' ? [field] : field;
    return this;
  }

  desc(field) {
    if (this.options.order) Reflect.deleteProperty(this.options, 'order');
    this.options.desc = typeof field === 'string' ? [field] : field;
    return this;
  }

  limit(count) {
    this.options.limit = count;
    return this;
  }

  offset(count) {
    this.options.offset = count;
    return this;
  }

  then(resolve, reject) {
    const args = [];
    const { table, fields, where, options } = this;
    const names = fields[0] === '*' ? '*' : `"${fields.join('", "')}"`;
    const sql = [`SELECT ${names} FROM "${table}"`];
    if (where.length !== 0) {
      const cond = buildWhere(where);
      sql.push('WHERE ' + cond.clause);
      args.push(...cond.args);
    }
    const { order, desc, limit, offset } = options;
    if (order) sql.push('ORDER BY "' + order.join('", "') + '"');
    if (desc) sql.push('ORDER BY "' + desc.join('", "') + '" DESC');
    if (limit) sql.push('LIMIT ' + limit);
    if (offset) sql.push('OFFSET ' + offset);
    this.db.query(sql.join(' '), args).then((result) => {
      resolve(result.rows);
    }, reject);
  }

  toObject() {
    return {
      table: this.table,
      fields: [...this.fields],
      where: this.where.map((cond) => ({ ...cond })),
      options: this.options,
    };
  }

  static from(db, metadata) {
    const { table, fields, where, options } = metadata;
    const conditions = where.map((cond) => ({ ...cond }));
    const query = new SelectQuery(db, table, fields, ...conditions);
    Object.assign(query.options, options);
    return query;
  }
}

class UpsertQuery extends Query {
  constructor(db, table) {
    super(db, table);
    this.returningClause = '';
  }

  returning(fields) {
    const returningFields = Array.isArray(fields) ? fields : [fields];
    this.returningClause = returningFields.length
      ? `RETURNING ${returningFields.map((field) => `"${field}"`).join(', ')}`
      : '';
    return this;
  }
}

class InsertQuery extends UpsertQuery {
  constructor(db, table, record) {
    super(db, table);
    this.record = record;
  }

  then(resolve, reject) {
    const { record, table, returningClause } = this;

    const keys = Object.keys(record);
    const nums = new Array(keys.length);
    const data = new Array(keys.length);
    let i = 0;
    for (const key of keys) {
      data[i] = record[key];
      nums[i] = `$${++i}`;
    }
    const fields = '"' + keys.join('", "') + '"';
    const params = nums.join(', ');
    const sql = [
      `INSERT INTO "${table}" (${fields}) VALUES (${params})`,
      returningClause,
    ];

    this.db.query(sql.join(' '), data).then(resolve, reject);
  }
}

class UpdateQuery extends UpsertQuery {
  constructor(db, table, delta, ...conditions) {
    super(db, table);
    this.delta = delta;
    this.conditions = conditions;
  }

  then(resolve, reject) {
    const { delta, table, conditions, returningClause } = this;

    const upd = updates(delta);
    const cond = buildWhere(conditions, upd.args.length + 1);
    const sql = [
      `UPDATE "${table}" SET ${upd.clause} WHERE ${cond.clause}`,
      returningClause,
    ];
    const args = [...upd.args, ...cond.args];

    return this.db.query(sql.join(' '), args).then(resolve, reject);
  }
}

module.exports = { SelectQuery, InsertQuery, UpdateQuery, buildWhere };
