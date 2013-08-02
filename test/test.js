/*jshint node:true */
/*global describe, it */

"use strict";

var assert = require("assert"),

	common = require("./common"),
	yarm = require("../index.js"),

	resource = common.resource,
	request = common.request,
	callbackTests = common.callbackTests;


describe("Document resource", function() {
	describe("GET", function() {
		callbackTests("GET", it);
	});

	describe("PUT", function() {
		callbackTests("PUT", it);

		it("should pass false as a second argument to .put", function(done) {
			var value;

			resource("test", {
				put: function(req, isPatch, cb) {
					value = isPatch;
					cb();
				}
			});

			request.put("/test", function(res, body) {
				assert.strictEqual(false, value);
				done();
			})
		});
	});

	describe("PATCH", function() {
		callbackTests("PATCH", it);

		it("should pass true as a second argument to .put", function(done) {
			var value;

			resource("test", {
				put: function(req, isPatch, cb) {
					value = isPatch;
					cb();
				}
			});

			request.patch("/test", function(res, body) {
				assert.strictEqual(true, value);
				done();
			})
		});
	});

	describe("DELETE", function() {
		callbackTests("DELETE", it);
	});
});