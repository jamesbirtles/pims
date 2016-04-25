import * as _ from "lodash";
import * as Promise from "bluebird";
import {Term} from "rethinkdbdash";
import {RethinkConnection} from "./connection";
import {SchemaError} from "./validators/schema";

export class Model {
  _prev;
  _computedFields;
  _schemaRaw;
  _schema: (input: any) => SchemaError;
  _conn: RethinkConnection;
  _pk: string;
  _table: string;

  constructor(data: any = {}, isNew = true) {
    this._defineProperties();
    if (isNew) {
      this._prev = this.getRaw();
      _.assign(this, data);
    } else {
      _.assign(this, data);
      this._prev = this.getRaw();
    }
  }
  
  public static get<T extends Model>(id: string, index?: string): Promise<T> {
    let q: any = this.prototype.query();
    if (index) {
      q = q.getAll(id, {index: index}).run().then(data => data[0]);
    } else {
      q = q.get(id).run();
    }
    
    return q.then(data => data ? new this(data, false) : null);
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
  
  private _defineProperties() {
    let computedKeys = Object.keys(this._computedFields);
    for (let i = 0, len = computedKeys.length; i < len; i++) {
      let key = computedKeys[i];
      this._defineComputedField(key, this._computedFields[key])
    }

    this._defineProperty("_prev", null);
  }
  
  private _defineProperty(key: string, initialValue) {
    let value = initialValue;
    Object.defineProperty(this, key, {
      get: () => value,
      set: (newValue) => value = newValue,
      enumerable: false,
      configurable: false
    })
  }
  
  private _defineComputedField(key: string, func: (model: this) => any) {
    Object.defineProperty(this, key, {
      get: func.bind(this, this),
      enumerable: true
    });
  }
}

Model.prototype._table = "users";
Model.prototype._pk = "id";
Model.prototype._computedFields = [];