import assert from "assert";
import common from "./common";
import yarm from "../index";

const { request } = common;

describe("New instance", function() {
  it("Should enable creating new yarm instances", function() {
    assert.strictEqual(typeof yarm.newInstance, "function");

    let instance = yarm.newInstance();
    assert.strictEqual(typeof instance, "function");
    assert.strictEqual(typeof instance.resource, "function");
  });

  it("Should not share resources between separate instances", function(done) {
    let instance = yarm.newInstance();
    common.app.use("/rest2", instance());

    yarm.resource("test1").get(function(req, cb) {
      cb(null, "Test 1 resource");
    });

    instance.resource("test2").get(function(req, cb) {
      cb(null, "Test 2 resource");
    });

    request.get("/test1", function(res, body) {
      assert.strictEqual(body, "Test 1 resource");

      request.get("/test2", function(res, body) {
        assert.strictEqual(res.statusCode, 404);

        request.get("2/test1", function(res, body) {
          assert.strictEqual(res.statusCode, 404);

          request.get("2/test2", function(res, body) {
            assert.strictEqual(body, "Test 2 resource");
            done();
          });
        });
      });
    });
  });
});
