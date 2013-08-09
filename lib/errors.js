/*jshint node:true */
"use strict";

var errors = {
	created: { code: 201, body: "Created" },
	noContent: { code: 204, body: "" },
	notFound: { code: 404, body: "Not found" },
	methodNotAllowed: { code: 405, body: "Method not allowed" },
	notImplemented: { code: 501, body: "Not implemented"}
};

function HTTPError(code, message) {
	var err = new Error(message);
	err.code = code;

	return err;
}

Object.keys(errors).forEach(function(key) {
	HTTPError[key] = HTTPError.bind(null, errors[key].code, errors[key].body);
});

module.exports = HTTPError;