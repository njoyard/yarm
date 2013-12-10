/*jshint node:true */
"use strict";

var resource = require("./resource"),
	nativeResource = require("./native"),
	httpStatus = require("./httpStatus");


var mongooseResource,
	hasMongoose = false;

try {
	require("mongoose");
	hasMongoose = true;
} catch(e) {}

if (hasMongoose) {
	mongooseResource = require("./mongoose");
}


var statuses = {
		created: { code: 201, body: "Created" },
		noContent: { code: 204, body: "" },
		notFound: { code: 404, body: "Not found" },
		methodNotAllowed: { code: 405, body: "Method not allowed" },
		notImplemented: { code: 501, body: "Not implemented"}
	};


function yarm(options) {
	options = options || {};
	options.defaultLimit = options.defaultLimit || 10;
	options.errorStack = options.errorStack || false;


	function handleError(req, res, err) {
		if (err) {
			err.code = err.code || 500;
			res.send(err.code, options.errorStack ? err.stack : err.message);
			return true;
		}
	}

	function makeCallback(req, res) {
		function cb(err, body, mime) {
			if (!handleError(req, res, err)) {
				sendResponse(req, res, body, mime);
			}
		}

		cb.file = function(err, path, mime) {
			if (!handleError(req, res, err)) {
				sendResponse(req, res, null, mime, path);
			}
		};

		cb.status = function(code, body) {
			handleError(req, res, httpStatus(code, body));
		};

		httpStatus.names.forEach(function(name) {
			cb[name] = function() {
				handleError(req, res, httpStatus[name]());
			};
		});

		return cb;
	}


	function sendResponse(req, res, body, mime, path) {
		if (path) {
			if (mime) {
				res.type(mime);
			}

			res.sendfile(path);
		} else {
			if (body === null || body === undefined) {
				handleError(req, res, httpStatus.noContent());
				return;
			}
			
			if (mime) {
				res.type(mime);
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


	function restResult(req, res, currentSpec) {
		var method = req.method.toUpperCase();

		switch(method) {
			case "GET":
			case "HEAD":
				if (currentSpec.get) {
					currentSpec.get(req, makeCallback(req, res));

					return;
				} else if (currentSpec.count && currentSpec.list) {
					var skip = parseInt(req.param("skip"), 10),
						limit = parseInt(req.param("limit"), 10);

					if (isNaN(skip)) {
						skip = 0;
					}
					
					if (isNaN(limit)) {
						limit = options.defaultLimit;
					}

					currentSpec.count(req, function(err, count) {
						if (handleError(err)) {
							return;
						}

						currentSpec.list(req, skip, limit, function(err, items) {
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
				if (currentSpec.put) {
					currentSpec.put(req, method === "PATCH", makeCallback(req, res));
					return;
				}

				break;

			case "DELETE":
				if (currentSpec.del) {
					currentSpec.del(req, makeCallback(req, res));

					return;
				}

				break;

			case "POST":
				if (currentSpec.post) {
					currentSpec.post(req, makeCallback(req, res));
					return;
				}

				break;

		}

		(makeCallback(req, res)).methodNotAllowed();
	}


	function restNext(req, res, currentSpec) {
		if (req.yarmParts.length === 0) {
			// No more path parts, result is currentSpec
			restResult(req, res, currentSpec);
			return;
		}

		currentSpec.sub(req.yarmParts.shift(), function(err, obj) {
			if (!err && !obj) {
				err = httpStatus.notFound();
			}

			if (handleError(req, res, err)) {
				return;
			}

			restNext(req, res, obj.spec);
		});
	}

	return function(req, res) {
		var parts = req.path.replace(/(^\/|\/$)/g, "").split("/").map(decodeURIComponent);

		if (parts.length === 1 && parts[0] === "") {
			parts = [];
		}

		req.yarmParts = parts;
		restNext(req, res, resource.rootCollection.spec);
	};
}


/* Resource definers */
yarm.resource = resource;
yarm.nativeResource = nativeResource;

if (hasMongoose) {
	yarm.mongooseResource = mongooseResource;
}


module.exports = yarm;