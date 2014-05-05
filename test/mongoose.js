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



function assertJSON(json) {
	var data;
	try {
		data = JSON.parse(json);
	} catch(e) {
		assert.strictEqual(json, "[valid json]");
	}

	return data;
}

function assertReturnedDoc(body, doc) {
	var returned = assertJSON(body);

	// Remove properties added by mongoose
	delete returned.__v;
	delete returned._id;

	if (returned.docArray) {
		returned.docArray.forEach(function(subdoc) {
			delete subdoc._id;
		});
	}

	assert.deepEqual(returned, doc);
}


function assertEmpty(body) {
	if (body && body.length > 0) {
		assert.strictEqual(body, "[empty body]");
	}
}

function assertCreated(res, body) {
	assert.strictEqual(res.statusCode, 201);
	assert.strictEqual(body, "Created");
}


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
	}],
	array: [String],
	"url encoded/property": String
});

testSchema.virtual("description").get(function() {
	return "Document " + this.field1 + " with " + this.docArray.length + " sub-documents";
});

var TestModel = mongoose.model("test", testSchema);

/* Empty docArrays are not mandatory, but mongoose adds them anyway so
   having them here makes comparison easier */
var testData = [
	{ field1: "foo", docArray: [], array: [] },
	{ field1: "bar", field2: "baz", docArray: [], array: [] },
	{ field1: "sub", subDoc: { field: "foo" }, docArray: [], array: ["foo", "bar"] },
	{ field1: "arr", docArray: [{ field: "foo" }, { field: "bar" }, { field: "baz", sub: { field: "sub" } }], array: [] },
	{ field1: "urldecode", docArray: [], array: [], "url encoded/property": "foo" }
];



/*!
 * Test helpers
 */


/* Resource definition helpers */
function mongooseResource(name, model) {
	yarm.remove(name);
	return yarm.mongoose(name, model);
}

function aggregateResource(name, model, pipeline, options) {
	yarm.remove(name);
	return yarm.aggregate(name, model, pipeline, options);
}


