import {
    AdapterBase,
    AdapterOptions,
    Model,
    ModelCtor,
    QueryOptions,
    GetOptions,
} from 'pims';
import { Database } from 'arangojs';
import { ArangoError } from 'arangojs/lib/cjs/error';
import { set } from './utils';

export interface ArangoAdapterOptions extends AdapterOptions {
    username: string;
    password: string;
    host: string;
    port: number;

    // Default database used if the model doesn't specify one
    database?: string;
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
    database: string;
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
    public dbs = new Map<string, Database>();
    private collections: CollectionInfo[] = [];
    private defaultDatabase?: string;

    constructor(opts: ArangoAdapterOptions) {
        super(opts);

        this.defaultDatabase = opts.database;

        for (const model of opts.models) {
            const dbName =
                Model.getInfo(model).database || this.defaultDatabase;
            if (!dbName) {
                throw new Error(
                    `No database specified for model ${
                        model.name
                    } and no default was set.`,
                );
            }

            if (this.dbs.has(dbName)) {
                continue;
            }

            const db = new Database({
                url: `http://${opts.host}:${opts.port}`,
            });
            db.useDatabase(dbName);
            db.useBasicAuth(opts.username, opts.password);
            this.dbs.set(dbName, db);
        }
    }

    public db(name: string): Database {
        if (!name && this.defaultDatabase) {
            name = this.defaultDatabase;
        }

        if (!this.dbs.has(name)) {
            throw new Error(`Unknown database ${name}`);
        }

        return this.dbs.get(name)!;
    }

    public async ensure(): Promise<void> {
        for (const db of this.dbs.values()) {
            const cols: CollectionInfo[] = await db.listCollections(true);
            this.collections.push(
                ...cols.map(col => ({ ...col, database: db.name! })),
            );
        }

        return super.ensure();
    }

    public async all<T>(ctor: ModelCtor<T>, opts?: QueryOptions): Promise<T[]> {
        // todo(birtles): support opts

        const modelInfo = Model.getInfo(ctor);
        const cursor = await this.db(modelInfo.database)
            .collection(modelInfo.table)
            .all();
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
        const cursor = await this.db(modelInfo.database)
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
        const row = await this.db(modelInfo.database)
            .collection(modelInfo.table)
            .firstExample(this.asExample(ctor, filter))
            .catch(err => {
                if (isArangoError(err) && err.errorNum == 404) {
                    return null;
                }

                throw err;
            });
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

        const collection = this.db(modelInfo.database).collection(
            modelInfo.table,
        );
        if (
            this.collections.find(
                c =>
                    (c.database != null && c.database === modelInfo.database) &&
                    c.name === modelInfo.table,
            ) == null
        ) {
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
            const res: CollectionSaveResult = await this.db(modelInfo.database)
                .collection(modelInfo.table)
                .save(payload);

            // Update model with the generated id
            model[modelInfo.primaryKey] = res._key;

            return;
        }

        // Update the document
        delete payload[modelInfo.primaryKey];
        await this.db(modelInfo.database)
            .collection(modelInfo.table)
            .update(key, payload);
    }

    protected async deleteFromStore(model: any): Promise<void> {
        const ctor = <ModelCtor<any>>model.constructor;
        const modelInfo = Model.getInfo(ctor);

        await this.db(modelInfo.database)
            .collection(modelInfo.table)
            .remove(model[modelInfo.primaryKey]);
    }

    private mapToModel(ctor: ModelCtor<any>, row: any): any {
        if (row == null) {
            return null;
        }

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

function isArangoError(err: any): err is ArangoError {
    return err.isArangoError === true;
}
