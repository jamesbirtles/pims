import * as _ from "lodash";
import * as Promise from "bluebird";
import {Term} from "rethinkdbdash";
import {RethinkConnection} from "./connection";
import {SchemaError} from "./validators/schema";

export class Model {
  _prev;
  _schemaRaw;
  _schema: (input: any) => SchemaError;
  _conn: RethinkConnection;
  _pk;
  _table;

  constructor(data: any = {}, isNew = true) {
    if (isNew) {
      this._prev = this.getRaw();
      _.assign(this, data);
    } else {
      _.assign(this, data);
      this._prev = this.getRaw();
    }
  }
  
  public static get<T extends Model>(id: string): Promise<T> {
    return this.prototype.query().get(id).run()
      .then(data => {
        return new this(data, false);
      });
  }

  public query(): Term {
    return this._conn.r.table(this._table);
  }

  public save(): Promise<Model> {
    const changes = this.getChangedKeys();
    if (changes.length === 0) {
      return Promise.resolve(this);
    }
    
    const validation = this.validate();
    if (!validation.valid) {
      return Promise.reject(validation);
    }

    const changed = {};
    for (let i = 0, len = changes.length; i < len; i++) {
      this._prev[changes[i]] = this[changes[i]];
      changed[changes[i]] = this[changes[i]];
    }

    if (this[this._pk] == null) {
      return this.query().insert(changed).run()
        .then(doc => {
          this[this._pk] = doc.generated_keys[0];
          return this;
        })
    }

    return this.query().get(this[this._pk]).update(changed).run().then(() => this);
  }
  
  public validate(): SchemaError {
    return this._schema(this.getRaw());
  }
  
  public getRaw() {
    const raw = {};
    const keys = Object.keys(this._schemaRaw);
    for (let i = 0, len = keys.length; i < len; i++) {
      raw[keys[i]] = this[keys[i]];
    }
    return raw;
  }

  public getChangedKeys() {
    return _.reduce(<any>this._prev, (result, value, key) => {
      if (this._pk === key) return result;
      return _.isEqual(value, this[key]) ? result : result.concat(key);
    }, []);
  }
}

Model.prototype._table = "users";
Model.prototype._pk = "id";