/* Collection result checking helper */
function assertCollection(res, body, field1values) {
	var data = assertJSON(body);

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
	var docArray = testData[3].docArray;

	var data = assertJSON(body);

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
					assertCollection(res, body, ["foo", "bar", "sub", "arr", "urldecode"]);
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
				"should regex-compare with flags",
				queryTest.bind(null, "field1:/A/i", ["bar", "arr"])
			);

			it(
				"should negate comparisons with field!value",
				queryTest.bind(null, "field1!foo", ["bar", "arr", "sub", "urldecode"])
			);

			it(
				"should negate regex-comparisons with field!/regexp/",
				queryTest.bind(null, "field1!/a/", ["foo", "sub", "urldecode"])
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
				queryTest.bind(null, "field1:/o/ OR field2:/a/", ["foo", "bar", "urldecode"])
			);

			it(
				"should allow queries with both AND and OR operators",
				queryTest.bind(null, "field1:/o/ OR field1:/a/ AND field2:/a/", ["foo", "bar", "urldecode"])
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
					],
					array: []
				};

				request.post("/test", doc, function(res, body) {
					assertCreated(res, body);

					// Check addition to mongoose collection first
					TestModel.findOne({ field1: "add" }, function(err, item) {
						assert.ifError(err);
						assert(item);

						done();
					});
				});
			});

			it("should return POSTed documents when postResponse is true", function(done) {
				mongooseResource("test", TestModel).set("postResponse", true);
				var doc = {
					field1: "add",
					field2: "hello",
					subDoc: {
						field: "world"
					},
					docArray: [
						{ field: "a" },
						{ field: "b" }
					],
					array: [ "x", "y" ]
				};

				request.post("/test", doc, function(res, body) {
					assert.strictEqual(res.statusCode, 200);

					assertReturnedDoc(body, doc);
					done();
				});
			});

			it("should allow sorting collections", function(done) {
				mongooseResource("test", TestModel)
					.set("sort", { field1: "asc" });


				request.get("/test", function(res, body) {
					var data = assertJSON(body);
					var docs = data._items;

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
							var doc = assertJSON(body);

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
						mongooseResource("test", TestModel)
							.set("toObject", { virtuals: true });

						request.get("/test/" + item._id, function(res, body) {
							var doc = assertJSON(body);

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
						mongooseResource("test", TestModel)
							.set("key", "field1");

						request.get("/test/" + item.field1, function(res, body) {
							var doc = assertJSON(body);

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
					assertEmpty(body);
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
					assertEmpty(body);
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

			it("should URLdecode field names", function(done) {
				mongooseResource("test", TestModel);

				request.get("/test/" + testData[4]._id + "/url%20encoded%2Fproperty", function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(body, "foo");

					done();
				});
			});

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
							assertEmpty(body);
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
							assertEmpty(body);
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

			it(
				"should POST to array fields in documents",
				composeTests(testData.map(function(item) {
					return function(done) {
						mongooseResource("test", TestModel);

						request.post("/test/" + item._id + "/array", { _value: "baz" }, function(res, body) {
							assert.strictEqual(body, "Created");
							assert.strictEqual(res.statusCode, 201);

							TestModel.findById(item._id, function(err, doc) {
								assert.ifError(err);
								assert.notStrictEqual(doc.array.indexOf("baz"), -1);
								done();
							});
						});
					};
				}))
			);

			it("should DELETE array field items in documents", function(done) {
				mongooseResource("test", TestModel);

				var item = testData.filter(function(item) {
					return item.field1 === "sub";
				})[0];

				request.del("/test/" + item._id + "/array/0", function(res, body) {
					assertEmpty(body);
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.array.indexOf("foo"), -1);
						done();
					});
				});
			});
		});

		describe("Subdocuments", function() {
			it("should GET subdocuments", function(done) {
				var item = testData[2];
				mongooseResource("test", TestModel);

				request.get("/test/" + item._id + "/subDoc", function(res, body) {
					var doc = assertJSON(body);

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
					assertEmpty(body);
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

				request.put("/test/" + item._id + "/subDoc", { _value: { field: "bar" } }, function(res, body) {
					assertEmpty(body);
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
					assertEmpty(body);
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
					assertEmpty(body);
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
					var data = assertJSON(body);

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
				"should regex-compare with flags",
				queryTest.bind(null, "field:/A/i", ["bar", "baz"])
			);

			it(
				"should negate comparisons when query has field!value",
				queryTest.bind(null, "field!foo", ["bar", "baz"])
			);

			it(
				"should negate regex-comparisons when query has field!/regexp/",
				queryTest.bind(null, "field!/a/", ["foo"])
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
					assertCreated(res, body);
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

			it("should return POSTed documents when postResponse is true", function(done) {
				var item = testData[3];
				mongooseResource("test", TestModel).set("postResponse", true);

				request.post("/test/" + item._id + "/docArray", { field: "bang" }, function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assertReturnedDoc(body, { field: "bang" });

					done();
				});
			});

			it("should POST new documents to DocumentArrays at specified index", function(done) {
				var item = testData[3];
				mongooseResource("test", TestModel);

				request.post("/test/" + item._id + "/docArray?index=1", { field: "bang" }, function(res, body) {
					assertCreated(res, body);
					assert.strictEqual(res.statusCode, 201);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);

						var subs = doc.docArray.filter(function(sub) {
							return sub.field === "bang";
						});

						assert.strictEqual(subs.length, 1);
						assert.strictEqual(doc.docArray.indexOf(subs[0]), 1);
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
							var doc = assertJSON(body);

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
						mongooseResource("test", TestModel)
							.sub(":id/docArray")
							.set("subkeys", "field");

						request.get("/test/" + testData[3]._id + "/docArray/" + item.field, function(res, body) {
							var doc = assertJSON(body);

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
					assertEmpty(body);
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
					assertEmpty(body);
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
					assertEmpty(body);
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
					assertEmpty(body);
					assert.strictEqual(res.statusCode, 204);

					TestModel.findById(item._id, function(err, doc) {
						assert.ifError(err);
						assert.strictEqual(doc.docArray.id(sub._id).field, "bang");

						done();
					});
				});
			});
		});

		describe("Overrides", function() {
			it("should allow overriding documents", function(done) {
				mongooseResource("test", TestModel)
					.sub('override/property')
					.get(function(req, cb) {
						cb(null, "hello, world!");
					});

				request.get("/test/override/property", function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(body, "hello, world!");
					done();
				});
			});

			it("should allow overriding document properties", function(done) {
				var item = testData[0];
				mongooseResource("test", TestModel)
					.sub(':id/helloworld')
					.get(function(req, cb) {
						cb(null, "hello, world!");
					});

				request.get("/test/" + item._id + "/helloworld", function(res, body) {
					assert.strictEqual(res.statusCode, 200);
					assert.strictEqual(body, "hello, world!");
					done();
				});
			});
		});
	});

	describe("Aggregate resources", function() {
		var aggregatePipeline = [
				{ $project: {
					field1: 1,
					docArray: 1
				} },
				{ $unwind: "$docArray" },
				{ $project: {
					_id: "$docArray.field",
					parent: "$field1"
				} },
				{ $sort: {
					_id: -1
				} }
			];

		function aggregateTest(query, expected, done) {
			var uri = "/test";
			aggregateResource("test", TestModel, aggregatePipeline);

			if (query) {
				uri += "?query=" + encodeURIComponent(query);
			}

			request.get(uri, function(res, body) {
				assert.strictEqual(res.statusCode, 200);

				var data = assertJSON(body);
				assert.strictEqual(typeof data, "object");
				assert.strictEqual(data._count, expected.length);
				assert(Array.isArray(data._items));
				assert.strictEqual(data._items.length, expected.length);
				assert.deepEqual(
					data._items.map(function(item) {
						return item._id;
					}),
					expected
				);

				done();
			});
		}

		it(
			"should GET aggregates as collections",
			aggregateTest.bind(null, "", [ "foo", "baz", "bar" ])
		);

		it(
			"should compare fields when query has field:value",
			aggregateTest.bind(null, "_id:foo", ["foo"])
		);

		it(
			"should regex-compare fields when query has field:/regexp/",
			aggregateTest.bind(null, "_id:/a/", ["baz", "bar"])
		);

		it(
			"should regex-compare with flags",
			aggregateTest.bind(null, "_id:/A/i", ["baz", "bar"])
		);

		it(
			"should negate comparisons when query has field!value",
			aggregateTest.bind(null, "_id!foo", ["baz", "bar"])
		);

		it(
			"should negate regex-comparisons when query has field!/regexp/",
			aggregateTest.bind(null, "_id!/a/", ["foo"])
		);

		it(
			"should allow queries with AND operators",
			aggregateTest.bind(null, "_id:/a/ AND parent:arr", ["baz", "bar"])
		);

		it(
			"should allow queries with OR operators",
			aggregateTest.bind(null, "_id:/a/ OR _id:/o/", ["foo", "baz", "bar"])
		);

		it(
			"should allow queries with both AND and OR operators",
			aggregateTest.bind(null, "parent:/r/ OR _id:/a/ AND _id:/b/", ["foo", "baz", "bar"])
		);

		it("should GET agregated documents with their projected _id", function(done) {
			aggregateResource("test", TestModel, aggregatePipeline);

			request.get("/test/bar", function(res, body) {
				assert.strictEqual(res.statusCode, 200);
				var doc = assertJSON(body);
				assert.strictEqual(typeof doc, "object");
				assert.strictEqual(doc._id, "bar");
				assert.strictEqual(doc.parent, "arr");

				done();
			});
		});

		it("should 404 on nonexistent aggregated documents", function(done) {
			aggregateResource("test", TestModel, aggregatePipeline);

			request.get("/test/nope", function(res, body) {
				assert.strictEqual(res.statusCode, 404);
				assert.strictEqual(body, "Not found");

				done();
			});
		});

		it("should allow defining custom subresources", function(done) {
			aggregateResource("test", TestModel, aggregatePipeline)
				.sub(":id/foo")
				.get(function(req, cb) {
					cb(null, "I'm foo inside " + req.mongoose.item._id);
				});

			request.get("/test/bar/foo", function(res, body) {
				assert.strictEqual(res.statusCode, 200);
				assert.strictEqual(body, "I'm foo inside bar");
				done();
			});
		});
	});
});