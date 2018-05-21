let assert = require("assert"),
  common = require("./common"),
  resource = common.resource,
  request = common.request,
  callbackTests = common.callbackTests;

describe("All resources", () => {
  describe("PUT", () => {
    callbackTests("PUT", it);

    it("should pass false as a second argument to .put", (done) => {
      let value;

      resource("test").put((req, isPatch, cb) => {
        value = isPatch;
        cb();
      });

      request.put("/test", (res) => {
        assert.strictEqual(false, value);
        done();
      });
    });
  });

  describe("PATCH", () => {
    callbackTests("PATCH", it);

    it("should pass true as a second argument to .put", (done) => {
      let value;

      resource("test").put((req, isPatch, cb) => {
        value = isPatch;
        cb();
      });

      request.patch("/test", (res) => {
        assert.strictEqual(true, value);
        done();
      });
    });
  });

  describe("POST", () => {
    callbackTests("POST", it);
  });

  describe("DELETE", () => {
    callbackTests("DELETE", it);
  });
});

describe("Document resources", () => {
  describe("GET", () => {
    callbackTests("GET", it);
  });
});

describe("Collection resources", () => {
  describe("GET", () => {
    callbackTests("COUNT", it);
    callbackTests("LIST", it);

    it("should send a JSON response with the results from .count and .list", (done) => {
      resource("test")
        .count((req, cb) => {
          cb(null, 42);
        })
        .list((req, offset, limit, cb) => {
          cb(null, ["foo", "bar"]);
        });

      request.get("/test", (res, body) => {
        let jbody;
        assert.doesNotThrow(() => {
          jbody = JSON.parse(body);
        });

        assert.deepEqual(
          {
            _count: 42,
            _items: ["foo", "bar"]
          },
          jbody
        );

        done();
      });
    });
  });
});
