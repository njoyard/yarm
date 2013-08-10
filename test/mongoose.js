/*jshint node:true */
/*global describe, it, before, after, beforeEach, afterEach */

"use strict";

var mongoose = require("mongoose"),
	assert = require("assert"),
	yarm = require("../index.js"),
	common = require("./common"),

	request = common.request,
	callbackTests = common.callbackTests,
	allMethods = common.allMethods,
	composeTests = common.composeTests;



/*!
 * Test data
 */


var testSchema = new mongoose.Schema({
	field1: String,
	field2: String,
	subDoc: {
		field: String
	},
	docArray: [{
		field: String,
		sub: {
			field: String
		}
	}]
});

testSchema.virtual("description").get(function() {
	return "Document " + this.field1 + " with " + this.docArray.length + " sub-documents";
});

var TestModel = mongoose.model("test", testSchema);

/* Empty docArrays are not mandatory, but mongoose adds them anyway so
   having them here makes comparison easier */
var testData = [
	{ field1: "foo", docArray: [] },
	{ field1: "bar", field2: "baz", docArray: [] },
	{ field1: "sub", subDoc: { field: "foo" }, docArray: [] },
	{ field1: "arr", docArray: [{ field: "foo" }, { field: "bar" }, { field: "baz", sub: { field: "sub" } }] }
];



/*!
 * Test helpers
 */


/* Resource definition helper */
function mongooseResource(name, model, options) {
	yarm.resource.remove(name);
	yarm.mongooseResource(name, model, options);
}


/* Collection result checking helper */
function assertCollection(res, body, field1values) {
	var data = JSON.parse(body);

	// Basic response check
	assert.strictEqual(res.statusCode, 200);
	assert.strictEqual(typeof data, "object");
	assert.strictEqual(data._count, field1values.length);
	assert(Array.isArray(data._items));
	assert.strictEqual(data._items.length, field1values.length);

	// Find expected objects in testData
	var expected = {};
	testData.forEach(function(doc) {
		if (field1values.indexOf(doc.field1) !== -1) {
			expected[doc.field1] = doc;
		}
	});

	// Check that all items are expected
	data._items.forEach(function(doc) {
		assert(doc.field1 in expected);

		// Cleanup fields before comparing
		delete doc.__v;
		delete doc._href;
		if (doc.subDoc) {
			delete doc.subDoc._href;
		}
		doc.docArray.forEach(function(subdoc) {
			delete subdoc._href;
			if (subdoc.sub) {
				delete subdoc.sub._href;
			}
		});

		assert.deepEqual(doc, expected[doc.field1]);
	});
}


/* DocumentArray collection result checking helper */
function assertDocArrayCollection(res, body, fieldvalues) {
	var docArray = testData[3].docArray,
		data = JSON.parse(body);

	// Basic response check
	assert.strictEqual(res.statusCode, 200);
	assert.strictEqual(typeof data, "object");
	assert.strictEqual(data._count, fieldvalues.length);
	assert(Array.isArray(data._items));
	assert.strictEqual(data._items.length, fieldvalues.length);


	// Find expected objects in testData
	var expected = {};
	docArray.forEach(function(doc) {
		if (fieldvalues.indexOf(doc.field) !== -1) {
			expected[doc.field] = doc;
		}
	});

	// Check that all items are expected
	data._items.forEach(function(doc) {
		assert(doc.field in expected);

		// Cleanup fields before comparing
		delete doc.__v;
		delete doc._href;

		assert.deepEqual(doc, expected[doc.field]);
	});
}


/*!
 * Test definitions
 */


