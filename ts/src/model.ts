import * as _ from "lodash";
import * as Promise from "bluebird";
import {Term} from "rethinkdbdash";
import {RethinkConnection} from "./connection";
import {SchemaError} from "./validators/schema";

export interface RelationMap {
  [key: string]: {
    type: string;
    field: string;
    model: typeof Model;
  }
}

export interface TagMap {
  [key: string]: string[];
}

export class Model {
  _prev;
  _computedFields;
  _relations: RelationMap;
  _schemaRaw;
  _schema: (input: any) => SchemaError;
  _conn: RethinkConnection;
  _pk: string;
  _table: string;
  _tags: TagMap;

  constructor(data: any = {}, isNew = true) {
    this._defineProperties();
    if (isNew) {
      this._prev = this.getRaw();
      this.assign(data);
    } else {
      this.assign(data);
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
  
  public static getAll<T extends Model>(id: string, index?: string): Promise<T> {
    const q: any = this.prototype.query();
    return q.getAll(id, {index: index}).run()
      .map(res => new this(res, false))
  }
  
  public static find<T extends Model>(query: any): Promise<T[]> {
    const q: any = this.prototype.query();
    return q.filter(query).run()
      .map(res => new this(res, false));
  }

  public query(): Term {
    return this._conn.r.table(this._table);
  }

  public save(): Promise<this> {
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
    
    changed[this._pk] = this[this._pk];
    
    return this.query().insert(changed, {conflict: "update"}).run()
      .then(doc => {
        if (doc.generated_keys) this[this._pk] = doc.generated_keys[0];
        return this;
      })
  }

  public join(key: string): Promise<this> {
    const relation = this._relations[key];
    return Promise.resolve()
      .then(() => {
        if (!relation) {
          return Promise.reject(new Error(`No relation found for '${key}'`));
        }
        
        let q: any = relation.model.prototype.query();
        
        if (relation.type === "hasMany") {
          return relation.model.getAll(this[this._pk], relation.field);
        } else if (relation.type === "belongsTo") {
          return relation.model.get(this[relation.field]);
        }
        
        return Promise.reject(new Error(`Unknown relation type '${relation.type}'`));
      })
      .then(res => {
        this[key] = res;
        return this;
      });
  }
  
  public withoutFields(tag: string): this {
    const fields = this.getFields();
    
    let returnData = {};
    for (let i = 0, len = fields.length; i < len; i++) {
      const key = fields[i];
      const tags = this._tags[key];
      
      // If this key does not have the tag.
      if (!tags || tags.indexOf(tag) === -1) {
        returnData[key] = this[key];
      }
    }
    
    return new (<typeof Model> this.constructor)(returnData) as this;
  }
  
  public withFields(tag: string): this {
    const fields = this.getFields();
    
    let returnData = {};
    for (let i = 0, len = fields.length; i < len; i++) {
      const key = fields[i];
      const tags = this._tags[key];
      
      // If this key has the tag.
      if (tags && tags.indexOf(tag) > -1) {
        returnData[key] = this[key];
      }
    }
    
    return new (<typeof Model> this.constructor)(returnData) as this;
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
      return _.isEqual(value, this[key]) ? result : result.concat(key);
    }, []);
  }
  
  public getFields() {
    return Object.keys(this._schemaRaw);
  }
  
  public assign(data: any) {
    const fields = this.getFields();
    
    for (let i = 0, keys = Object.keys(data), len = keys.length; i < len; i++) {
      const key = keys[i];
      if (fields.indexOf(key) > -1) {
        this[key] = data[key];
      }
    }
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

Model.prototype._pk = "id";
Model.prototype._computedFields = {};
Model.prototype._relations = {};
Model.prototype._tags = {};