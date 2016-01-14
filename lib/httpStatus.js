/*jshint node:true */
"use strict";

var data = {
	created: { code: 201, body: "Created" },
	noContent: { code: 204, body: "" },
	badRequest: { code: 400, body: "Bad request" },
	unauthorized: {code: 401, body: "Unauthorized"},
	notFound: { code: 404, body: "Not found" },
	methodNotAllowed: { code: 405, body: "Method not allowed" },
	notImplemented: { code: 501, body: "Not implemented"}
};

function HTTPStatus(code, message) {
	var err = new Error(message);
	err.code = code;

	return err;
}

HTTPStatus.names = Object.keys(data);

HTTPStatus.names.forEach(function(key) {
	HTTPStatus[key] = HTTPStatus.bind(null, data[key].code, data[key].body);
});

module.exports = HTTPStatus;