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


var testSchema = new mongoose.Schema({
	field1: String,
	field2: String,
	subDoc: {
		field: String
	},
	docArray: [{
		field: String
	}]
});

var TestModel = mongoose.model("test", testSchema);

var testData = [
	{ field1: "foo", docArray: [] },
	{ field1: "bar", field2: "baz", docArray: [] },
	{ field1: "sub", subDoc: { field: "foo" }, docArray: [] },
	{ field1: "arr", docArray: [{ field: "foo" }, { field: "bar" }, { field: "baz" }] }
];


function mongooseResource(name, model, options) {
	yarm.resource.remove(name);
	yarm.mongooseResource(name, model, options);
}


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
		it("should GET collections", function(done) {
			mongooseResource("test", TestModel);

			request.get("/test", function(res, body) {
				var data = JSON.parse(body);

				assert.strictEqual(res.statusCode, 200);
				assert.strictEqual(typeof data, "object");
				assert.strictEqual(data._count, testData.length);
				assert(Array.isArray(data._items));
				assert.strictEqual(data._items.length, testData.length);

				testData.forEach(function(doc) {
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

		it("should GET subdocuments", function(done) {
			var item = testData[2];
			mongooseResource("test", TestModel);

			request.get("/test/" + item._id + "/subDoc", function(res, body) {
				var doc = JSON.parse(body);

				assert.strictEqual(res.statusCode, 200);
				assert.strictEqual(typeof doc, "object");

				assert.deepEqual(doc, item.subDoc);

				done();
			});
		});

		it("should GET fields in subdocuments");

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

		it("should GET fields in documents in DocumentArrays");
	});
});