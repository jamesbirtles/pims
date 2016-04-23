import * as RethinkDBDash from "rethinkdbdash";
import {Validators} from "../";

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

  registerModel(Model: any) {
    Model.prototype._conn = this;
    Model.prototype._schema = Validators.Schema(Model.prototype._schemaRaw);
    
    // const tableName = "";
    // this.r.tableList().contains(tableName).do((exists) => {
    //   return this.r.branch(exists, {tables_created: 0}, this.r.tableCreate(tableName));
    // });
  }
}
