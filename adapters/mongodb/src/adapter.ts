import {
    AdapterBase,
    ModelCtor,
    QueryOptions,
    GetOptions,
    AdapterOptions,
    Model,
} from 'pims';
import {
    MongoClientOptions,
    MongoClient,
    FindOneOptions,
    ObjectId,
} from 'mongodb';
import set from 'lodash.set';
import memoize from 'lodash.memoize';

export interface MongoAdapterOptions
    extends MongoClientOptions,
        AdapterOptions {
    url: string;
}

export interface FindOpts extends QueryOptions {
    indexes?: string[];
}

export class MongoAdapter extends AdapterBase {
    private mongo: MongoClient;

    constructor({ models, url, ...opts }: MongoAdapterOptions) {
        super({ models });

        this.mongo = new MongoClient(url, opts);
    }

    public async connect(): Promise<this> {
        await this.mongo.connect();
        return this;
    }

    public async ensure(): Promise<void> {
        if (!this.mongo.isConnected()) {
            await this.connect();
        }

        return super.ensure();
    }

    public all<T>(ctor: ModelCtor<T>, opts?: QueryOptions): Promise<T[]> {
        const modelInfo = Model.getInfo(ctor);
        return this.mongo
            .db(modelInfo.database)
            .collection(modelInfo.table)
            .find({})
            .toArray();
    }

    public async find<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts?: FindOpts,
    ): Promise<T[]> {
        const modelInfo = Model.getInfo(ctor);
        const rows = await this.mongo
            .db(modelInfo.database)
            .collection(modelInfo.table)
            .find(filter, getFindOpts(opts))
            .toArray();
        return rows.map(row => mapToModel(ctor, row));
    }

    public async findOne<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts?: FindOpts,
    ): Promise<T | null> {
        const modelInfo = Model.getInfo(ctor);
        const row = await this.mongo
            .db(modelInfo.database)
            .collection(modelInfo.table)
            .findOne(filter, getFindOpts(opts));
        return mapToModel(ctor, row);
    }

    public get<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: GetOptions = {},
    ): Promise<T[]> {
        const index = opts.index || '_id';
        const filter = getFilterForIndex(ctor, index, value);
        return this.find(ctor, filter, { ...opts, indexes: [index] });
    }

    public getOne<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: GetOptions = {},
    ): Promise<T | null> {
        const index = opts.index || '_id';
        const filter = getFilterForIndex(ctor, index, value);
        return this.findOne(ctor, filter, { ...opts, indexes: [index] });
    }

    protected async ensureTable(ctor: ModelCtor<any>): Promise<void> {
        const modelInfo = Model.getInfo(ctor);
        const db = this.mongo.db(modelInfo.database);
        const collections = await this.listCollections(modelInfo.database);
        if (collections.find(c => c.name === modelInfo.table) == null) {
            await db.createCollection(modelInfo.table);
        }

        for (let indexInfo of modelInfo.indexes) {
            const indexSpec = indexInfo.keys.reduce<Record<string, string>>(
                (spec, key) => ({ ...spec, [key]: 'hashed' }),
                {},
            );
            db.createIndex(modelInfo.table, indexSpec, {
                name: indexInfo.name,
                unique: !!indexInfo.options && indexInfo.options.unique,
            });
        }
    }

    protected async updateStore(
        model: any,
        payload: any,
        replace: boolean,
    ): Promise<void> {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);
        const key = model[modelInfo.primaryKey];
        const collection = this.mongo
            .db(modelInfo.database)
            .collection(modelInfo.table);

        payload = Object.keys(payload).reduce((obj, key) => {
            if (key === modelInfo.primaryKey) {
                return { ...obj, _id: new ObjectId(payload[key]) };
            }

            const columnInfo = modelInfo.columns.find(c => c.key === key);

            if (
                columnInfo &&
                columnInfo.meta.objectId &&
                !(payload[key] instanceof ObjectId)
            ) {
                return { ...obj, [key]: new ObjectId(payload[key]) };
            }

            return { ...obj, [key]: payload[key] };
        }, {});

        if (key == null) {
            const res = await collection.insertOne(payload);
            model[modelInfo.primaryKey] = res.insertedId;
        }
        if (replace) {
            await collection.replaceOne({ _id: new ObjectId(key) }, payload);
        } else {
            await collection.updateOne(
                { _id: new ObjectId(key) },
                { $set: payload },
            );
        }
    }

    protected async deleteFromStore(model: any): Promise<void> {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        await this.mongo
            .db(modelInfo.database)
            .collection(modelInfo.table)
            .deleteOne({ _id: model[modelInfo.primaryKey] });
    }

    private listCollections: (
        dbName: string,
    ) => Promise<{ name: string }[]> = memoize((dbName: string) => {
        return this.mongo
            .db(dbName)
            .listCollections({}, { nameOnly: true })
            .toArray();
    });
}

function getFilterForIndex(
    ctor: ModelCtor<any>,
    index: string,
    value: any,
): object {
    const modelInfo = Model.getInfo(ctor);
    const filter: Record<string, any> = {};

    if (index === '_id' || index === modelInfo.primaryKey) {
        filter['_id'] = new ObjectId(value);
    } else {
        const indexInfo = modelInfo.indexes.find(info => info.name === index)!;
        const values = Array.isArray(value) ? value : [value];
        indexInfo!.keys.forEach((key, i) => {
            const column = modelInfo.columns.find(c => c.key === key)!;
            let value = values[i];
            if (column.meta.objectId) {
                value = new ObjectId(value);
            }
            set(filter, key, value);
        });
    }

    return filter;
}

function getFindOpts(opts?: FindOpts): FindOneOptions {
    // todo(birtles): investigate hints for indexes
    return {};
}

function mapToModel(ctor: ModelCtor<any>, row: any) {
    if (row == null) {
        return null;
    }

    const modelInfo = Model.getInfo(ctor);

    row = Object.keys(row).reduce((obj, key) => {
        if (key === '_id') {
            return { ...obj, [modelInfo.primaryKey]: row._id.toHexString() };
        }

        const columnInfo = modelInfo.columns.find(c => c.key === key);
        if (
            columnInfo &&
            columnInfo.meta.objectId &&
            row[key] instanceof ObjectId
        ) {
            return { ...obj, [key]: row[key].toHexString() };
        }

        return { ...obj, [key]: row[key] };
    }, {});

    const model = Model.construct(ctor, row);
    Model.notify(model, 'afterRetrieve');
    return model;
}
