import * as RethinkDBDash from "rethinkdbdash";

export class RethinkConnection {
  public r: RethinkDBDash.Term;

  constructor(db: string, host: string, port: number) {
    this.r = RethinkDBDash({
      db,
      servers: [
        { host, port }
      ]
    });
  }

  registerModel(Model: any) {
    Model.prototype._conn = this;
    
    const tableName = "";
    this.r.tableList().contains(tableName).do((exists) => {
      return this.r.branch(exists, {tables_created: 0}, this.r.tableCreate(tableName));
    });
  }
}
