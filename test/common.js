/*jshint node:true */

"use strict";

var http = require("http"),
	assert = require("assert"),
	util = require("util"),
	Readable = require("stream").Readable,

	express = require("express"),

	yarm = require("../index.js"),
	app = express();


/* Test app setup */
app.use(require("body-parser").json());

app.use("/rest", yarm());
app.listen(8081);


/* HTTP request helpers */
function request(method, path, data, callback) {
	if (typeof data === "function" && !callback) {
		callback = data;
		data = undefined;
	}

	var options = {
		host: "localhost",
		port: 8081,
		path: "/rest" + path,
		method: method
	};

	var req = http.request(options, function(res) {
		var body = "";

		res.on("data", function(data) {
			body += data;
		});

		res.on("end", function() {
			callback(res, body);
		});
	});

	if (data) {
		req.setHeader("Content-Type", "application/json");
		data = JSON.stringify(data);
	}

	req.end(data);
}


request.get = request.bind(null, "GET");
request.put = request.bind(null, "PUT");
request.post = request.bind(null, "POST");
request.del = request.bind(null, "DELETE");
request.patch = request.bind(null, "PATCH");


/* Test resource definition helper */
function resource(name, definition) {
	yarm.remove(name);
	return yarm.resource(name, definition);
}


/* Define tests for all methods
	init is called at the beginning of each test with an empty context object
	callback is called when receiving the response for each test, it receives
		the response, the body, the context object and a done function.
*/
function allMethods(it, init, path, callback) {
	var call = ["get", "put", "post", "del", "patch"];

	call.forEach(function(method) {
		it("(" + method.toUpperCase() + " method)", function(done) {
			var ctx = {};
			init(ctx);

			request[method](path, function(res, body) {
				callback(res, body, ctx, done);
			});
		});
	});
}



/* Data for standard callback tests
	"name" is the name of the method called on the resource definition
	"cbIndex" is the argument index of the callback passed to "name"
*/
var methods = {
	"GET": { name: "get", cbIndex: 1, noContent: { code: 204, msg: "" } },
	"PUT": { name: "put", cbIndex: 2, noContent: { code: 204, msg: "" } },
	"PATCH": { name: "put", cbIndex: 2, noContent: { code: 204, msg: "" } },
	"DELETE": { name: "del", cbIndex: 1, noContent: { code: 204, msg: "" } },
	"POST": { name: "post", cbIndex: 1, noContent: { code: 204, msg: "" } },
};

