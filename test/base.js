/*jshint node:true */
/*global describe, it */

"use strict";

var assert = require("assert"),

	common = require("./common"),
	yarm = require("../index.js"),

	resource = common.resource,
	request = common.request,
	callbackTests = common.callbackTests,
	allMethods = common.allMethods;


describe("All resources", function() {
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
			});
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
			resource("test", {
				count: function(req, cb) {
					cb(null, 42);
				},

				list: function(req, offset, limit, cb) {
					cb(null, ["foo", "bar"]);
				}
			});

			request.get("/test", function(res, body) {
				var jbody = JSON.parse(body);

				assert.deepEqual({
					_count: 42,
					_items: ["foo", "bar"]
				}, jbody);

				done();
			});
		});
	});
});

describe("Hybrid resources", function() {
	describe("GET", function() {
		it("should only call .get when both .get, .list and .count are present", function(done) {
			var called = [];

			resource("test", {
				get: function(req, cb) {
					called.push("get");
					cb(null, "foo");
				},

				count: function(req, cb) {
					called.push("count");
					cb(null, 42);
				},

				list: function(req, offset, limit, cb) {
					called.push("list");
					cb(null, ["bar"]);
				}
			});

			request.get("/test", function(res, body) {
				assert.deepEqual(["get"], called);
				assert.strictEqual("foo", body);

				done();
			});
		});
	});
});



describe("Sub-resources", function() {
	describe("should send a 404 response when no .sub method is present", function() {
		allMethods(
			it,
			function(ctx) {
				resource("test", {});
			},
			"/test/sub",
			function(res, body, ctx, done) {
				assert.strictEqual(body, "Not found");
				assert.strictEqual(res.statusCode, 404);

				done();
			}
		);
	});

	describe("should call .sub with the subresource id", function() {
		allMethods(
			it,
			function(ctx) {
				ctx.called = false;

				resource("test", {
					sub: function(id, cb) {
						ctx.called = true;
						ctx.received = id;
						cb();
					}
				});

			},
			"/test/sub",
			function(res, body, ctx, done) {
				assert(ctx.called);
				assert.strictEqual(ctx.received, "sub");

				done();
			}
		);
	});

	describe("should call .sub methods in cascade", function() {
		allMethods(
			it,
			function(ctx) {
				ctx.called = [];
				ctx.received = [];

				resource("test", {
					sub: function(id, cb) {
						ctx.called.push("sub1");
						ctx.received.push(id);

						cb(null, {
							sub: function(id, cb) {
								ctx.called.push("sub2");
								ctx.received.push(id);

								cb(null, {
									sub: function(id, cb) {
										ctx.called.push("sub3");
										ctx.received.push(id);

										cb();
									}
								});
							}
						});
					}
				});

			},
			"/test/foo/bar/baz",
			function(res, body, ctx, done) {
				assert.deepEqual(ctx.called, ["sub1", "sub2", "sub3"]);
				assert.deepEqual(ctx.received, ["foo", "bar", "baz"]);

				done();
			}
		);
	});

	describe("should respond with 500 when a .sub method sends an Error", function() {
		allMethods(
			it,
			function(ctx) {
				ctx.called = [];
				ctx.received = [];

				resource("test", {
					sub: function(id, cb) {
						ctx.called.push("sub1");
						ctx.received.push(id);

						cb(null, {
							sub: function(id, cb) {
								ctx.called.push("sub2");
								ctx.received.push(id);

								var err = new Error("Test error");
								cb(err);
							}
						});
					}
				});

			},
			"/test/foo/bar/baz",
			function(res, body, ctx, done) {
				assert.deepEqual(ctx.called, ["sub1", "sub2"]);
				assert.deepEqual(ctx.received, ["foo", "bar"]);
				assert.strictEqual(body, "Test error");
				assert.strictEqual(res.statusCode, 500);

				done();
			}
		);
	});

	describe("should respond with the error code from .sub methods", function() {
		allMethods(
			it,
			function(ctx) {
				ctx.called = [];
				ctx.received = [];

				resource("test", {
					sub: function(id, cb) {
						ctx.called.push("sub1");
						ctx.received.push(id);

						cb(null, {
							sub: function(id, cb) {
								ctx.called.push("sub2");
								ctx.received.push(id);

								var err = new Error("Test error");
								err.code = 542;
								cb(err);
							}
						});
					}
				});

			},
			"/test/foo/bar/baz",
			function(res, body, ctx, done) {
				assert.deepEqual(ctx.called, ["sub1", "sub2"]);
				assert.deepEqual(ctx.received, ["foo", "bar"]);
				assert.strictEqual(body, "Test error");
				assert.strictEqual(res.statusCode, 542);

				done();
			}
		);
	});

	describe("should send a 404 response when .sub sends nothing", function() {
		allMethods(
			it,
			function(ctx) {
				resource("test", {
					sub: function(id, cb) {
						cb(null, {
							sub: function(id, cb) {
								cb();
							}
						});
					}
				});

			},
			"/test/foo/bar/baz",
			function(res, body, ctx, done) {
				assert.strictEqual(body, "Not found");
				assert.strictEqual(res.statusCode, 404);

				done();
			}
		);
	});

	describe("should call request methods on subresources", function() {
		var methods = ["get", "put", "post", "del", "patch"],
			count = 0;

		allMethods(
			it,
			function(ctx) {
				count++;
				ctx.called = [];

				resource("test", {
					sub: function(id, cb) {
						cb(null, {
							get: function(req, cb) {
								ctx.called.push("get");
								cb();
							},

							put: function(req, isPatch, cb) {
								ctx.called.push(isPatch ? "patch" : "put");
								cb();
							},

							post: function(req, cb) {
								ctx.called.push("post");
								cb();
							},

							del: function(req, cb) {
								ctx.called.push("del");
								cb();
							}
						});
					}
				});
			},
			"/test/sub",
			function(res, body, ctx, done) {
				assert.deepEqual(ctx.called, [methods[count - 1]]);
				done();
			}
		);
	});
});