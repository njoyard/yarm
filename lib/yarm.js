/*jshint node:true */
"use strict";

var root = require("./root"),
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
				sendFile(req, res, path, mime);
			}
		};

		cb.status = function(code, body) {
			handleError(req, res, httpStatus(code, body));
		};

		cb.list = function(counter, lister) {
			sendListResponse(req, res, counter, lister);
		};

		httpStatus.names.forEach(function(name) {
			cb[name] = function() {
				handleError(req, res, httpStatus[name]());
			};
		});

		return cb;
	}

	function sendFile(req, res, path, mime) {
		if (mime) {
			res.type(mime);
		}

		res.sendfile(path);
	}


	function sendResponse(req, res, body, mime) {
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


	function sendListResponse(req, res, counter, lister) {
		var skip = parseInt(req.param("skip"), 10),
			limit = parseInt(req.param("limit"), 10);

		if (isNaN(skip)) {
			skip = 0;
		}
		
		if (isNaN(limit)) {
			limit = options.defaultLimit;
		}

		counter(req, function(err, count) {
			if (handleError(req, res, err)) {
				return;
			}

			lister(req, skip, limit, function(err, items) {
				if (handleError(req, res, err)) {
					return;
				}

				res.send({
					_count: count,
					_items: items
				});
			});
		});
	}


	function restResult(req, res, currentSpec) {
		var method = req.method.toUpperCase();

		switch(method) {
			case "GET":
			case "HEAD":
				if (currentSpec.get) {
					return currentSpec.get(req, makeCallback(req, res));
				} else if (currentSpec.count && currentSpec.list) {
					return sendListResponse(req, res, currentSpec.count, currentSpec.list);
				}

				break;

			case "PUT":
			case "PATCH":
				if (currentSpec.put) {
					return currentSpec.put(req, method === "PATCH", makeCallback(req, res));
				}

				break;

			case "DELETE":
				if (currentSpec.del) {
					return currentSpec.del(req, makeCallback(req, res));
				}

				break;

			case "POST":
				if (currentSpec.post) {
					return currentSpec.post(req, makeCallback(req, res));
				}

				break;

		}

		(makeCallback(req, res)).methodNotAllowed();
	}

	return function(req, res) {
		var data = root.match(req);

		function nextHook(err) {
			if (err) {
				handleError(req, res, err);
				return;
			}

			var hook = data.hooks.shift();

			if (hook) {
				try {
					hook.call(null, req, nextHook);
				} catch(e) {
					nextHook(e);
				}
			} else {
				restResult(req, res, data.spec);
			}
		}

		httpStatus.names.forEach(function(name) {
			nextHook[name] = function() {
				nextHook(httpStatus[name]());
			};
		});

		if (data.spec) {
			data.hooks = data.hooks || [];
			nextHook();
		} else {
			handleError(req, res, httpStatus.notFound());
		}
	};
}


/* Resource definers */
yarm.resource = function(name) {
	return root.sub(name);
};
yarm.remove = function(name) {
	root.remove(name);
};


yarm.native = nativeResource;

if (hasMongoose) {
	yarm.mongoose = mongooseResource;
}


module.exports = yarm;