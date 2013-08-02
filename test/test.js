/*jshint node:true */
/*global describe, it */

"use strict";

var assert = require("assert"),
	http = require("http"),
	util = require("util"),
	Readable = require("stream").Readable,

	express = require("express"),

	yarm = require("../index.js"),
	app = express();


app.use("/rest", yarm());
app.listen(8081);


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


function resource(name, definition) {
	yarm.resource.remove(name);
	yarm.resource(name, definition);
}


describe("Document resource", function() {
	describe("GET", function() {
		it("should respond with 405 Not Allowed when .get is not present", function(done) {
			resource("test", {});

			request.get("/test", function(res, body) {
				assert.equal(body, "Not allowed");
				assert.equal(res.statusCode, 405);

				done();
			});
		});

		it("should respond 500 with the error message passed from .get", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb(new Error("Test error"));
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(body, "Test error");
				assert.equal(res.statusCode, 500);

				done();
			});
		});

		it("should respond with the error message and code passed from .get", function(done) {
			resource("test", {
				get: function(req, cb) {
					var err = new Error("Test error");
					err.code = 542;
					cb(err);
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(body, "Test error");
				assert.equal(res.statusCode, 542);

				done();
			});
		});

		it("should respond with 204 No content when .get sends nothing", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb();
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(res.statusCode, 204);

				done();
			});
		});

		it("should respond with the result from .get", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb(null, "Test content");
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(body, "Test content");
				assert.equal(res.statusCode, 200);

				done();
			});
		});

		it("should respond with the Buffer result from .get", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb(null, new Buffer("Test content"));
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(body, "Test content");
				assert.equal(res.statusCode, 200);

				done();
			});
		});

		it("should respond with the readable stream result from .get", function(done) {
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

			resource("test", {
				get: function(req, cb) {
					cb(null, new TestStream());
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(body, "Test content");
				assert.equal(res.statusCode, 200);

				done();
			});
		});

		it("should send response with mimetype when .get sends a ResponseBody", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb(null, new yarm.ResponseBody("Test content", "text/x-test-content"));
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(res.headers["content-type"], "text/x-test-content");
				assert.equal(body, "Test content");

				done();
			});

		});

		it("should send file .get sends a ResponseBody", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb(null, new yarm.ResponseFile(__dirname + "/testfile", "text/x-test-content"));
				}
			});

			request.get("/test", function(res, body) {
				assert.equal(res.headers["content-type"], "text/x-test-content");
				assert.equal(body, "Test file content");

				done();
			});

		});

		it("should pass the request object to .get", function(done) {
			resource("test", {
				get: function(req, cb) {
					cb(null, req.param("foo"));
				}
			});

			request.get("/test?foo=bar", function(res, body) {
				assert.equal(body, "bar");

				done();
			});
		});
	});
});