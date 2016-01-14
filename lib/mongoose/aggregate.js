/*jshint node:true*/
"use strict";

var queryHelpers = require("./query"),

	mongodb = require("mongodb"),
	ObjectId = mongodb.ObjectID;


/*!
 * Misc helpers
 */


/* Create an aggregate pipeline from the base pipeline, the request query if
   any, and contextual additions */
function createPipeline(req, pipeline, additions) {
	pipeline = pipeline.slice(0);

	if (req && req.query["query"]) {
		pipeline.push({ $match: queryHelpers.create(req.query["query"]) });
	}

	for (var i = 0, len = additions.length; i < len; i++) {
		pipeline.push(additions[i]);
	}

	return pipeline;
}



/*!
 * Aggregate collection helpers
 */


function aggregateCollCount(req, cb) {
	var model = req.mongoose.model;
	var pipeline = req.mongoose.pipeline;

	var args = createPipeline(req, pipeline, [
		{ $group: { _id: 0, count: { $sum: 1 } } }
	]);

	args.push(function(err, result) {
		if (err) {
			cb(err);
		} else {
			cb(null, result.length ? result[0].count : 0);
		}
	});

	model.aggregate.apply(model, args);
}


function aggregateCollList(req, offset, limit, cb) {
	var model = req.mongoose.model;
	var pipeline = req.mongoose.pipeline;

	var additions = [{ $skip: offset }];

	if (limit > 0) {
		additions.push({ $limit: limit });
	}

	var args = createPipeline(req, pipeline, additions);

	args.push(function(err, items) {
		if (err) {
			cb(err);
		} else {
			cb(null, items);
		}
	});
	model.aggregate.apply(model, args);
}



/*!
 * Aggregated document helpers
 */


function aggregateDocHook(req, next) {
	var oid, match;

	var id = req.params.projectedId;
	var pipeline = req.mongoose.pipeline;
	var model = req.mongoose.model;

	try {
		oid = new ObjectId(id);
		match = { $or: [{ "_id": id }, { "_id": oid }] };
	} catch(e) {
		// Invalid ObjectID
		match = { "_id": id };
	}

	var args = createPipeline(null, pipeline, [
		{ $match: match },
		{ $limit: 1 }
	]);

	args.push(function(err, result) {
		if (err) {
			next(err);
		} else if (result.length) {
			req.mongoose.item = result[0];
			next();
		} else {
			next();
		}
	});

	model.aggregate.apply(model, args);
}


function aggregateDocGet(req, cb) {
	if (!("item" in req.mongoose)) {
		return cb.notFound();
	}

	cb(null, req.mongoose.item);
}



/*!
 * Aggregate resource definition helper
 */


function aggregateResource(name, Model, pipeline) {
	var collResource = this.sub(name)
		.hook(function aggregateHook(req, next) {
			req.mongoose = { model: Model, pipeline: pipeline };
			next();
		})
		.count(aggregateCollCount)
		.list(aggregateCollList);

	collResource.sub(":projectedId")
		.hook(aggregateDocHook)
		.get(aggregateDocGet);

	return collResource;
}

module.exports = aggregateResource;
