import * as rethinkdb from 'rethinkdbdash';

import { Model, ModelCtor, ModelInfo, modelInfoKey } from '../model';
import { Relationship } from '../relationships';
import { AdapterBase, AdapterOptions } from './base';

export interface RethinkAdapterOptions
    extends rethinkdb.ImportOptions,
        AdapterOptions {}

export type RethinkQueryPredicate<T> = (
    q: rethinkdb.Term<T>,
) => rethinkdb.Term<any>;
export interface RethinkQueryOptions<T> {
    predicate?: RethinkQueryPredicate<T>;
}

export interface RethinkGetOptions<T> extends RethinkQueryOptions<T> {
    index?: string;
}

export class RethinkAdapter extends AdapterBase {
    public r: rethinkdb.Instance;

    constructor(ropts: RethinkAdapterOptions) {
        super(ropts);

        this.r = rethinkdb(ropts);
    }

    /**
     * Drain the connection pool, allowing your app to exit.
     */
    public close() {
        this.r.getPoolMaster().drain();
    }

    public all<T>(ctor: ModelCtor<T>, opts?: RethinkQueryOptions<T[]>) {
        return this.find(ctor, null, opts);
    }

    public async find<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts: RethinkQueryOptions<T[]> = {},
    ): Promise<T[]> {
        const rows = await this.query(
            ctor,
            filter != null && (q => q.filter(filter)),
            opts.predicate,
        );
        return rows.map(row => {
            const model = Model.construct(ctor, row);
            Model.notify(model, 'afterRetrieve');
            return model;
        });
    }

    public async findOne<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts: RethinkQueryOptions<T[]> = {},
    ): Promise<T> {
        const rows = await this.find(ctor, filter, {
            ...opts,
            predicate: q => (opts.predicate || (() => q))(q).limit(1),
        });
        return rows[0];
    }

    public async get<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: RethinkGetOptions<T[]> = {},
    ): Promise<T[]> {
        const rows = await this.query(
            ctor,
            q =>
                q.getAll(value, {
                    index: opts.index || Model.getInfo(ctor).primaryKey,
                }),
            opts.predicate,
        );
        return rows.map(row => {
            const model = Model.construct(ctor, row);
            Model.notify(model, 'afterRetrieve');
            return model;
        });
    }

    public async getOne<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: RethinkGetOptions<T[]> = {},
    ): Promise<T> {
        const rows = await this.get(ctor, value, {
            ...opts,
            predicate: q => (opts.predicate || (() => q))(q).limit(1),
        });
        return rows[0];
    }

    public query<T>(
        ctor: ModelCtor<T>,
        ...predicates: RethinkQueryPredicate<T[]>[]
    ): rethinkdb.Term<T[]> {
        return predicates.reduce(
            (q, predicate) => (predicate || (() => q))(q),
            this.getModelQuery(ctor),
        );
    }

    public changes<T>(ctor: ModelCtor<T>, opts: rethinkdb.ChangeOpts = {}) {
        return this.getModelQuery(ctor).changes<T>(opts);
    }

    private getModelQuery<T>(ctor: ModelCtor<T>) {
        const modelInfo = Model.getInfo(ctor);
        return this.r.db(modelInfo.database).table<T>(modelInfo.table);
    }

    private getRowFromPath(path: string) {
        return path.split('.').reduce((row, key) => row(key), this.r.row);
    }

    /**
     * Create the table and indexes if they don't already exist.
     * Doesn't create the database.
     */
    protected async ensureTable(ctor: ModelCtor<any>) {
        const modelInfo = Model.getInfo(ctor);

        const tableExists = await this.r
            .db(modelInfo.database)
            .tableList()
            .contains(modelInfo.table);

        if (!tableExists) {
            await this.r.db(modelInfo.database).tableCreate(modelInfo.table);
        }

        const existingIndexes = await this.getModelQuery(ctor).indexList();
        await Promise.all(
            modelInfo.indexes
                .filter(index => !existingIndexes.includes(index.name))
                .map(index => {
                    let key: any;
                    if (Array.isArray(index.keys)) {
                        key = index.keys.map(key => this.getRowFromPath(key));

                        if (key.length === 1) {
                            key = key[0];
                        }
                    } else if (typeof index.keys === 'function') {
                        key = () => (<any>index.keys)(this.r);
                    } else {
                        key = index.keys;
                    }
                    return this.getModelQuery(ctor).indexCreate(
                        index.name,
                        key,
                        index.options,
                    );
                }),
        );

        await this.getModelQuery(ctor).indexWait();
    }

    protected async updateStore(model: any, payload: any) {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        const doc = await this.getModelQuery(ctor).insert(payload, {
            conflict: 'update',
        });

        if (model[modelInfo.primaryKey] == null && doc.generated_keys) {
            model[modelInfo.primaryKey] = doc.generated_keys[0];
        }
    }

    protected async deleteFromStore(model: any): Promise<void> {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        await this.getModelQuery(ctor)
            .get(model[modelInfo.primaryKey])
            .delete();
    }
}
