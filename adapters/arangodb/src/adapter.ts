import {
    AdapterBase,
    AdapterOptions,
    Model,
    ModelCtor,
    QueryOptions,
    GetOptions,
} from 'pims';
import { Database } from 'arangojs';
import { set } from './utils';

export interface ArangoAdapterOptions extends AdapterOptions {
    username: string;
    password: string;
    host: string;
    port: number;
    database: string;
}

enum CollectionStatus {
    NewBorn = 1,
    Unloaded,
    Loaded,
    BeingUnloaded,
    Deleted,
    Loading,
}

enum CollectionType {
    Document = 2,
    Edges,
}

interface CollectionInfo {
    id: string;
    name: string;
    isSystem: boolean;
    status: CollectionStatus;
    type: CollectionType;
}

interface CollectionSaveResult {
    _id: string;
    _key: string;
    _rev: string;
    new?: object;
}

interface CollectionUpdateResult {
    _id: string;
    _key: string;
    _rev: string;
    _oldRev: string;
}

export class ArangoAdapter extends AdapterBase {
    public db: Database;
    private collections: CollectionInfo[];

    constructor(opts: ArangoAdapterOptions) {
        super(opts);

        this.db = new Database({
            url: `http://${opts.username}:${opts.password}@${opts.host}:${
                opts.port
            }`,
        });

        this.db.useDatabase(opts.database);
    }

    public async ensure(): Promise<void> {
        this.collections = await this.db.listCollections(true);
        return super.ensure();
    }

    public async all<T>(ctor: ModelCtor<T>, opts?: QueryOptions): Promise<T[]> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const cursor = await this.db.collection(modelInfo.table).all();
        const rows: any[] = await cursor.all();
        return rows.map(row => this.mapToModel(ctor, row));
    }

    public async find<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts: QueryOptions = {},
    ): Promise<T[]> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const cursor = await this.db
            .collection(modelInfo.table)
            .byExample(this.asExample(ctor, filter));
        const rows: any[] = await cursor.all();
        return rows.map(row => this.mapToModel(ctor, row));
    }

    public async findOne<T>(
        ctor: ModelCtor<T>,
        filter: Partial<T>,
        opts: QueryOptions = {},
    ): Promise<T> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const row = await this.db
            .collection(modelInfo.table)
            .firstExample(this.asExample(ctor, filter));
        return this.mapToModel(ctor, row);
    }

    public get<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: GetOptions = {},
    ): Promise<T[]> {
        const filter = this.getFilterForIndex(
            ctor,
            opts.index || '_key',
            value,
        );

        return this.find(ctor, filter, opts);
    }

    public getOne<T>(
        ctor: ModelCtor<T>,
        value: any,
        opts: GetOptions = {},
    ): Promise<T> {
        const filter = this.getFilterForIndex(
            ctor,
            opts.index || '_key',
            value,
        );

        return this.findOne(ctor, filter, opts);
    }

    protected async ensureTable(ctor: ModelCtor<any>): Promise<void> {
        const modelInfo = Model.getInfo(ctor);

        const collection = this.db.collection(modelInfo.table);
        if (this.collections.find(c => c.name === modelInfo.table) == null) {
            await collection.create({ type: CollectionType.Document });
        }

        await Promise.all(
            modelInfo.indexes.map(index =>
                collection.createHashIndex(index.keys),
            ),
        );
    }

    protected async updateStore(model: any, payload: any) {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);
        const key = model[modelInfo.primaryKey];

        // todo(birtles): Possibly check if we retrieved the document or not.
        if (key == null) {
            // Create the document
            const res: CollectionSaveResult = await this.db
                .collection(modelInfo.table)
                .save(payload);

            // Update model with the generated id
            model[modelInfo.primaryKey] = res._key;

            return;
        }

        // Update the document
        delete payload[modelInfo.primaryKey];
        await this.db.collection(modelInfo.table).update(key, payload);
    }

    protected async deleteFromStore(model: any): Promise<void> {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        await this.db
            .collection(modelInfo.table)
            .remove(model[modelInfo.primaryKey]);
    }

    private mapToModel(ctor: ModelCtor<any>, row: any): any {
        const modelInfo = Model.getInfo(ctor);

        const key = row._key;
        delete row._key;
        delete row._id;
        delete row._rev;

        const model = Model.construct(ctor, {
            ...row,
            [modelInfo.primaryKey]: key,
        });
        Model.notify(model, 'afterRetrieve');
        return model;
    }

    private thisOrKey(ctor: ModelCtor<any>, key: string) {
        const modelInfo = Model.getInfo(ctor);
        if (key === modelInfo.primaryKey) {
            return '_key';
        }

        return key;
    }

    private asExample(ctor: ModelCtor<any>, filter: object): object {
        return Object.keys(filter).reduce(
            (dest, key) => ({
                ...dest,
                [this.thisOrKey(ctor, key)]: (filter as any)[key],
            }),
            {},
        );
    }

    private getFilterForIndex(
        ctor: ModelCtor<any>,
        index: string,
        value: any,
    ): object {
        const modelInfo = Model.getInfo(ctor);
        const filter: object = {};

        if (index === '_key' || index === modelInfo.primaryKey) {
            (filter as any)['_key'] = value;
        } else {
            const indexInfo = modelInfo.indexes.find(
                info => info.name === index,
            );
            const values = Array.isArray(value) ? value : [value];
            indexInfo!.keys.forEach((key, i) => set(filter, key, values[i]));
        }

        return filter;
    }
}
