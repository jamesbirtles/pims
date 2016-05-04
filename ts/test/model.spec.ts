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
  before(() => {
    rethink = new RethinkConnection(config.db, config.host, config.port);
    
    return rethink.registerModel(User);
  })
  
  after(() => {
    return rethink.r.tableDrop("users");
  })
  
  it("Creates the table if it doesn't exist", () => {
    (<any>rethink.r).tableList().contains("users").should.eventually.be.true;
  })
  
  describe("Save", () => {
    it("Doesn't save if validation fails", () => {
      const user = new User({
        id: "1",
        name: "James",
        age: 19
      });
      
      return user.save().should.eventually.be.rejected
        .then(() => rethink.r.table("users").get("1").should.not.eventually.exist);
    })
    
    it("Creates document", () => {
      const user = new User({
        id: "1",
        name: "James",
        email: "james@example.com",
        age: 19
      });
      
      return user.save().should.eventually.be.fulfilled
        .then(() => rethink.r.table("users").get("1").should.eventually.exist.and.have.property("name").that.equals("James"));
    })
    
    it("Updates an existing document", () => {
      return User.get<User>("1")
        .then(user => {
          user.name = "Callum";
          return user.save();
        })
        .then(() => rethink.r.table("users").get("1").should.eventually.exist.and.have.property("name").that.equals("Callum"))
    })
  })
})