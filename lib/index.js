/*jshint node:true */
"use strict";

var config = require("../config").server,
	utils = require("./utils"),
	resource = require("./resource"),
	arrayResource = require("./array"),
	objectResource = require("./object"),
	mongooseResource = require("./mongoose"),

	rootCollection = objectResource.make(resource.resources);


/* 
	This module works with what I'd call "REST resource objects". A REST resource
	object can be either a "document" or a "collection".  Collection objects are
	distinguished from document objects in that they have a truthy `isCollection`
	property.  They may both have a `sub` method that is used to handle requests
	on sub-paths of the resource object URL.

		sub(subpath, callback)
			Called to handle requests on <resource URI>/<subpath>[/...].  It must
			call `callback` with an optional Error object and a new resource object
			as parameters.  The error object may have a `code` property, in which
			case its value is used as a response code for the request, and its
			`message` property is used as a status message.

	Handling a URL works by splitting the path components after the "/rest/" prefix,
	and keeping a "current REST resource object", which is initialized with the
	`RootCollection` object.  This particular resource object is a collection
	containing all defined "root" resources.  For each path component, the current
	resource object is replaced by what is returned by calling its `sub` method
	with the path component as parameter.  For example, handling a request on
	"/rest/users/alice/posts/42" works as follows:

		// restObject is the "current REST ressource object" here
		restObject = RootCollection;

		restObject.sub("users", function(err, UsersCollection) {
			// /rest/users => UsersCollection
			restObject = UsersCollection;

			restObject.sub("alice", function(err, alice) {
				// /rest/users/alice => alice
				restObject = alice;

				restObject.sub("posts", function(err, AlicePostsCollection) {
					// /rest/users/alice/posts => AlicePostsCollection
					restObject = AlicePostsCollection;

					restObject.sub("42", function(err, alicesPost42) {
						// /rest/users/alice/posts/42 => alicesPost42
						restObject = alicesPost42;

						// Done walking URL, we can handle the actual request
					})
				})
			});
		};

	When path components are exhausted, the current REST resource object is the
	resource the request expects to work with.  If any of the `sub` calls fails
	(including the case when the current object does not have a `sub` method), a 404
	"Not found" response is sent to the client (or an alternative status code and
	message if specified in the first argument to the callback called by `sub`). 
	Otherwise the request is handled using the current object methods.  When the
	methods needed to handle a particular request are not available, a 405 "Method
	not allowed" response is sent to the client.

	Handling GET or HEAD requests on collections need the following two methods:

		count(req, callback)
			Called to request the number of items in the collection.  It must
			call `callback` with an optional Error object and the number of items
			as parameters.  The error object may have a `code` property, in which
			case its value is used as a response code for the request, and its
			`message` property is used as a status message.

		list(req, offset, limit, callback)
			Called to request items `offset` to `offset + limit` in the collection.
			When `limit` is zero, `list` should fetch items until the end of the
			collection.  It must call `callback` with an optional Error object and
			an array of items as parameters.  The error object may have a `code`
			property, in which case its value is used as a response code for the
			request, and its `message` property is used as a status message.  Items
			must be returned as plain objects.

	Handling GET or HEAD requests on documents need a `get` method:

		get(req, callback)
			Called to request the resource body to send to the client.  It must call
			`callback` with an optional Error object and the resource body as
			parameters.  The error object may have a `code` property, in which case
			its value is used as a response code for the request, and its `message`
			property is used as a status message.

			The resource body passed to the callback may be:
			- an object to be sent as application/json
			- a String, Buffer or readable stream
			- new rest.ResponseBody(Buffer|String|readable stream, mimetype)
			- new rest.ResponseFile(path, mimetype)

	Handling POST requests on collections need a `post` method:

		post(req, data, callback)
			Called to request adding a new resource to the collection.  It must call
			`callback` with an optional Error object and the response body as
			parameters.  The error object may have a `code` property, in which case
			its value is used as a response code for the request, and its `message`
			property is used as a status message.

			The resource body passed to the callback may be:
			- an object to be sent as application/json
			- a String, Buffer or readable stream
			- new rest.ResponseBody(Buffer|String|readable stream, mimetype)
			- new rest.ResponseFile(path, mimetype)

	Handling PUT and PATCH requests on documents need a `put` method:

		put(req, data, patch, callback)
			Called to request updating or replacing a resource.  The `patch` argument
			is true when updating is requested (PATCH request).  It must call
			`callback` with an optional Error object and the response body as
			parameters.  The error object may have a `code` property, in which case
			its value is used as a response code for the request, and its `message`
			property is used as a status message.

			The resource body passed to the callback may be:
			- an object to be sent as application/json
			- a String, Buffer or readable stream
			- new rest.ResponseBody(Buffer|String|readable stream, mimetype)
			- new rest.ResponseFile(path, mimetype)


	Handling DELETE requests on documents need a `del` method:

		del(req, callback)
			Called to request removing a resource.  It must call `callback` with an
			optional Error object and the response body as parameters.  The error
			object may have a `code` property, in which case its value is used as a
			response code for the request, and its `message` property is used as a
			status message.

			The resource body passed to the callback may be:
			- an object to be sent as application/json
			- a String, Buffer or readable stream
			- new rest.ResponseBody(Buffer|String|readable stream, mimetype)
			- new rest.ResponseFile(path, mimetype)
 */




