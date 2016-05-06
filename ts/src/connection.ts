import * as RethinkDBDash from "rethinkdbdash";
import * as pluralise from "pluralize";
import * as _ from "lodash";
import {Validators} from "../";
import {Model} from "./model";

export class RethinkConnection {
  public r: RethinkDBDash.Term;
  public models: {
    [key: string]: typeof Model
  } = {};

  constructor(db: string, host: string, port: number, authKey?: string) {
    this.r = (<any>RethinkDBDash)({
      db,
      servers: [
        { host, port, authKey }
      ]
    });
  }
  
  getModel(name: string): typeof Model {
    return this.models[name];
  }

  registerModel(TheModel: typeof Model): Promise<{tables_created: number}> {
    const name = _.camelCase((<any>TheModel).name);
    const table = pluralise(name);
    
    this.models[name] = TheModel;
    
    TheModel.prototype._conn = this;
    TheModel.prototype._schema = Validators.Schema(TheModel.prototype._schemaRaw);
    TheModel.prototype._table = table;
    
    return (<any>this.r).tableList().contains(table).do(exists => {
      return (<any>this.r).branch(exists, {tables_created: 0}, (<any>this.r).tableCreate(table));
    }).run();
  }
}
