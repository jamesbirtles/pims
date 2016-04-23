import * as RethinkDBDash from "rethinkdbdash";
import {Validators} from "../";
import {Model} from "./model";

export class RethinkConnection {
  public r: RethinkDBDash.Term;

  constructor(db: string, host: string, port: number) {
    this.r = (<any>RethinkDBDash)({
      db,
      servers: [
        { host, port }
      ]
    });
  }

  registerModel(TheModel: typeof Model) {
    TheModel.prototype._conn = this;
    TheModel.prototype._schema = Validators.Schema(TheModel.prototype._schemaRaw);
    
    // const tableName = "";
    // this.r.tableList().contains(tableName).do((exists) => {
    //   return this.r.branch(exists, {tables_created: 0}, this.r.tableCreate(tableName));
    // });
  }
}
