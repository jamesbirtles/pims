import "reflect-metadata";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { RethinkConnection } from "../";
import { config } from "./config";
import { User } from "./user.model";

const should = chai.should();
chai.use(chaiAsPromised);

describe("Model", () => {
  let rethink: RethinkConnection;
  
  function query() {
    return rethink.r.db(config.db);
  }
  
  before(() => {
    rethink = new RethinkConnection(config.rethink);

    rethink.setDefaultDatabase(config.db);
    return rethink.registerModel(User);
  })
  
  after(() => {
    return query().tableDrop("users");
  })
  
  it("Creates the table if it doesn't exist", () => {
    return (<any>query()).tableList().contains("users").should.eventually.be.true;
  })
  
  describe("Save", () => {
    it("Doesn't save if validation fails", () => {
      const user = new User({
        id: "1",
        name: "James",
        age: 19
      });
      
      return user.save().should.eventually.be.rejected
        .then(() => query().table("users").get("1"))
        .should.not.eventually.exist;
    })
    
    it("Creates document", () => {
      const user = new User({
        id: "1",
        name: "James",
        email: "james@example.com",
        age: 19
      });
      
      return user.save().should.eventually.be.fulfilled
        .then(() => query().table("users").get("1"))
        .should.eventually.exist.and.have.property("name").that.equals("James");
    })
    
    it("Updates an existing document", () => {
      return User.get<User>("1")
        .then(user => {
          user.name = "Callum";
          return user.save();
        })
        .then(() => query().table("users").get("1"))
        .should.eventually.exist.and.have.property("name").that.equals("Callum");
    })
  })

  describe("Delete", () => {
    it("Deletes document", () => {
      return User.get<User>("1")
        .then(user => user.delete())
        .then(() => query().table("users").get("1"))
        .should.eventually.not.exist;
    })
  })
})