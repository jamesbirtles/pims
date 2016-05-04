import * as RethinkDBDash from "rethinkdbdash";
import * as pluralise from "pluralize";
import {Validators} from "../";
import {Model} from "./model";

export class RethinkConnection {
  public r: RethinkDBDash.Term;
  public models: {
    [key: string]: typeof Model
  }

  constructor(db: string, host: string, port: number, authKey?: string) {
    this.r = (<any>RethinkDBDash)({
      db,
      servers: [
        { host, port, authKey }
      ]
    });
  }

  registerModel(TheModel: typeof Model) {
    const name = (<any>TheModel).name.toLowerCase();
    this.models[name] = TheModel;
    
    TheModel.prototype._conn = this;
    TheModel.prototype._schema = Validators.Schema(TheModel.prototype._schemaRaw);
    TheModel.prototype._table = pluralise(name);
    
    // const tableName = "";
    // this.r.tableList().contains(tableName).do((exists) => {
    //   return this.r.branch(exists, {tables_created: 0}, this.r.tableCreate(tableName));
    // });
  }
}
