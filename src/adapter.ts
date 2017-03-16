import * as rethinkdb from 'rethinkdbdash';
import { Model, ModelCtor, ModelInfo, modelInfoKey } from './model';

export interface RethinkAdapterOptions {
    models: ModelCtor<any>[];
}

export const adapterKey = Symbol('rethink adapter');

export type QueryPredicate<T> = (q: rethinkdb.Term<T>) => rethinkdb.Term<any>;
export interface QueryOptions<T> {
    predicate?: QueryPredicate<T>;
}

export interface GetOptions<T> extends QueryOptions<T> {
    index?: string;
}

export class RethinkAdapter {
    public r = rethinkdb(this.ropts);
    private init: Promise<any>[] = [];

    public static fromModel(model: any): RethinkAdapter {
        return model[adapterKey] || model.contructor[adapterKey];
    }

    constructor(private ropts?: rethinkdb.ImportOptions & RethinkAdapterOptions) {
        ropts.models.forEach(model => {
            model[adapterKey] = this;
            const modelInfo = Model.getInfo(model);
            this.init.push(this.ensureTable(model));
        });
    }

    /**
     * Resolves when tables and indexes are ready.
     */
    public wait(): Promise<void> {
        return Promise.all(this.init).then(() => undefined);
    }

    /**
     * Drain the connection pool, allowing your app to exit.
     */
    public close() {
        this.r.getPoolMaster().drain();
    }

    public all<T>(ctor: ModelCtor<T>, opts?: QueryOptions<T[]>) {
        return this.find(ctor, null, opts);
    }

    public async find<T>(ctor: ModelCtor<T>, filter: Partial<T>, opts: QueryOptions<T[]> = {}): Promise<T[]> {
        const rows = await this.query(
            ctor,
            filter != null && (q => q.filter(filter)),
            opts.predicate,
        );
        return rows.map(row => Model.construct(ctor, row));
    }

    public async findOne<T>(ctor: ModelCtor<T>, filter: Partial<T>, opts: QueryOptions<T[]> = {}): Promise<T> {
        const rows = await this.find(ctor, filter, {...opts, predicate: q => (opts.predicate || (() => q))(q).limit(1)});
        return rows[0];
    }

    public async get<T>(ctor: ModelCtor<T>, value: any, opts: GetOptions<T[]> = {}): Promise<T[]> {
        const rows = await this.query(
            ctor,
            q => q.getAll(value, { index: opts.index || Model.getInfo(ctor).primaryKey }),
            opts.predicate
        );
        return rows.map(row => Model.construct(ctor, row));
    }

    public async getOne<T>(ctor: ModelCtor<T>, value: any, opts: GetOptions<T[]> = {}): Promise<T> {
        const rows = await this.get(ctor, value, {...opts, predicate: q => (opts.predicate || (() => q))(q).limit(1)});
        return rows[0];
    }

    public query<T>(ctor: ModelCtor<T>, ...predicates: QueryPredicate<T[]>[]): Promise<T[]> {
        return predicates.reduce((q, predicate) => (predicate || (() => q))(q), this.getModelQuery(ctor));
    }

    private getModelQuery<T>(ctor: ModelCtor<T>) {
        const modelInfo = Model.getInfo(ctor);
        return this.r.db(modelInfo.database).table<T>(modelInfo.table);
    }

    /**
     * Create the table and indexes if they don't already exist.
     * Doesn't create the database.
     */
    private async ensureTable(ctor: ModelCtor<any>) {
        const modelInfo = Model.getInfo(ctor);

        const tableExists = await this.r.db(modelInfo.database).tableList().contains(modelInfo.table);

        if (!tableExists) {
            await this.r.db(modelInfo.database).tableCreate(modelInfo.table);
        }

        const existingIndexes = await this.getModelQuery(ctor).indexList();
        await Promise.all(
            modelInfo.indexes
                .filter(index => !existingIndexes.includes(index.name))
                .map(index => {
                    let key: any = index.keys.map(key => this.getRowFromPath(key));
                    if (key.length === 1) {
                        key = key[0];
                    }
                    return this.getModelQuery(ctor).indexCreate(index.name, key);
                }),
        );

        await this.getModelQuery(ctor).indexWait();
    }

    private getRowFromPath(path: string) {
        return path.split('.').reduce((row, key) => row(key), this.r.row);
    }
}
