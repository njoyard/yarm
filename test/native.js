/*jshint node:true */
/*global describe, it */

"use strict";

var assert = require("assert"),

	common = require("./common"),
	yarm = require("../index.js"),
	request = common.request;


function resource(name, value) {
	yarm.remove(name);
	return yarm.native(name, value);
}


function assertJSON(json) {
	var data;
	try {
		data = JSON.parse(json);
	} catch(e) {
		assert.strictEqual(json, "[valid json]");
	}

	return data;
}


function allTypes(description, doRequest, checkResponse, options) {
	var types = {
		"string": { value: "foo" },
		"number": { value: 42 },
		"bool": { value: true },
		"array": { value: ["foo", "bar", "baz"] },
		"object": { value: { foo: "bar" } }
	};

	options = options || {};

	function objectValues(obj) {
		return Object.keys(obj).map(function(k) { return obj[k]; });
	}

	Object.keys(types).forEach(function(type) {
		it(description.replace("%type", type), function(done) {
			var expectedValue = types[type].value,
				jsonBody = expectedValue;

			if (type !== "array" && type !== "object") {
				jsonBody = { _value: expectedValue };
			}

			doRequest(expectedValue, jsonBody, function(res, body) {
				var actualValue = checkResponse(expectedValue, res, body);

				if (type === "array") {
					if (options.rawArrays) {
						assert(Array.isArray(actualValue));
						assert.strictEqual(actualValue.join(","), expectedValue.join(","));
					} else {
						assert.strictEqual(typeof actualValue, "object");

						assert.strictEqual(actualValue._count, expectedValue.length);

						assert(Array.isArray(actualValue._items));
						assert.strictEqual(actualValue._items.join(","), expectedValue.join(","));
					}
				} else if (type === "object") {
					if (!options.objectCollections) {
						assert.strictEqual(typeof actualValue, "object");
						assert.strictEqual(Object.keys(actualValue).join(","), Object.keys(expectedValue).join(","));
						assert.strictEqual(objectValues(actualValue).join(","), objectValues(expectedValue).join(","));
					} else {
						assert.strictEqual(typeof actualValue, "object");

						assert.strictEqual(actualValue._count, Object.keys(expectedValue).length);

						assert(Array.isArray(actualValue._items));
						assert.strictEqual(actualValue._items.join(","), Object.keys(expectedValue).join(","));
					}
				} else {
					assert.strictEqual(actualValue, expectedValue);
				}

				done();
			});
		});
	});
}