describe("Mongoose resources", function() {
	// Connect once before all tests
	before(function(done) {
		mongoose.connect("mongodb://localhost/yarmTest", function(err) {
			done(err);
		});
	});


	// Drop database and disconnect once after all tests
	after(function(done) {
		mongoose.connection.db.dropDatabase(function(err) {
			if (err) {
				done(err);
			} else {
				mongoose.disconnect(function(err) {
					done(err);
				});
			}
		});
	});


	// Create data before each test
	beforeEach(function(done) {
		var copy = [];

		function saveNext() {
			var data = testData.shift();

			if (!data) {
				testData = copy;
				done();
				return;
			}

			copy.push(data);

			var doc = new TestModel(data);
			doc.save(function(err) {
				if (err) {
					done(err);
				} else {
					TestModel.findOne({ field1: doc.field1 }, function(err, found) {
						if (err) {
							done(err);
						} else if (!found) {
							done(new Error("Previousy saved document was not found again"));
						} else {
							/* Grab saved _ids */
							data._id = found._id.toString();

							if (data.docArray) {
								data.docArray.forEach(function(sub, index) {
									sub._id = found.docArray[index]._id.toString();
								});
							}

							saveNext();
						}
					});
				}
			});
		}

		saveNext();
	});


	// Drop data after each test
	afterEach(function(done) {
		TestModel.remove(function(err) {
			done(err);
		});
	});


	describe("Model resources", function() {
		describe("Model collections", function() {
			it("should GET collections", function(done) {
				mongooseResource("test", TestModel);

				request.get("/test", function(res, body) {
					assertCollection(res, body, ["foo", "bar", "sub", "arr"]);
					done();
				});
			});

			function queryTest(query, expected, done) {
				mongooseResource("test", TestModel);

				request.get("/test?query=" + encodeURIComponent(query), function(res, body) {
					assertCollection(res, body, expected);
					done();
				});
			}

			it(
				"should compare fields when query has field:value",
				queryTest.bind(null, "field1:foo", ["foo"])
			);

			it(
				"should regex-compare fields when query has field:/regexp/",
				queryTest.bind(null, "field1:/a/", ["bar", "arr"])
			);

			it(
				"should allow queries on sub-fields",
				queryTest.bind(null, "subDoc.field:foo", ["sub"])
			);

			it(
				"should allow queries with AND operators",
				queryTest.bind(null, "field1:/a/ AND field2:baz", ["bar"])
			);

			it(
				"should allow queries with OR operators",
				queryTest.bind(null, "field1:/o/ OR field2:/a/", ["foo", "bar"])
			);

			it(
				"should allow queries with both AND and OR operators",
				queryTest.bind(null, "field1:/o/ OR field1:/a/ AND field2:/a/", ["foo", "bar"])
			);

			it("should POST new documents to collections", function(done) {
				mongooseResource("test", TestModel);
				var doc = {
					field1: "add",
					field2: "hello",
					subDoc: {
						field: "world"
					},
					docArray: [
						{ field: "a" },
						{ field: "b" }
					]
				};

				request.post("/test", doc, function(res, body) {
					var rdoc = JSON.parse(body);
					assert.strictEqual(res.statusCode, 200);

					// Check addition to mongoose collection first
					TestModel.findOne({ field1: "add" }, function(err, item) {
						assert.ifError(err);
						assert(item);

						// Add IDs to original doc
						doc._id = item._id.toString();
						item.docArray.forEach(function(subitem, index) {
							doc.docArray[index]._id = subitem._id.toString();
						});

						delete rdoc.__v;

						// Check returned document
						assert.deepEqual(rdoc, doc);
						done();
					});
				});
			});

			it("should allow sorting collections", function(done) {
				mongooseResource("test", TestModel, {
					sort: { field1: "asc" }
				});


				request.get("/test", function(res, body) {
					var docs = JSON.parse(body)._items;

					assert.strictEqual(docs[0].field1, "arr");
					assert.strictEqual(docs[1].field1, "bar");
					assert.strictEqual(docs[2].field1, "foo");
					assert.strictEqual(docs[3].field1, "sub");
					done();
				});
			});
		});

		describe("Documents", function() {
			it(
				"should GET documents in collection",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.get("/test/" + item._id, function(res, body) {
							var doc = JSON.parse(body);

							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(typeof doc, "object");

							/* Remove additional properties before comparing */
							delete doc.__v;
							delete doc._href;
							if (doc.docArray) {
								doc.docArray.forEach(function(sub) {
									delete sub._href;
								});
							}

							assert.deepEqual(doc, item);

							done();
						});
					};
				}))
			);

			it(
				"should allow setting mongoose toObject options",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel, {
							toObject: { virtuals: true }
						});

						request.get("/test/" + item._id, function(res, body) {
							var doc = JSON.parse(body);

							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(typeof doc, "object");

							/* Remove additional properties before comparing */
							delete doc.__v;
							delete doc._href;
							if (doc.docArray) {
								doc.docArray.forEach(function(sub) {
									delete sub._href;
								});
							}

							assert.strictEqual(
								doc.description,
								"Document " + item.field1 + " with " + item.docArray.length + " sub-documents"
							);

							done();
						});
					};
				}))
			);

			it("should 404 on nonexistent documents", function(done) {
				mongooseResource("test", TestModel);

				request.get("/test/nonexistent", function(res, body) {
					assert.strictEqual(res.statusCode, 404);
					assert.strictEqual(body, "Not found");

					done();
				});
			});

			it(
				"should allow specifying an alternate primary key",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel, { key: "field1" });

						request.get("/test/" + item.field1, function(res, body) {
							var doc = JSON.parse(body);

							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(typeof doc, "object");

							/* Remove additional properties before comparing */
							delete doc.__v;
							delete doc._href;
							if (doc.docArray) {
								doc.docArray.forEach(function(sub) {
									delete sub._href;
								});
							}

							assert.deepEqual(doc, item);

							done();
						});
					};
				}))
			);

			it("should DELETE documents", function(done) {
				var item = testData[0];
				mongooseResource("test", TestModel);

				request.del("/test/" + item._id, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.find({ _id: item._id }, function(err, items) {
						assert.ifError(err);
						assert.strictEqual(items.length, 0);
						done();
					});
				});
			});

			it("should PUT documents", function(done) {
				var item = testData[0];
				mongooseResource("test", TestModel);

				request.put("/test/" + item._id, { field2: "bar" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.field1, "foo");
						assert.strictEqual(doc.field2, "bar");
						done();
					});
				});
			});
		});

		describe("Document fields", function() {
			it(
				"should GET fields from documents",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.get("/test/" + item._id + "/field1", function(res, body) {
							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(body, item.field1);

							done();
						});
					};
				}))
			);

			it("should 404 on nonexistent document fields", function(done) {
				mongooseResource("test", TestModel);

				request.get("/test/" + testData[0]._id + "/nonexistent", function(res, body) {
					assert.strictEqual(res.statusCode, 404);
					assert.strictEqual(body, "Not found");

					done();
				});
			});

			it(
				"should DELETE field values in documents",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.del("/test/" + item._id + "/field1", function(res, body) {
							assert.strictEqual(res.statusCode, 204);

							TestModel.findById(item._id, function(err, doc) {
								assert.strictEqual(doc.field1, undefined);
								done();
							});
						});
					};
				}))
			);

			it(
				"should PUT field values in documents",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.put("/test/" + item._id + "/field1", { _value: "newValue" }, function(res, body) {
							assert.strictEqual(res.statusCode, 204);

							TestModel.findById(item._id, function(err, doc) {
								assert.ifError(err);
								assert.strictEqual(doc.field1, "newValue");
								done();
							});
						});
					};
				}))
			);
		});

		describe("Subdocuments", function() {
			it("should GET subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.get("/test/" + item._id + "/subDoc", function(res, body) {
					var doc = JSON.parse(body);

					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(typeof doc, "object");

					delete doc._href;
					assert.deepEqual(doc, item.subDoc);

					done();
				});
			});

			it("should DELETE subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.del("/test/" + item._id + "/subDoc", function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);

						// Mongoose limitation: subDoc is still present but empty
						assert.strictEqual(doc.subDoc.field, undefined);
						done();
					});
				});
			});

			it("should PUT subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.put("/test/" + item._id + "/subDoc", { field: "bar" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.subDoc.field, "bar");

						done();
					});
				});
			});
		});
		
		describe("Subdocument fields", function() {
			it("should GET fields in subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.get("/test/" + item._id + "/subDoc/field", function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assert.deepEqual(body, item.subDoc.field);

					done();
				});
			});

			it("should DELETE fields in subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.del("/test/" + item._id + "/subDoc/field", function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.subDoc.field, undefined);

						done();
					});
				});
			});


			it("should PUT field values in subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.put("/test/" + item._id + "/subDoc/field", { _value: "newValue" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.subDoc.field, "newValue");
						done();
					});
				});
			});
		});

		describe("DocumentArray collections", function() {
			it("should GET DocumentArrays as collections", function(done) {
				var item = testData[3];
				mongooseResource("test", TestModel);

				request.get("/test/" + item._id + "/docArray", function(res, body) {
					var data = JSON.parse(body);

					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(typeof data, "object");
					assert.strictEqual(data._count, item.docArray.length);
					assert(Array.isArray(data._items));
					assert.strictEqual(data._items.length, item.docArray.length);

					item.docArray.forEach(function(doc) {
						var found = false;

						data._items.forEach(function(rdoc) {
							if (rdoc.field1 === doc.field1) {
								found = true;
							}
						});

						assert(found);
					});

					done();
				});
			});

			function queryTest(query, expected, done) {
				var item = testData[3];
				mongooseResource("test", TestModel);

				request.get("/test/" + item._id + "/docArray?query=" + encodeURIComponent(query), function(res, body) {
					assertDocArrayCollection(res, body, expected);
					done();
				});
			}

			it(
				"should compare fields when query has field:value",
				queryTest.bind(null, "field:foo", ["foo"])
			);

			it(
				"should regex-compare fields when query has field:/regexp/",
				queryTest.bind(null, "field:/a/", ["bar", "baz"])
			);

			it(
				"should allow queries on sub-fields",
				queryTest.bind(null, "sub.field:sub", ["baz"])
			);

			it(
				"should allow queries with AND operators",
				queryTest.bind(null, "field:/a/ AND field:/^b/", ["bar", "baz"])
			);

			it(
				"should allow queries with OR operators",
				queryTest.bind(null, "field:/o/ OR field:/a/", ["foo", "bar", "baz"])
			);

			it(
				"should allow queries with both AND and OR operators",
				queryTest.bind(null, "field:/o/ OR field:/z/ AND field:/^b/", ["foo", "baz"])
			);

			it("should POST new documents to DocumentArray collections", function(done) {
				var item = testData[3];
				mongooseResource("test", TestModel);

				request.post("/test/" + item._id + "/docArray", { field: "bang" }, function(res, body) {
					assert.strictEqual(res.statusCode, 201);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);

						var subs = doc.docArray.filter(function(sub) {
							return sub.field === "bang";
						});

						assert.strictEqual(subs.length, 1);
						done();
					});
				});
			});
		});

		describe("DocumentArray documents", function() {
			it("should GET documents in DocumentArrays",
				composeTests(testData[3].docArray.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.get("/test/" + testData[3]._id + "/docArray/" + item._id, function(res, body) {
							var doc = JSON.parse(body);

							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(typeof doc, "object");

							/* Remove additional properties before comparing */
							delete doc.__v;
							delete doc._href;

							assert.deepEqual(doc, item);

							done();
						});
					};
				}))
			);

			it(
				"should allow specifying an alternate primary key on collection paths",
				composeTests(testData[3].docArray.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel, {
							key: {
								"test/$/docArray": "field"
							}
						});

						request.get("/test/" + testData[3]._id + "/docArray/" + item.field, function(res, body) {
							var doc = JSON.parse(body);

							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(typeof doc, "object");

							/* Remove additional properties before comparing */
							delete doc.__v;
							delete doc._href;

							assert.deepEqual(doc, item);

							done();
						});
					};
				}))
			);

			it("should DELETE documents in DocumentArray collections", function(done) {
				var item = testData[3],
					sub = item.docArray[0];

				mongooseResource("test", TestModel);

				request.del("/test/" + item._id + "/docArray/" + sub._id, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.docArray.id(sub._id), null);

						done();
					});
				});
			});

			it("should PUT documents in DocumentArray collections", function(done) {
				var item = testData[3],
					sub = item.docArray[0];

				mongooseResource("test", TestModel);

				request.put("/test/" + item._id + "/docArray/" + sub._id, { field: "bang" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.docArray.id(sub._id).field, "bang");

						done();
					});
				});
			});
		});
		
		describe("DocumentArray document fields", function() {
			it("should GET fields in documents in DocumentArrays",
				composeTests(testData[3].docArray.map(function(item, index) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.get("/test/" + testData[3]._id + "/docArray/" + item._id + "/field", function(res, body) {
							assert.strictEqual(res.statusCode, 200);
							assert.strictEqual(body, testData[3].docArray[index].field);

							done();
						});
					};
				}))
			);

			it("should DELETE fields in documents in DocumentArrays", function(done) {
				var item = testData[3],
					sub = item.docArray[0];

				request.del("/test/" + item._id + "/docArray/" + sub._id + "/field", function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.docArray.id(sub._id).field, undefined);

						done();
					});
				});
			});

			it("should PUT fields in documents in DocumentArrays", function(done) {
				var item = testData[3],
					sub = item.docArray[0];

				request.put("/test/" + item._id + "/docArray/" + sub._id + "/field", { _value: "bang" }, function(res, body) {
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.docArray.id(sub._id).field, "bang");

						done();
					});
				});
			});
		});

		describe("Method overrides", function() {
			it("should allow method overrides on model collections", function(done) {
				var called = false;

				mongooseResource("test", TestModel, {
					overrides: {
						"test": {
							get: function(model, req, cb) {
								called = true;
								cb();
							}
						}
					}
				});

				request.get("/test", function(res, body) {
					assert(called);
					done();
				});
			});

			it("should pass the Model to method overrides on model collections", function(done) {
				var arg;

				mongooseResource("test", TestModel, {
					overrides: {
						"test": {
							get: function(model, req, cb) {
								arg = model;
								cb();
							}
						}
					}
				});

				request.get("/test", function(res, body) {
					assert.strictEqual(arg, TestModel);
					done();
				});
			});


			it("should allow matching any single path element with $ in an override path", function(done) {
				var called = false;

				mongooseResource("test", TestModel, {
					overrides: {
						"test/$/field1": {
							get: function(chain, req, cb) {
								called = true;
								cb();
							}
						}
					}
				});

				request.get("/test/" + testData[0]._id + "/field1", function(res, body) {
					assert(called);
					done();
				});
			});

			it("should allow matching multiple path elements with * in an override path", function(done) {
				var called = false;

				mongooseResource("test", TestModel, {
					overrides: {
						"test/*/field": {
							get: function(chain, req, cb) {
								called = true;
								cb();
							}
						}
					}
				});

				request.get("/test/" + testData[2]._id + "/subDoc/field", function(res, body) {
					assert(called);
					done();
				});
			});

			it("should pass the full object chain to override methods", function(done) {
				var arg;

				mongooseResource("test", TestModel, {
					overrides: {
						"test/*/field": {
							get: function(chain, req, cb) {
								arg = chain;
								cb();
							}
						}
					}
				});

				request.get("/test/" + testData[2]._id + "/subDoc/field", function(res, body) {
					assert.strictEqual(arg.length, 3);
					assert.strictEqual(arg[0], TestModel);
					assert.strictEqual(arg[1]._id.toString(), testData[2]._id);
					assert.strictEqual(arg[2], testData[2].subDoc.field);
					done();
				});
			});
		});
	});
});