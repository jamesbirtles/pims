import * as _ from "lodash";
import * as Promise from "bluebird";
import {RethinkConnection} from "./connection";

export class Model {
  private _prev = {};
  private _schema;
  private _conn: RethinkConnection;
  private _pk = "id";

  constructor() {
    const keys = Object.keys(this._schema);
    for (let i = 0, len = keys.length; i < len; i++) {
      this._prev[keys[i]] = this[keys[i]];
    }
  }

  public save(): Promise<Model> {
    const changes = this.getChangedKeys();
    if (changes.length === 0) {
      return Promise.resolve(this);
    }

    const changed = {};
    for (let i = 0, len = changes.length; i < len; i++) {
      this._prev[changes[i]] = this[changes[i]];
      changed[changes[i]] = this[changes[i]];
    }

    let q = this._conn.r.table("urls");
    if (this[this._pk] == null) {
      return q.insert(changed).run()
        .then(doc => {
          this[this._pk] = doc.generated_keys[0];
          return this;
        })
    }

    return q.get(this[this._pk]).update(changed).run().then(() => this);
  }

  public getChangedKeys() {
    return _.reduce(<any>this._prev, (result, value, key) => {
      if (this._pk === key) return result;
      return _.isEqual(value, this[key]) ? result : result.concat(key);
    }, []);
  }
}