/* Describe standard tests valid for all methods */
function callbackTests(method, it) {
	var methodName, doRequest, callbackIndex, noContent,
		doResultTests = true,
		additionalMethods = {};

	switch(method) {
		case "COUNT":
			methodName = "count";
			doRequest = request.bind(null, "GET");
			callbackIndex = 1;
			doResultTests = false;
			additionalMethods = {
				"list": function(req, offset, limit, cb) { cb(); }
			};

			break;

		case "LIST":
			methodName = "list";
			doRequest = request.bind(null, "GET");
			callbackIndex = 3;
			doResultTests = false;
			additionalMethods = {
				"count": function(req, cb) { cb(); }
			};

			break;

		default:
			methodName = methods[method].name;
			doRequest = request.bind(null, method);
			callbackIndex = methods[method].cbIndex;
			noContent = methods[method].noContent;
			break;
	}


	it("should respond with 405 Not Allowed when no " + methodName + " handler was set", function(done) {
		var r = resource("test");

		// Define a handler for an other method
		if (["get", "list", "count"].indexOf(methodName) === -1) {
			r.get(function(req, cb) {
				cb();
			});
		} else {
			r.put(function(req, cb) {
				cb();
			});
		}

		Object.keys(additionalMethods).forEach(function(key) {
			r[key](additionalMethods[key]);
		});

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Method not allowed");
			assert.strictEqual(res.statusCode, 405);

			done();
		});
	});

	it("should call " + methodName + " handler", function(done) {
		var called = false,
			r = resource("test");

		Object.keys(additionalMethods).forEach(function(key) {
			r[key](additionalMethods[key]);
		});

		r[methodName](function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			called = true;
			cb();
		});

		doRequest("/test", function(res, body) {
			assert(called);
			done();
		});
	});

	it("should respond 500 with the error message passed from " + methodName + " handler", function(done) {
		var r = resource("test");

		Object.keys(additionalMethods).forEach(function(key) {
			r[key](additionalMethods[key]);
		});

		r[methodName](function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(new Error("Test error"));
		});

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test error");
			assert.strictEqual(res.statusCode, 500);

			done();
		});
	});

	it("should respond with the error message and code passed from " + methodName + " handler", function(done) {
		var r = resource("test");

		Object.keys(additionalMethods).forEach(function(key) {
			r[key](additionalMethods[key]);
		});

		r[methodName](function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			var err = new Error("Test error");
			err.code = 542;
			cb(err);
		});

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test error");
			assert.strictEqual(res.statusCode, 542);

			done();
		});
	});

	if (doResultTests) {
		it("should respond with " + noContent.code + " " + noContent.msg + " when " + methodName + " handler sends nothing", function(done) {
			var r = resource("test");

			Object.keys(additionalMethods).forEach(function(key) {
				r[key](additionalMethods[key]);
			});

			r[methodName](function() {
				var req = arguments[0],
					cb = arguments[callbackIndex];

				cb();
			});

			doRequest("/test", function(res, body) {
				assert.strictEqual(res.statusCode, noContent.code);
				assert.strictEqual(body, noContent.msg);

				done();
			});
		});

		it("should respond with the result from " + methodName + " handler", function(done) {
			var r = resource("test");

			Object.keys(additionalMethods).forEach(function(key) {
				r[key](additionalMethods[key]);
			});

			r[methodName](function() {
				var req = arguments[0],
					cb = arguments[callbackIndex];

				cb(null, "Test content");
			});

			doRequest("/test", function(res, body) {
				assert.strictEqual(body, "Test content");
				assert.strictEqual(res.statusCode, 200);

				done();
			});
		});

		it("should respond with the Buffer result from " + methodName + " handler", function(done) {
			var r = resource("test");

			Object.keys(additionalMethods).forEach(function(key) {
				r[key](additionalMethods[key]);
			});

			r[methodName](function() {
				var req = arguments[0],
					cb = arguments[callbackIndex];

				cb(null, new Buffer("Test content"));
			});

			doRequest("/test", function(res, body) {
				assert.strictEqual(body, "Test content");
				assert.strictEqual(res.statusCode, 200);

				done();
			});
		});

		it("should respond with the readable stream result from " + methodName + " handler", function(done) {
			function TestStream(opt) {
				Readable.call(this, opt);
				this._done = false;
			}

			util.inherits(TestStream, Readable);

			TestStream.prototype._read = function() {
				if (!this._done) {
					this.push("Test content");
					this._done = true;
				} else {
					this.push(null);
				}
			};

			var r = resource("test");

			Object.keys(additionalMethods).forEach(function(key) {
				r[key](additionalMethods[key]);
			});

			r[methodName](function() {
				var req = arguments[0],
					cb = arguments[callbackIndex];

				cb(null, new TestStream());
			});

			doRequest("/test", function(res, body) {
				assert.strictEqual(body, "Test content");
				assert.strictEqual(res.statusCode, 200);

				done();
			});
		});

		it("should send response with mimetype from " + methodName + " handler", function(done) {
			var r = resource("test");

			Object.keys(additionalMethods).forEach(function(key) {
				r[key](additionalMethods[key]);
			});

			r[methodName](function() {
				var req = arguments[0],
					cb = arguments[callbackIndex];

				cb(null, "Test content", "text/x-test-content");
			});

			doRequest("/test", function(res, body) {
				assert.strictEqual(res.headers["content-type"], "text/x-test-content; charset=utf-8");
				assert.strictEqual(body, "Test content");

				done();
			});
		});

		it("should send file when " + methodName + " handler calls cb.file()", function(done) {
			var r = resource("test");

			Object.keys(additionalMethods).forEach(function(key) {
				r[key](additionalMethods[key]);
			});

			r[methodName](function() {
				var req = arguments[0],
					cb = arguments[callbackIndex];

				cb.file(null, __dirname + "/testfile", "text/x-test-content");
			});

			doRequest("/test", function(res, body) {
				assert.strictEqual(res.headers["content-type"], "text/x-test-content; charset=utf-8");
				assert.strictEqual(body, "Test file content");

				done();
			});
		});
	}

	it("should pass the request object to " + methodName + " handler", function(done) {
		var r = resource("test"),
			request;

		Object.keys(additionalMethods).forEach(function(key) {
			r[key](additionalMethods[key]);
		});

		r[methodName](function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			request = req;
			cb();
		});

		doRequest("/test?foo=bar", function(res, body) {
			assert.strictEqual(request.query["foo"], "bar");

			done();
		});
	});
}


function composeTests(array) {
	if (array.length === 1) {
		return array[0];
	} else {
		var first = array.shift(),
			second = array.shift();

		array.unshift(function(done) {
			function firstDone() {
				second(done);
			}

			first(firstDone);
		});

		return composeTests(array);
	}
}


module.exports = {
	app: app,
	request: request,
	resource: resource,
	callbackTests: callbackTests,
	allMethods: allMethods,
	composeTests: composeTests
};

