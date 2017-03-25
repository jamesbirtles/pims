declare module "rethinkdbdash" {
    import { EventEmitter } from 'events';

    namespace RethinkDbDash {
        export type PluckSelector = (string | { [field: string]: (PluckSelector | PluckSelector[]) });

        export interface ImportOptions {
            db?: string;
            user?: string;
            password?: string;
            discovery?: boolean;
            pool?: boolean;
            buffer?: number;
            max?: number;
            timeout?: number;
            pingInterval?: number;
            timeoutError?: number;
            timeoutGb?: number;
            maxExponent?: number;
            silent?: boolean;
            optionalRun?: boolean;
            cursor?: boolean;
            servers?: {
                host: string;
                port: number;
            }[];
        }

        export interface Instance extends Term<void> {
            getPoolMaster(): PoolMaster;
        }

        // TODO: possibly split out to only allow
        // methods where they can actually be used
        export interface Term<U> extends Promise<U> {
            db(name: string): Term<void>;
            table<T>(name: string): Term<T[]>;
            tableList(): Term<string[]>;
            tableCreate(name: string): Term<{ db_created: number }>;

            getAll<T>(value: string, opts?: { index?: string }): Term<T[]>;
            get<T>(id: string): Term<T>;
            limit(limit: number): this;
            indexList(): Term<string[]>;
            indexCreate(name: string, key: Row[], opts?: any): Term<{ created: number }>;
            indexWait(...names: string[]): Term<any>;
            row(name: string): Row;
            forEach(fn: (arg: any) => void): Term<any>;
            map(fn: (arg: any) => any): Term<any>;
            contains(value: any): Term<boolean>;
            filter<T>(query: any): Term<T>;
            insert(doc: Partial<U>, opts: InsertOpts<U>): Term<{
                deleted: number;
                errors: number;
                inserted: number;
                replaced: number;
                skipped: number;
                unchanged: number;
                generated_keys?: string[];
                changes?: ChangeDoc<U>[];
            }>;
            delete(): Term<{
                deleted: number;
                errors: number;
                inserted: number;
                replaced: number;
                skipped: number;
                unchanged: number;
            }>;
            pluck(...fields: PluckSelector[]): Term<U>;
        }

        export interface PoolMaster extends EventEmitter {
            getLength(): number;
            getAvailableLength(): number;
            drain(): void;
            getPools(): Pool[];

            on(event: 'log', fn: (str: string) => void);
            on(event: 'healthy', fn: (healthy: boolean) => void);
        }

        // TODO
        export interface Pool {
        }

        export interface Row {
            (name: string): Row;
        }

        export interface InsertOpts<T> {
            durability?: 'hard' | 'soft';
            returnChanges?: boolean | 'always';
            conflict?: 'error' | 'replace' | 'update' | ((id: string, oldDoc: Partial<T>, newDoc: Partial<T>) => Partial<T>);
        }

        export interface ChangeDoc<T> {
            old_val?: Partial<T>;
            new_val?: Partial<T>;
        }
    }

    function RethinkDbDash(options?: RethinkDbDash.ImportOptions): RethinkDbDash.Instance;

    export = RethinkDbDash;
}
