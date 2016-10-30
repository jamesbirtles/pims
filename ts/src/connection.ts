import * as RethinkDBDash from "rethinkdbdash";
import * as pluralise from "pluralize";
import * as _ from "lodash";

import { Validators } from "../";
import { Model } from "./model";

export class RethinkConnection {
  public r: RethinkDBDash.Term;
  public defaultDatabase: string;
  public models: {
    [key: string]: typeof Model
  } = {};

  // TODO: type
  constructor(opts: any) {
    this.r = (<any>RethinkDBDash)(opts);
  }
  
  setDefaultDatabase(defaultDatabase: string) {
    this.defaultDatabase = defaultDatabase;
  }
  
  getModel(name: string): typeof Model {
    return this.models[name];
  }

  registerModel(TheModel: typeof Model, database: string = this.defaultDatabase): Promise<{tables_created: number}> {
    if (!database) throw new Error("No database specified");
    
    const name = _.camelCase((<any>TheModel).name);
    const table = pluralise(name);
    
    this.models[name] = TheModel;
    
    TheModel.prototype._conn = this;
    TheModel.prototype._db = database;
    TheModel.prototype._schema = Validators.Schema(TheModel.prototype._schemaRaw);
    TheModel.prototype._table = table;
    
    const q: any = this.r.db(database);
    return q.tableList().contains(table).do(exists => {
      return (<any>this.r).branch(exists, {tables_created: 0}, q.tableCreate(table));
    }).run();
  }
}
