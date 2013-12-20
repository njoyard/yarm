/*jshint node:true */
/*global describe, it */

"use strict";

var assert = require("assert"),

	common = require("./common"),

	resource = common.resource,
	request = common.request;


function assertJSON(json) {
	var data;
	try {
		data = JSON.parse(json);
	} catch(e) {
		assert.strictEqual(json, "[valid json]");
	}

	return data;
}


describe("Sub-resources", function() {
	it("Should allow defining sub-resources with .sub()", function(done) {
		var r = resource("test");

		"get put post del sub list count".split(" ").forEach(function(method) {
			assert.strictEqual("function", typeof r.sub("foo")[method]);
		});

		r.sub("foo").get(function(req, cb) { cb(null, "bar"); });
		r.sub("bar").get(function(req, cb) { cb(null, "baz"); });

		request.get("/test/foo", function(res, body) {
			assert.strictEqual("bar", body);

			request.get("/test/bar", function(res, body) {
				assert.strictEqual("baz", body);
				done();
			});
		});
	});

	it("Should allow defining deeper sub-resources with chained .sub() calls", function(done) {
		resource("test").sub("foo").sub("bar").get(function(req, cb) {
			cb(null, "baz");
		});

		request.get("/test/foo/bar", function(res, body) {
			assert.strictEqual("baz", body);
			done();
		});
	});

	it("Should allow sub-resource wildcards with .sub(':var')", function(done) {
		resource("test").sub(":var").get(function(req, cb) {
			cb(null, "bar");
		});

		request.get("/test/foo", function(res, body) {
			assert.strictEqual("bar", body);
			done();
		});
	});

	it("Should allow direct deeper definitions with a single .sub() call", function(done) {
		var r = resource("test");

		r.sub("foo/:x/bar").get(function(req, cb) {
			cb(null, "bar");
		});

		request.get("/test/foo/whatever/bar", function(res, body) {
			assert.strictEqual("bar", body);
			done();
		});
	});

	it("Should allow greedy sub-resource wildcards with .sub('*')", function(done) {
		resource("test").sub("*").get(function(req, cb) {
			cb(null, "bar");
		});

		request.get("/test/foo", function(res, body) {
			assert.strictEqual("bar", body);

			request.get("/test/bar/baz", function(res, body) {
				assert.strictEqual("bar", body);
				done();
			});
		});
	});

	it("Should store values matched by sub-resource wildcards in req.params", function(done) {
		var r = resource("test");

		r.sub("foo/:bar/baz/:bing").get(function(req, cb) {
			cb(null, req.params.bar + "/" + req.params.bing);
		});

		r.sub("foo2/*").get(function(req, cb) {
			cb(null, req.params["*"]);
		});

		request.get("/test/foo/barValue/baz/bingValue", function(res, body) {
			assert.strictEqual("barValue/bingValue", body);

			request.get("/test/foo2/bar/baz", function(res, body) {
				assert.strictEqual("bar/baz", body);
				done();
			});
		});
	});

	it("Should override previously defined handlers for sub-resources", function(done) {
		var r = resource("test");

		r.sub("*").get(function(req, cb) { cb(null, "*"); });
		r.sub("foo/*").get(function(req, cb) { cb(null, "foo/*"); });
		r.sub("foo/bar").get(function(req, cb) { cb(null, "first"); });
		r.sub("foo/:x").get(function(req, cb) { cb(null, "second"); });
		r.sub("foo").sub("bar").get(function(req, cb) { cb(null, "third"); });
		r.sub("foo").sub(":x").get(function(req, cb) { cb(null, "fourth"); });

		request.get("/test/foo/bar", function(res, body) {
			assert.strictEqual("fourth", body);
			done();
		});
	});

	it("Sould allow defining hooks for each .sub() call", function(done) {
		var r = resource("test");

		r.sub("foo", function(req, next) {
			req.hooks = req.hooks || [];
			req.hooks.push("first");
			next();
		});

		r.sub("foo").sub("bar", function(req, next) {
			req.hooks = req.hooks || [];
			req.hooks.push("second");
			next();
		});

		r.sub("foo/bar", function(req, next) {
			req.hooks = req.hooks || [];
			req.hooks.push("third");
			next();
		}).get(function(req, cb) {
			cb(null, req.hooks.join("-"));
		});

		request.get("/test/foo/bar", function(res, body) {
			assert.strictEqual("first-second-third", body);
			done();
		});
	});

	it("Should stop handling when a hook returns an error", function(done) {
		var r = resource("test"),
			called = [];

		r.sub("foo", function(req, next) { next(); });
		r.sub("foo").sub("bar", function(req, next) { next(new Error("Oops")); });

		r.sub("foo/bar", function(req, next) {
			called.push("third");
			next();
		}).get(function(req, cb) {
			called.push("get");
			cb();
		});

		request.get("/test/foo/bar", function(res, body) {
			assert.strictEqual(-1, called.indexOf("third"));
			assert.strictEqual(-1, called.indexOf("get"));

			assert.strictEqual("Oops", body);
			assert.strictEqual(500, res.statusCode);
			done();
		});
	});

	it("Should stop handling when a hook throws", function(done) {
		var r = resource("test"),
			called = [];

		r.sub("foo", function(req, next) { next(); });
		r.sub("foo").sub("bar", function() { throw new Error("Oops"); });

		r.sub("foo/bar", function(req, next) {
			called.push("third");
			next();
		}).get(function(req, cb) {
			called.push("get");
			cb();
		});

		request.get("/test/foo/bar", function(res, body) {
			assert.strictEqual(-1, called.indexOf("third"));
			assert.strictEqual(-1, called.indexOf("get"));

			assert.strictEqual("Oops", body);
			assert.strictEqual(500, res.statusCode);
			done();
		});
	});

	it("Should allow getting URLs for subresources with req.getHref([subpath])", function(done) {
		var r = resource("test");

		r.sub("foo/bar").get(function(req, cb) {
			cb(null, {
				raw: req.getHref(),
				sub: req.getHref("baz/bing")
			});
		});

		request.get("/test/foo/bar", function(res, body) {
			var data = assertJSON(body);

			assert.strictEqual(data.raw, "http://localhost/test/foo/bar");
			assert.strictEqual(data.sub, "http://localhost/test/foo/bar/baz/bing");

			done();
		});
	});

	it("Should allow setting options on resources and sub-resources", function(done) {
		var r, options1, options2;

		r = resource("test")
			.set("foo", "bar");

		r.sub("foo")
			.set("bar", "baz")
			.get(function(req, cb) {
				options1 = req.options;
				cb();
			});

		r.sub("foo/bar")
			.set("foo", "baz")
			.get(function(req, cb) {
				options2 = req.options;
				cb();
			});

		request.get("/test/foo", function(res, body) {
			assert.strictEqual("bar", options1.foo);
			assert.strictEqual("baz", options1.bar);

			request.get("/test/foo/bar", function(res, body) {
				assert.strictEqual("baz", options2.foo);
				assert.strictEqual("baz", options2.bar);

				done();
			});
		});
	});
});