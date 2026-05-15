type QueuedSelect = unknown[];

class SelectBuilder {
  constructor(private readonly take: () => QueuedSelect) {}

  from() { return this; }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  offset() { return this; }

  then(resolve: (value: QueuedSelect) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.take()).then(resolve, reject);
  }
}

class UpdateBuilder {
  constructor(
    private readonly writes: Array<{ table: unknown; patch: unknown }>,
    private readonly table: unknown,
  ) {}

  set(patch: unknown) {
    this.writes.push({ table: this.table, patch });
    return this;
  }

  where() { return Promise.resolve(); }
}

class DeleteBuilder {
  where() { return Promise.resolve(); }
}

export function createDbMock() {
  const selectQueue: QueuedSelect[] = [];
  const poolExecuteQueue: QueuedSelect[] = [];
  const poolQueryQueue: QueuedSelect[] = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; patch: unknown }> = [];
  const deletes: unknown[] = [];
  const poolExecutions: Array<{ sql: string; values?: unknown[] }> = [];
  const poolQueries: Array<{ sql: string; values?: unknown[] }> = [];

  return {
    db: {
      select() {
        return new SelectBuilder(() => {
          if (!selectQueue.length) throw new Error('Unexpected db.select call');
          return selectQueue.shift()!;
        });
      },
      insert(table: unknown) {
        return {
          values(values: unknown) {
            inserts.push({ table, values });
            return Promise.resolve();
          },
        };
      },
      update(table: unknown) {
        return new UpdateBuilder(updates, table);
      },
      delete(table: unknown) {
        deletes.push(table);
        return new DeleteBuilder();
      },
    },
    pool: {
      execute(sql: string, values?: unknown[]) {
        poolExecutions.push({ sql, values });
        const rows = /^\s*select\b/i.test(sql) ? (poolExecuteQueue.shift() ?? []) : [];
        return Promise.resolve([rows]);
      },
      query(sql: string, values?: unknown[]) {
        poolQueries.push({ sql, values });
        const rows = /^\s*select\b/i.test(sql) ? (poolQueryQueue.shift() ?? []) : [];
        return Promise.resolve([rows]);
      },
    },
    queueSelect(rows: QueuedSelect) {
      selectQueue.push(rows);
    },
    queuePoolExecute(rows: QueuedSelect) {
      poolExecuteQueue.push(rows);
    },
    queuePoolQuery(rows: QueuedSelect) {
      poolQueryQueue.push(rows);
    },
    reset() {
      selectQueue.length = 0;
      poolExecuteQueue.length = 0;
      poolQueryQueue.length = 0;
      inserts.length = 0;
      updates.length = 0;
      deletes.length = 0;
      poolExecutions.length = 0;
      poolQueries.length = 0;
    },
    inserts,
    updates,
    deletes,
    poolExecutions,
    poolQueries,
  };
}