describe("Native resources", function() {
	describe("Root resources", function() {
		it("Should GET object resources", function(done) {
			resource("test", {
				number: 42,
				string: "foo",
				bool: true,
				arr: [1, 2, 3]
			})

			request.get("/test", function(res, body) {
				var data = assertJSON(body);

				assert.strictEqual(typeof data, "object");
				assert.strictEqual(data.number, 42);
				assert.strictEqual(data.string, "foo");
				assert.strictEqual(data.bool, true);
				assert.strictEqual(Array.isArray(data.arr), true);
				assert.strictEqual(data.arr.join(","), "1,2,3");

				done();
			});
		});

		it("Should GET objects as collections when objectCollections is true", function(done) {
			resource("test", {
				number: 42,
				string: "foo",
				bool: true,
				arr: [1, 2, 3]
			}).set("objectCollections", true);

			request.get("/test?skip=1&limit=2", function(res, body) {
				var data = assertJSON(body);

				assert.strictEqual(data._count, 4);
				assert.strictEqual(data._items.join(","), "string,bool");

				done();
			});
		});

		it("Should GET arrays as collections", function(done) {
			resource("test", ["foo", "bar", "baz"])
				.set("arrayCollections", true);

			request.get("/test?skip=1&limit=1", function(res, body) {
				var data = assertJSON(body);

				assert.strictEqual(data._count, 3);
				assert.strictEqual(data._items.join(","), "bar");

				done();
			});
		});

		it("Should GET array resources as is when rawArrays is true", function(done) {
			resource("test", ["foo", "bar", "baz"])
				.set("rawArrays", true);

			request.get("/test", function(res, body) {
				var data = assertJSON(body);

				assert.strictEqual(Array.isArray(data), true);
				assert.strictEqual(data.join(","), "foo,bar,baz");

				done();
			});
		});

		it("Should POST new key/value pairs to object resources", function(done) {
			var obj = { foo: "bar" };
			resource("test", obj);

			request.post("/test", { _key: "added", _value: "baz" }, function(res, body) {
				assert.strictEqual(res.statusCode, 201);
				assert.strictEqual(obj.added, "baz");

				done();
			});
		});

		it("Should return POSTed values when postResponse is true", function(done) {
			var obj = { foo: "bar" };
			resource("test", obj).set("postResponse", true);

			request.post("/test", { _key: "added", _value: "baz" }, function(res, body) {
				assert.strictEqual(res.statusCode, 200);
				assert.strictEqual(body, "baz");

				done();
			});
		});

		it("Should refuse to POST to object resources without _value in input", function(done) {
			var obj = { foo: "bar" };
			resource("test", obj);

			request.post("/test", { _key: "added" }, function(res, body) {
				assert.strictEqual(res.statusCode, 400);

				done();
			});
		});

		it("Should refuse to POST to object resources without _key in input", function(done) {
			var obj = { foo: "bar" };
			resource("test", obj);

			request.post("/test", { _value: "baz" }, function(res, body) {
				assert.strictEqual(res.statusCode, 400);

				done();
			});
		});

		it("Should refuse to POST to object resources with non-string _key in input", function(done) {
			var obj = { foo: "bar" };
			resource("test", obj);

			request.post("/test", { _key: 1, _value: "baz" }, function(res, body) {
				assert.strictEqual(res.statusCode, 400);

				done();
			});
		});

		it("Should POST new array items to array resources", function(done) {
			var arr = ["foo", "bar"];
			resource("test", arr);

			request.post("/test", { _value: "baz" }, function(res, body) {
				assert.strictEqual(res.statusCode, 201);
				assert.strictEqual(arr.join(","), "foo,bar,baz");

				done();
			});
		});

		it("Should return POSTed array items when postResponse is true", function(done) {

			var arr = ["foo", "bar"];
			resource("test", arr).set("postResponse", true);

			request.post("/test", { _value: "baz" }, function(res, body) {
				assert.strictEqual(res.statusCode, 200);
				assert.strictEqual(body, "baz");

				done();
			});
		});
	});

	describe("Properties", function() {
		describe("GET", function() {
			allTypes("Should GET %type property values", function(expected, json, callback) {
				resource("test", { property: expected });
				request.get("/test/property", callback);
			}, function(expected, res, body) {
				assert.strictEqual(res.statusCode, 200);
				return (typeof expected === "string") ? body : assertJSON(body);
			});

			allTypes("Should GET %type array items", function(expected, json, callback) {
				resource("test", ["foo", expected, "bar"]);
				request.get("/test/1", callback);
			}, function(expected, res, body) {
				assert.strictEqual(res.statusCode, 200);
				return (typeof expected === "string") ? body : assertJSON(body);
			});
		});

		describe("PUT", function() {
			var obj = { property: "foo" };
			
			allTypes("Should PUT %type property values", function(expected, json, callback) {
				resource("test", obj);
				request.put("/test/property", json, callback);
			}, function(expected, res, body) {
				assert.strictEqual(res.statusCode, 204);
				return obj.property;
			}, { rawArrays: true });
			
			var arr = [ "foo", "bar", "baz" ];

			allTypes("Should PUT %type array items", function(expected, json, callback) {
				resource("test", arr);
				request.put("/test/1", json, callback);
			}, function(expected, res, body) {
				assert.strictEqual(res.statusCode, 204);
				return arr[1];
			}, { rawArrays: true });
		});

		describe("PATCH", function() {
			it("Should PATCH object property values", function(done) {
				var obj = { obj: { foo: "bar" } };
				resource("test", obj);

				request.patch("/test/obj", { number: 42, string: "foo" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);
					assert.strictEqual(obj.obj.foo, "bar");
					assert.strictEqual(obj.obj.number, 42);
					assert.strictEqual(obj.obj.string, "foo");
					done();
				});
			});

			it("Should PATCH object array items", function(done) {
				var obj = [{ foo: "bar" }];
				resource("test", obj);

				request.patch("/test/0", { number: 42, string: "foo" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);
					assert.strictEqual(obj[0].foo, "bar");
					assert.strictEqual(obj[0].number, 42);
					assert.strictEqual(obj[0].string, "foo");
					done();
				});
			});

			it("Should refuse to PATCH non-object property values", function(done) {
				resource("test", { nonObject: "foo" });

				request.patch("/test/nonObject", { number: 42 }, function(res, body) {
					assert.strictEqual(res.statusCode, 405);
					done();
				});
			});

			it("Should refuse to PATCH non-object array items", function(done) {
				resource("test", ["foo"]);

				request.patch("/test/0", { number: 42 }, function(res, body) {
					assert.strictEqual(res.statusCode, 405);
					done();
				});
			});
		});

		describe("DELETE", function() {
			it("Should DELETE properties", function(done) {
				var obj = { number: 42, string: "foo" };

				resource("test", obj);

				request.del("/test/number", function(res, body) {
					assert.strictEqual(res.statusCode, 204);
					assert.strictEqual(typeof obj.number, "undefined");

					done();
				});
			});
			
			it("Should DELETE array items", function(done) {
				var obj = [42, "foo"];

				resource("test", obj);

				request.del("/test/0", function(res, body) {
					assert.strictEqual(res.statusCode, 204);
					assert.strictEqual(obj.length, 1);
					assert.strictEqual(obj[0], "foo");

					done();
				});
			});

			it("Should DELETE array items leaving a hole when sparseArrays is true", function(done) {
				var obj = [42, "foo"];

				resource("test", obj).set("sparseArrays", true);

				request.del("/test/0", function(res, body) {
					assert.strictEqual(res.statusCode, 204);
					assert.strictEqual(obj.length, 2);
					assert.strictEqual(typeof obj[0], "undefined");

					done();
				});
			});
		});

		describe("POST", function() {
			it("Should POST new key/value pairs to object sub-resources", function(done) {
				var obj = { obj: { foo: "bar" } };
				resource("test", obj);

				request.post("/test/obj", { _key: "added", _value: "baz" }, function(res, body) {
					assert.strictEqual(res.statusCode, 201);
					assert.strictEqual(obj.obj.added, "baz");

					done();
				});
			});

			it("Should return POSTed value when postResponse is true", function(done) {
				var obj = { obj: { foo: "bar" } };
				resource("test", obj).set("postResponse", true);

				request.post("/test/obj", { _key: "added", _value: "baz" }, function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(body, "baz");

					done();
				});
			});

			it("Should refuse to POST to object sub-resources without _value in input", function(done) {
				var obj = { obj: { foo: "bar" } };
				resource("test", obj);

				request.post("/test/obj", { _key: "added" }, function(res, body) {
					assert.strictEqual(res.statusCode, 400);

					done();
				});
			});

			it("Should refuse to POST to object sub-resources without _key in input", function(done) {
				var obj = { obj: { foo: "bar" } };
				resource("test", obj);

				request.post("/test/obj", { _value: "baz" }, function(res, body) {
					assert.strictEqual(res.statusCode, 400);

					done();
				});
			});

			it("Should refuse to POST to object sub-resources with non-string _key in input", function(done) {
				var obj = { obj: { foo: "bar" } };
				resource("test", obj);

				request.post("/test/obj", { _key: 1, _value: "baz" }, function(res, body) {
					assert.strictEqual(res.statusCode, 400);

					done();
				});
			});

			it("Should POST new array items to array sub-resources", function(done) {
				var obj = { arr: ["foo", "bar"] };
				resource("test", obj);

				request.post("/test/arr", { _value: "baz" }, function(res, body) {
					assert.strictEqual(res.statusCode, 201);
					assert.strictEqual(obj.arr.join(","), "foo,bar,baz");

					done();
				});
			});

			it("Should return POSTed array items when postResponse is true", function(done) {
				var obj = { arr: ["foo", "bar"] };
				resource("test", obj).set("postResponse", true);

				request.post("/test/arr", { _value: "baz" }, function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(body, "baz");

					done();
				});
			});
		});
	});
});