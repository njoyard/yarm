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

	req.end(data);
}


request.get = request.bind(null, "GET");
request.put = request.bind(null, "PUT");
request.post = request.bind(null, "POST");
request.del = request.bind(null, "DEL");
request.patch = request.bind(null, "PATCH");


/* Test resource definition helper */
function resource(name, definition) {
	yarm.resource.remove(name);
	yarm.resource(name, definition);
}


/* Data for standard callback tests
	"name" is the name of the method called on the resource definition
	"cbIndex" is the argument index of the callback passed to "name"
*/
var methods = {
	"GET": { name: "get", cbIndex: 1 },
	"PUT": { name: "put", cbIndex: 2 },
	"PATCH": { name: "put", cbIndex: 2 },
	"POST": { name: "post", cbIndex: 2 },
	"DELETE": { name: "del", cbIndex: 1 }
};


/* Describe standard tests valid for all methods */
function callbackTests(method, it) {
	var methodName = methods[method].name,
		doRequest = request.bind(null, method),
		callbackIndex = methods[method].cbIndex;

	it("should respond with 405 Not Allowed when ." + methodName + " is not present", function(done) {
		resource("test", {});

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Not allowed");
			assert.strictEqual(res.statusCode, 405);

			done();
		});
	});

	it("should call ." + methodName, function(done) {
		var called = false,
			def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			called = true;
			cb();
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert(called);
			done();
		});
	});

	it("should respond 500 with the error message passed from ." + methodName, function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(new Error("Test error"));
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test error");
			assert.strictEqual(res.statusCode, 500);

			done();
		});
	});

	it("should respond with the error message and code passed from ." + methodName, function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			var err = new Error("Test error");
			err.code = 542;
			cb(err);
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test error");
			assert.strictEqual(res.statusCode, 542);

			done();
		});
	});

	it("should respond with 204 No content when ." + methodName + " sends nothing", function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb();
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(res.statusCode, 204);

			done();
		});
	});

	it("should respond with the result from ." + methodName, function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(null, "Test content");
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test content");
			assert.strictEqual(res.statusCode, 200);

			done();
		});
	});

	it("should respond with the Buffer result from ." + methodName, function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(null, new Buffer("Test content"));
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test content");
			assert.strictEqual(res.statusCode, 200);

			done();
		});
	});

	it("should respond with the readable stream result from ." + methodName, function(done) {
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

		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(null, new TestStream());
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(body, "Test content");
			assert.strictEqual(res.statusCode, 200);

			done();
		});
	});

	it("should send response with mimetype when ." + methodName + " sends a ResponseBody", function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(null, new yarm.ResponseBody("Test content", "text/x-test-content"));
		};

		resource("test", def);

		doRequest("/test", function(res, body) {
			assert.strictEqual(res.headers["content-type"], "text/x-test-content");
			assert.strictEqual(body, "Test content");

			done();
		});
	});

	it("should send file ." + methodName + " sends a ResponseFile", function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(null, new yarm.ResponseFile(__dirname + "/testfile", "text/x-test-content"));
		};

		doRequest("/test", function(res, body) {
			assert.strictEqual(res.headers["content-type"], "text/x-test-content");
			assert.strictEqual(body, "Test file content");

			done();
		});

		resource("test", def);
	});

	it("should pass the request object to ." + methodName, function(done) {
		var def = {};

		def[methodName] = function() {
			var req = arguments[0],
				cb = arguments[callbackIndex];

			cb(null, req.param("foo"));
		};

		resource("test", def);

		doRequest("/test?foo=bar", function(res, body) {
			assert.strictEqual(body, "bar");

			done();
		});
	});
}


module.exports = {
	request: request,
	resource: resource,
	callbackTests: callbackTests
};

