import * as rethinkdb from 'rethinkdbdash';
import { Model, ModelCtor, ModelInfo, modelInfoKey } from './model';
import { Relationship } from './relationships';

export interface RethinkAdapterOptions extends rethinkdb.ImportOptions {
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

export interface JoinOptions {
    predicate?: (row) => void;
}

export class RethinkAdapter {
    public r = rethinkdb(this.ropts);
    private init: Promise<any>[] = [];

    public static fromModel(model: any): RethinkAdapter {
        return model[adapterKey] || model.contructor[adapterKey];
    }

    constructor(private ropts?: RethinkAdapterOptions) {
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
        return rows.map(row => {
            const model = Model.construct(ctor, row)
            Model.notify(model, 'afterRetrieve');
            return model;
        });
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
        return rows.map(row => {
            const model = Model.construct(ctor, row)
            Model.notify(model, 'afterRetrieve');
            return model;
        });
    }

    public async getOne<T>(ctor: ModelCtor<T>, value: any, opts: GetOptions<T[]> = {}): Promise<T> {
        const rows = await this.get(ctor, value, {...opts, predicate: q => (opts.predicate || (() => q))(q).limit(1)});
        return rows[0];
    }

    public query<T>(ctor: ModelCtor<T>, ...predicates: QueryPredicate<T[]>[]): rethinkdb.Term<T[]> {
        return predicates.reduce((q, predicate) => (predicate || (() => q))(q), this.getModelQuery(ctor));
    }

    public async save<M>(model: M): Promise<M> {
        const ctor = <ModelCtor<M>> model.constructor;
        const modelInfo = Model.getInfo(ctor);

        Model.notify(model, 'beforeSave');

        // todo(birtles): Actually figure out what changed.
        const changed = modelInfo.columns
            .filter(col => !col.computed)
            .reduce((doc, col) => ({ ...doc, [col.key]: model[col.modelKey] }), {});

        const doc = await this.getModelQuery(ctor).insert(changed, { conflict: 'update' })

        if (model[modelInfo.primaryKey] == null && doc.generated_keys) {
            model[modelInfo.primaryKey] = doc.generated_keys[0];
        }

        Model.notify(model, 'afterSave');

        return model;
    }

    public async join<M>(model: M, relationshipKey: string, opts: JoinOptions = {}): Promise<M> {
        const ctor = <ModelCtor<M>> model.constructor;
        const modelInfo = Model.getInfo(ctor);

        const relationship = modelInfo.relationships.find(relationship => relationship.key === relationshipKey);
        if (!relationship) {
            throw new Error(`No relationship found for ${relationshipKey}`);
        }

        Model.notify(model, 'beforeJoin', relationship);

        let joinData: any;
        const relationshipModel = relationship.model(model);
        switch (relationship.kind) {
            case Relationship.HasMany:
                joinData = await this.get(relationshipModel, model[modelInfo.primaryKey], { index: relationship.foreignKey });
                if (opts.predicate) {
                    await Promise.all(joinData.map(opts.predicate));
                }
                break;
            case Relationship.BelongsTo:
                joinData = await this.getOne(relationshipModel, model[relationship.foreignKey]);
                if (opts.predicate) {
                    await opts.predicate(joinData);
                }
                break;
            case Relationship.HasOne:
                joinData = await this.getOne(relationshipModel, model[modelInfo.primaryKey], { index: relationship.foreignKey });
                if (opts.predicate) {
                    await opts.predicate(joinData);
                }
                break;
            default:
                throw new Error(`Unhandled relationship type ${relationship.kind}`);
        }

        model[relationship.key] = joinData;

        Model.notify(model, 'afterJoin', relationship);

        return model;
    }

    public async delete<M>(model: M): Promise<void> {
        const ctor = <ModelCtor<M>> model.constructor;
        const modelInfo = Model.getInfo(ctor);

        Model.notify(model, 'beforeDelete');

        if (!model[modelInfo.primaryKey]) {
            throw new Error('Cannot delete model without a populated primary key.');
        }

        await this.getModelQuery(ctor).get(model[modelInfo.primaryKey]).delete();

        Model.notify(model, 'afterDelete');
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
                    let key: any
                    if (Array.isArray(index.keys)) {
                        key = index.keys.map(key => this.getRowFromPath(key));

                        if (key.length === 1) {
                            key = key[0];
                        }
                    } else if (typeof index.keys === 'function') {
                        key = () => (<any> index.keys)(this.r);
                    } else {
                        key = index.keys;
                    }
                    return this.getModelQuery(ctor).indexCreate(index.name, key, index.options);
                }),
        );

        await this.getModelQuery(ctor).indexWait();
    }

    private getRowFromPath(path: string) {
        return path.split('.').reduce((row, key) => row(key), this.r.row);
    }
}
