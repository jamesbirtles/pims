import * as RethinkDBDash from "rethinkdbdash";
import * as pluralise from "pluralize";
import {Validators} from "../";
import {Model} from "./model";

export class RethinkConnection {
  public r: RethinkDBDash.Term;

  constructor(db: string, host: string, port: number, authKey?: string) {
    this.r = (<any>RethinkDBDash)({
      db,
      servers: [
        { host, port, authKey }
      ]
    });
  }

  registerModel(TheModel: typeof Model): Promise<{tables_created: number}> {
    const name = (<any>TheModel).name.toLowerCase();
    const table = pluralise(name);
    
    TheModel.prototype._conn = this;
    TheModel.prototype._schema = Validators.Schema(TheModel.prototype._schemaRaw);
    TheModel.prototype._table = table;
    
    return (<any>this.r).tableList().contains(table).do(exists => {
      return (<any>this.r).branch(exists, {tables_created: 0}, (<any>this.r).tableCreate(table));
    }).run();
  }
}
