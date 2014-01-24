/*jshint node:true */
/*global describe, it */

"use strict";

var assert = require("assert"),

	common = require("./common"),

	resource = common.resource,
	request = common.request,
	callbackTests = common.callbackTests;


describe("All resources", function() {
	describe("PUT", function() {
		callbackTests("PUT", it);

		it("should pass false as a second argument to .put", function(done) {
			var value;

			resource("test").put(function(req, isPatch, cb) {
				value = isPatch;
				cb();
			});

			request.put("/test", function(res, body) {
				assert.strictEqual(false, value);
				done();
			});
		});
	});

	describe("PATCH", function() {
		callbackTests("PATCH", it);

		it("should pass true as a second argument to .put", function(done) {
			var value;

			resource("test").put(function(req, isPatch, cb) {
				value = isPatch;
				cb();
			});

			request.patch("/test", function(res, body) {
				assert.strictEqual(true, value);
				done();
			});
		});
	});

	describe("POST", function() {
		callbackTests("POST", it);
	});

	describe("DELETE", function() {
		callbackTests("DELETE", it);
	});
});

describe("Document resources", function() {
	describe("GET", function() {
		callbackTests("GET", it);
	});
});

describe("Collection resources", function() {
	describe("GET", function() {
		callbackTests("COUNT", it);
		callbackTests("LIST", it);

		it("should send a JSON response with the results from .count and .list", function(done) {
			resource("test")
				.count(function(req, cb) {
					cb(null, 42);
				})
				.list(function(req, offset, limit, cb) {
					cb(null, ["foo", "bar"]);
				});

			request.get("/test", function(res, body) {
				var jbody;
				assert.doesNotThrow(function() { jbody = JSON.parse(body); });

				assert.deepEqual({
					_count: 42,
					_items: ["foo", "bar"]
				}, jbody);

				done();
			});
		});
	});
});