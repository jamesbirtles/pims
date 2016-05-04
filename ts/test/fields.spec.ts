import "reflect-metadata";
import * as chai from "chai";
import { Validators } from "../";
import { User } from "./user.model";

const should = chai.should();

describe("Model Fields", () => {
  describe("Field", () => {
    it("adds the fields to the raw schema", () => {
      User.prototype._schemaRaw.should.have.property("id").that.is.an("array");
      User.prototype._schemaRaw.should.have.property("name").that.is.an("array");
      User.prototype._schemaRaw.should.have.property("email").that.is.an("array");
      User.prototype._schemaRaw.should.have.property("age").that.is.an("array");
    })
    
    it("adds type informaton to the fields", () => {
      User.prototype._schemaRaw["id"].should.have.deep.property("[0]").that.equals(String);
      User.prototype._schemaRaw["name"].should.have.deep.property("[0]").that.equals(String);
      User.prototype._schemaRaw["email"].should.have.deep.property("[0]").that.equals(String);
      User.prototype._schemaRaw["age"].should.have.deep.property("[0]").that.equals(Number);
    })
    
    it("adds validations after type", () => {
      const schema = User.prototype._schemaRaw["email"];
      
      schema.should.have.lengthOf(3);
      schema.should.include.members([Validators.Required, Validators.Email]);
    })
  })
  
  describe("ComputedField", () => {
    it("registers the computed field", () => {
      User.prototype._computedFields.should.have.property("agePlus20").that.is.a("function");
    })
    
    it("computes the field when queried", () => {
      const user = new User();
      user.age = 10;
      should.equal(user.agePlus20, 30);
    })
  })
})