function rest(req, res) {
	var parts = req.path.replace(/(^\/|\/$)/g, "").split("/");

	if (parts.length === 1 && parts[0] === "") {
		parts = [];
	}

	function notFound() {
		var err = new Error("Not found");
		err.code = 404;
		return err;
	}

	function notAllowed() {
		var err = new Error("Not allowed");
		err.code = 405;
		return err;
	}

	function handleError(err) {
		if (err) {
			err.code = err.code || 500;

			if (req.accepts("text, json") === "json") {
				res.send(err.code, { _error: err.code, _message: err.message });
			} else {
				res.send(err.code, err.message);
			}
			
			return true;
		}
	}

	function sendResponse(body) {
		if (body instanceof utils.ResponseFile) {
			res.type(body.mimetype);
			res.sendfile(body.path);
		} else {
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
				res.pipe(body);
			} else {
				res.send(body);
			}
		}
	}

	function restResult(currentObject) {
		var method = req.method.toUpperCase();

		if (currentObject.isCollection) {
			switch (method) {
				case "GET":
				case "HEAD":
					if (currentObject.count && currentObject.list) {
						var skip = parseInt(req.param("skip"), 10),
							limit = parseInt(req.param("limit"), 10);

						if (isNaN(skip)) {
							skip = 0;
						}
						
						if (isNaN(limit)) {
							limit = config.rest.defaultLimit;
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

				case "POST":
					if (currentObject.post) {
						currentObject.post(req, req.body, function(err, data) {
							if (!handleError(err)) {
								sendResponse(data);
							}
						});

						return;
					}

					break;
			}
		} else {
			switch (method) {
				case "GET":
				case "HEAD":
					if (currentObject.get) {
						currentObject.get(req, function(err, data) {
							if (!handleError(err)) {
								sendResponse(data);
							}
						});

						return;
					}

					break;

				case "PUT":
				case "PATCH":
					if (currentObject.put) {
						currentObject.put(req, req.body, method === "PATCH", function(err, data) {
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
			}
		}

		handleError(notAllowed());
	}

	function restNext(currentObject) {
		if (parts.length === 0) {
			// No more path parts, result is currentObject
			restResult(currentObject);
			return;
		}

		if (!currentObject.sub) {
			// Current object doesnt support getting subpath
			handleError(notFound());
			return;
		}

		currentObject.sub(parts.shift(), function(err, obj) {
			if (!err && !obj) {
				err = notFound();
			}

			if (handleError(err)) {
				return;
			}

			restNext(obj);
		});
	}

	restNext(rootCollection);
}


/* Resource definers */
rest.resource = resource;
rest.arrayResource = arrayResource;
rest.objectResource = objectResource;
rest.mongooseResource = mongooseResource;


/* Response helpers */
rest.ResponseFile = utils.ResponseFile;
rest.ResponseBody = utils.ResponseBody;

module.exports = rest;