/*jshint node:true */
"use strict";

var url = require("url"),
	utils = require("./utils"),
	resource = require("./resource"),
	nativeResource = require("./native"),
	errors = require("./errors"),
	mongooseResource,

	hasMongoose = false;


try {
	require("mongoose");
	hasMongoose = true;
} catch(e) {}

if (hasMongoose) {
	mongooseResource = require("./mongoose");
}


function yarm(options) {
	options = options || {};
	options.defaultLimit = options.defaultLimit || 10;

	return function(req, res) {
		var parts = req.path.replace(/(^\/|\/$)/g, "").split("/");

		if (parts.length === 1 && parts[0] === "") {
			parts = [];
		}

		function handleError(err) {
			if (err) {
				err.code = err.code || 500;
				res.send(err.code, err.message);
					
				return true;
			}
		}


		function sendResponse(body) {
			if (body instanceof utils.ResponseFile) {
				res.type(body.mimetype);
				res.sendfile(body.path);
			} else {
				if (body === null || body === undefined) {
					handleError(errors.noContent());
					return;
				}

				if (body instanceof utils.ResponseBody) {
					res.type(body.mimetype);
					body = body.body;
				}

				if (typeof body === "number") {
					// Cast to string to avoid mistaking body for HTTP status
					body = "" + body;
				}

				// TODO look for a cleaner way to identify Readables
				if (body && typeof body._read === "function") {
					body.pipe(res);
				} else if (body) {
					res.send(body);
				}
			}
		}


		function restResult(currentObject) {
			var method = req.method.toUpperCase();

			switch(method) {
				case "GET":
				case "HEAD":
					if (currentObject.get) {
						currentObject.get(req, function(err, data) {
							if (!handleError(err)) {
								sendResponse(data);
							}
						});

						return;
					} else if (currentObject.count && currentObject.list) {
						var skip = parseInt(req.param("skip"), 10),
							limit = parseInt(req.param("limit"), 10);

						if (isNaN(skip)) {
							skip = 0;
						}
						
						if (isNaN(limit)) {
							limit = options.defaultLimit;
						}

						currentObject.count(req, function(err, count) {
							if (handleError(err)) {
								return;
							}

							currentObject.list(req, skip, limit, function(err, items) {
								if (handleError(err)) {
									return;
								}

								res.send({
									_count: count,
									_items: items
								});
							});
						});

						return;
					}

					break;

				case "PUT":
				case "PATCH":
					if (currentObject.put) {
						currentObject.put(req, method === "PATCH", function(err, data) {
							if (!handleError(err)) {
								sendResponse(data);
							}
						});

						return;
					}

					break;

				case "DELETE":
					if (currentObject.del) {
						currentObject.del(req, function(err, data) {
							if (!handleError(err)) {
								sendResponse(data);
							}
						});

						return;
					}

					break;

				case "POST":
					if (currentObject.post) {
						currentObject.post(req, function(err, data) {
							if (!handleError(err)) {
								if (data) {
									sendResponse(data);
								} else {
									handleError(errors.created());
								}
							}
						});

						return;
					}

					break;

			}

			handleError(errors.methodNotAllowed());
		}


		function restNext(currentObject) {
			if (parts.length === 0) {
				// No more path parts, result is currentObject
				restResult(currentObject);
				return;
			}

			if (!currentObject.sub) {
				// Current object doesnt support getting subpath
				handleError(errors.notFound());
				return;
			}

			currentObject.sub(parts.shift(), function(err, obj) {
				if (!err && !obj) {
					err = errors.notFound();
				}

				if (handleError(err)) {
					return;
				}

				restNext(obj);
			});
		}


		restNext(resource.rootCollection);
	};
}


/* Resource definers */
yarm.resource = resource;
yarm.nativeResource = nativeResource;

if (hasMongoose) {
	yarm.mongooseResource = mongooseResource;
}

/* Response helpers */
yarm.ResponseFile = utils.ResponseFile;
yarm.ResponseBody = utils.ResponseBody;
yarm.HTTPError = errors;

module.exports = yarm;